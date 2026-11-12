#!/usr/bin/env bash
# Fabrique une vidéo complète à partir d'un storyboard JSON.
# Usage : ./fabriquer.sh storyboard.json dossier_sortie/ [voix.mp3 | --apercu]
#   --apercu : voix + images de fond seulement, puis planche_visuels.jpg à vérifier (pas de rendu).
#   La voix ElevenLabs n'est regénérée que si le texte a changé (les crédits ne sont pas gaspillés).
set -euo pipefail
cd "$(dirname "$0")"
STORY="$(realpath "$1")"
OUT="$(realpath -m "$2")"
mkdir -p "$OUT"

MOTEUR=$(python3 -c "import json;print(json.load(open('$STORY'))['chaine'].get('moteur_voix','kokoro'))")
APERCU=""; [ "${3:-}" = "--apercu" ] && APERCU=1 && set -- "$1" "$2"
if [ -n "${3:-}" ]; then                         # 3e argument : un fichier audio fourni (prise ElevenLabs, enregistrement perso…)
  echo "1/5 voix fournie → calage";  python3 caler_voix.py "$3" "$STORY" "$OUT"
elif [ "$MOTEUR" = "elevenlabs" ]; then
  EMPREINTE=$(python3 -c "import json,hashlib;s=json.load(open('$STORY'));print(hashlib.md5(json.dumps([[x['voix'],x.get('voix_jeu','')] for x in s['scenes']]+[s['chaine']],ensure_ascii=False).encode()).hexdigest())")
  if [ -f "$OUT/voix_elevenlabs.mp3" ] && [ "$(cat "$OUT/.voix_empreinte" 2>/dev/null)" = "$EMPREINTE" ]; then
    echo "1/5 voix ElevenLabs déjà faite (texte inchangé) → calage"
  else
    echo "1/5 voix ElevenLabs";      python3 voix_elevenlabs.py "$STORY" "$OUT" && echo "$EMPREINTE" > "$OUT/.voix_empreinte"
  fi
  python3 caler_voix.py "$OUT/voix_elevenlabs.mp3" "$STORY" "$OUT"
else
  echo "1/5 voix off Kokoro";        python3 tts.py "$STORY" "$OUT"
fi
echo "2/5 contrôle de la voix";  python3 verif_voix.py "$OUT/voix.wav" "$OUT/timing.json" "$STORY" | grep -E "^(ATTENDU|ENTENDU)" > "$OUT/controle_voix.txt" || true
RENDU="$STORY"
COMPO=$(python3 -c "import json;print(json.load(open('$STORY')).get('composition',''))")
if [ "$COMPO" = "Doc" ]; then                    # vraies images : recherche, téléchargement, recadrage, étalonnage
  echo "2b/5 images de fond";    python3 visuels.py "$STORY" "$OUT"
  RENDU="$OUT/storyboard_rendu.json"
fi
if [ -n "$APERCU" ]; then
  echo "APERÇU prêt : regarde $OUT/planche_visuels.jpg (une vignette par plan) et $OUT/controle_voix.txt"
  exit 0
fi
echo "3/5 habillage sonore";     python3 mix.py "$RENDU" "$OUT"
D=$(python3 -c "import json;print(json.load(open('$OUT/timing.json'))['duree'])")
VOIX="$OUT/voix.wav"; [ -f "$OUT/voix_hd.wav" ] && VOIX="$OUT/voix_hd.wav"
ffmpeg -y -loglevel error -i "$VOIX" -i "$OUT/nappe.wav" -i "$OUT/bruitages.wav" -filter_complex \
  "[0:a]aresample=48000,apad,asplit=2[v][vk];[1:a]volume=0.42[n];[n][vk]sidechaincompress=threshold=0.02:ratio=6:attack=10:release=250[nd];[2:a]volume=0.55[s];[v][nd][s]amix=inputs=3:normalize=0:duration=longest,atrim=0:$D,loudnorm=I=-14:TP=-1.5:LRA=11[out]" \
  -map "[out]" -ar 48000 "$OUT/mix.wav"
echo "4/5 rendu image";          (cd rendu && node render.mjs "$RENDU" "$OUT/timing.json" "$OUT/video_muette.tmp.mp4")
rm -rf "rendu/public/clips/$(basename "$OUT")"
mv "$OUT/video_muette.tmp.mp4" "$OUT/video_muette.mp4"
echo "5/5 assemblage";           ffmpeg -y -loglevel error -i "$OUT/video_muette.mp4" -i "$OUT/mix.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/video.tmp.mp4"
mv "$OUT/video.tmp.mp4" "$OUT/video.mp4"
echo "OK → $OUT/video.mp4"
