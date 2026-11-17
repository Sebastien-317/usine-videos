# Installe l'usine à vidéos sur ce PC Windows : Ubuntu (WSL), l'usine, et une tâche planifiée
# qui la lance une fois par jour quand le PC est allumé. Plus aucune minute GitHub Actions.
#
# À lancer dans PowerShell ouvert « en tant qu'administrateur » :
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\installer_usine_pc.ps1"
# Le script peut être relancé sans risque : il reprend là où il s'était arrêté.

$ErrorActionPreference = "Stop"
$Distro = "Ubuntu-24.04"
$Depot = "Sebastien-317/usine-videos"
$Dossier = Join-Path $env:LOCALAPPDATA "UsineVideos"

function Etape($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Wsl([string]$cmd) {
    wsl.exe -d $script:Distro -- bash -lc $cmd
    if ($LASTEXITCODE -ne 0) { throw "Étape en échec ($cmd). Corrige le problème affiché au-dessus puis relance le script." }
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Ouvre PowerShell en tant qu'administrateur (clic droit sur PowerShell > Exécuter en tant qu'administrateur), puis relance ce script." -ForegroundColor Yellow
    exit 1
}

Etape "1/6 Ubuntu dans Windows (WSL)"
$distros = @()
try { $distros = @((wsl.exe -l -q 2>$null) -replace "`0", "" | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } catch {}
if (-not ($distros -contains $Distro)) {
    $autre = $distros | Where-Object { $_ -like "Ubuntu*" } | Select-Object -First 1
    if ($autre) { $Distro = $autre }
    else {
        wsl.exe --install -d $Distro
        Write-Host "`nUbuntu est en cours d'installation." -ForegroundColor Yellow
        Write-Host "- Si Windows demande de redémarrer : redémarre."
        Write-Host "- Ouvre ensuite « Ubuntu » depuis le menu Démarrer et choisis un nom d'utilisateur et un mot de passe (retiens-le)."
        Write-Host "- Puis relance ce script."
        exit 0
    }
}
$Utilisateur = ((wsl.exe -d $Distro -- whoami) -join "").Trim()
if ($Utilisateur -eq "root" -or -not $Utilisateur) {
    Write-Host "Ouvre « $Distro » depuis le menu Démarrer pour créer ton utilisateur Ubuntu, puis relance ce script." -ForegroundColor Yellow
    exit 0
}
Write-Host "Ubuntu prêt ($Distro, utilisateur $Utilisateur). Ubuntu te demandera parfois ton mot de passe (sudo)."
$Usine = "\\wsl.localhost\$Distro\home\$Utilisateur\usine-videos"

Etape "2/6 Récupération de l'usine depuis GitHub (une page de connexion GitHub peut s'ouvrir)"
Wsl "command -v gh >/dev/null && command -v git >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq gh git)"
Wsl "gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web"
Wsl "gh auth setup-git && ([ -d ~/usine-videos/.git ] || gh repo clone $Depot ~/usine-videos)"
Wsl "cd ~/usine-videos && git pull -q --rebase --autostash && git config user.name 'usine-pc' && git config user.email 'usine-pc@users.noreply.github.com' && chmod +x pc/lancer.sh produire.sh fabriquer.sh"

Etape "3/6 Outils de l'usine : ffmpeg, Python, Node, moteur de rendu, Claude Code (10 à 20 minutes)"
Wsl "cd ~/usine-videos && command -v claude >/dev/null && [ -d rendu/node_modules ] && [ -d models/sherpa-onnx-whisper-small ] && echo 'déjà installé' || bash installer.sh"

Etape "4/6 Connexion de l'usine à ton abonnement Claude"
if ((wsl.exe -d $Distro -- bash -lc "grep -q '^CLAUDE_CODE_OAUTH_TOKEN=..' ~/usine-videos/.env && echo ok") -ne "ok") {
    Write-Host "Une page va s'ouvrir pour connecter Claude Code à ton abonnement. À la fin, un jeton (sk-ant-oat…) s'affiche ici : copie-le."
    Wsl "cd ~/usine-videos && claude setup-token"
} else { Write-Host "Jeton Claude déjà présent." }

Etape "5/6 Tes clés (fichier .env)"
Write-Host "Le Bloc-notes s'ouvre sur le fichier .env. Colle le jeton Claude et tes clés :"
Write-Host "  - CLAUDE_CODE_OAUTH_TOKEN : le jeton de l'étape 4"
Write-Host "  - ELEVENLABS_API_KEY : ElevenLabs > Profil > API Keys (tu peux en créer une nouvelle)"
Write-Host "  - PIXABAY_API_KEY : pixabay.com/api/docs, connecté à ton compte (la clé y est affichée)"
Write-Host "  - TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID : les mêmes qu'avant (@BotFather > /mybots > API Token)"
Write-Host "Enregistre (Ctrl+S) puis ferme le Bloc-notes pour continuer."
Start-Process notepad.exe "$Usine\.env" -Wait
Wsl "cd ~/usine-videos && sed -i 's/\r`$//' .env && chmod 600 .env"

Etape "6/6 Tâche planifiée « Usine vidéos » (chaque jour à 9 h, ou dès que le PC s'allume après 9 h)"
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
Copy-Item "$Usine\pc\lancer.ps1" (Join-Path $Dossier "lancer.ps1") -Force
$moi = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dossier\lancer.ps1`" -Distro $Distro"
$quotidien = New-ScheduledTaskTrigger -Daily -At 9:00
$session = New-ScheduledTaskTrigger -AtLogOn -User $moi
$session.Delay = "PT10M"
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4) -MultipleInstances IgnoreNew
$qui = New-ScheduledTaskPrincipal -UserId $moi -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "Usine vidéos" -Action $action -Trigger @($quotidien, $session) -Settings $reglages -Principal $qui `
    -Description "Usine à vidéos GTA 6 : produit les vidéos du jour une fois par jour, sur ce PC (aucune minute GitHub Actions)." -Force | Out-Null

Write-Host "`nInstallation terminée." -ForegroundColor Green
Write-Host "L'usine tournera chaque jour à 9 h, ou à l'allumage du PC si 9 h est passé (une seule fois par jour)."
Write-Host "Les vidéos arrivent sur Telegram comme avant. Journal : $Usine\journaux\pc.log"
Write-Host "Mettre en pause : Disable-ScheduledTask 'Usine vidéos'   |   Reprendre : Enable-ScheduledTask 'Usine vidéos'"
$rep = Read-Host "`nLancer une première production maintenant ? (o/n)"
if ($rep -match "^[oOyY]") {
    Start-ScheduledTask -TaskName "Usine vidéos"
    Write-Host "Production lancée en arrière-plan (30 à 60 minutes). Tu recevras le rapport sur Telegram."
}
