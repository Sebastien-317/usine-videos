#!/usr/bin/env bash
# Usine sur le PC de Sébastien (WSL Ubuntu) : lancé par le Planificateur de tâches Windows
# à l'ouverture de session et chaque jour à 9 h. Produit les vidéos du jour UNE seule fois par jour.
# Aucune minute GitHub Actions : GitHub ne sert plus qu'à sauvegarder l'historique (git push, gratuit).
set -uo pipefail
cd "$(dirname "$0")/.."
export TZ=Europe/Paris
CHAINE="${1:-gta6-fr}"
JOUR=$(date +%F)
FAIT="$HOME/.usine-fait-$JOUR-$CHAINE"
mkdir -p journaux

exec 9>/tmp/usine-videos.lock
flock -n 9 || { echo "$(date '+%F %T') production déjà en cours"; exit 0; }
[ -f "$FAIT" ] && { echo "$(date '+%F %T') vidéos du $JOUR déjà produites"; exit 0; }
[ -f pc/PAUSE ] && { echo "$(date '+%F %T') usine en pause (fichier pc/PAUSE)"; exit 0; }

echo "$(date '+%F %T') début de la production du $JOUR"
git pull -q --rebase --autostash || echo "git pull impossible : on continue avec la version locale"
touch "$FAIT"                       # même en cas d'échec : pas de nouvel essai en boucle à chaque ouverture de session
./produire.sh "$CHAINE"             # rapport (réussite ou échec) envoyé sur Telegram par produire.sh

for f in historique.jsonl file_attente journaux brouillons bibliotheque/pixabay_utilises.json; do [ -e "$f" ] && git add "$f"; done
git commit -qm "Production du $JOUR (PC)" && { git push -q || echo "sauvegarde GitHub impossible : tout reste sur le PC"; }
find "$HOME" -maxdepth 1 -name '.usine-fait-*' -mtime +7 -delete 2>/dev/null
echo "$(date '+%F %T') fin"
