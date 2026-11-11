#!/usr/bin/env bash
# Lancé chaque matin par cron : Claude Code (connecté à l'abonnement Claude de Sébastien) produit les vidéos du jour.
# Usage : ./produire.sh gta6-fr
set -uo pipefail
cd "$(dirname "$0")"
CHAINE="${1:-gta6-fr}"
JOUR=$(date +%F)
mkdir -p journaux brouillons sortie
set -a; [ -f .env ] && . ./.env; set +a      # clés (ElevenLabs, Upload-Post, Telegram, jeton Claude)
export BASH_DEFAULT_TIMEOUT_MS=900000 BASH_MAX_TIMEOUT_MS=1200000   # le rendu d'une vidéo prend plusieurs minutes
unset ANTHROPIC_API_KEY                       # garantit l'usage de l'abonnement Claude, pas d'une facture API
N=$(python3 -c "import json;print(json.load(open('chaines/$CHAINE.json'))['videos_par_jour'])")

OUTILS="Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(python3 valider_storyboard.py:*),Bash(./fabriquer.sh:*),Bash(python3 file_attente.py:*),Bash(cat:*),Bash(ls:*),Bash(tail:*)"

claude -p "Mission du $JOUR : produis $N vidéos pour la chaîne « $CHAINE » en suivant CLAUDE.md, de la veille jusqu'à la file d'attente." \
  --allowedTools "$OUTILS" --max-turns 150 > "journaux/$JOUR-$CHAINE.log" 2>&1
CODE=$?

if [ "${MODE_PUBLICATION:-}" = "programmer" ]; then   # Upload-Post publiera lui-même à l'heure prévue (sinon : « manuel » = vidéo envoyée sur Telegram)
  python3 publier.py programmer >> "journaux/$JOUR-$CHAINE.log" 2>&1
fi
python3 veto.py envoyer >> "journaux/$JOUR-$CHAINE.log" 2>&1
RESUME=$(tail -n 8 "journaux/$JOUR-$CHAINE.log")
if [ $CODE -ne 0 ]; then
  python3 veto.py message "⚠️ Usine $CHAINE : la production du $JOUR a échoué (code $CODE). Fin du journal :
$RESUME"
else
  python3 veto.py message "✅ Usine $CHAINE — production du $JOUR terminée.
$RESUME"
fi
