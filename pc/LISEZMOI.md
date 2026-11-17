# L'usine sur le PC (sans GitHub Actions)

Depuis le 17/11/2026, l'usine ne tourne plus sur GitHub : elle tourne sur le PC Windows de Sébastien,
dans Ubuntu (WSL), lancée par le Planificateur de tâches. GitHub ne sert plus qu'à sauvegarder
l'historique (un `git push`, qui ne consomme aucune minute Actions).

## Installation (une fois)
1. Télécharger `pc/installer_usine_pc.ps1`.
2. Ouvrir PowerShell **en tant qu'administrateur** et lancer :
   `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\installer_usine_pc.ps1"`
3. Suivre les étapes : Ubuntu (redémarrage possible, puis relancer le script), connexion GitHub,
   outils (10 à 20 min), jeton Claude (`claude setup-token`), clés dans le Bloc-notes, tâche planifiée.

## Fonctionnement
- Tâche « Usine vidéos » : chaque jour à 9 h, et 10 min après l'ouverture de session si 9 h est passé.
- Une seule production par jour (`pc/lancer.sh`), le PC ne se met pas en veille pendant qu'elle tourne.
- Les vidéos et le rapport arrivent sur Telegram, comme avant.
- Journal : `journaux/pc.log` (dans Ubuntu : `~/usine-videos`).

## Pause / reprise
- `Disable-ScheduledTask 'Usine vidéos'` / `Enable-ScheduledTask 'Usine vidéos'` (PowerShell)
- ou créer le fichier `pc/PAUSE` dans le dossier de l'usine.
