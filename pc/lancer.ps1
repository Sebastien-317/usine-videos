# Lancé par la tâche planifiée « Usine vidéos » : empêche la mise en veille du PC pendant la production,
# puis lance l'usine dans Ubuntu (WSL). Copié dans %LOCALAPPDATA%\UsineVideos par installer_usine_pc.ps1.
param([string]$Distro = "Ubuntu-24.04")
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[Win32.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED : pas de veille tant que l'usine tourne
try {
    wsl.exe -d $Distro -- bash -lc 'mkdir -p ~/usine-videos/journaux && ~/usine-videos/pc/lancer.sh >> ~/usine-videos/journaux/pc.log 2>&1'
} finally {
    [Win32.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null
}
