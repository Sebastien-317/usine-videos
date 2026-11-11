#!/usr/bin/env bash
# Installation complète de l'usine sur un serveur Ubuntu 24.04 (mini-PC ou serveur loué).
# À lancer une fois, depuis le dossier usine/ : bash installer.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/6 Paquets système"
sudo apt-get update
sudo apt-get install -y ffmpeg python3-pip curl wget bzip2 fonts-inter
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y /tmp/chrome.deb

echo "== 2/6 Python"
pip install --break-system-packages kokoro-onnx soundfile sherpa-onnx requests numpy

echo "== 3/6 Modèles (voix de secours + contrôle de la voix)"
mkdir -p models && cd models
[ -f kokoro-v1.0.onnx ] || wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
[ -f voices-v1.0.bin ] || wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
[ -d sherpa-onnx-whisper-small ] || { wget -q https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2 && tar xjf sherpa-onnx-whisper-small.tar.bz2 && rm sherpa-onnx-whisper-small.tar.bz2; }
cd ..

echo "== 4/6 Moteur de rendu"
(cd rendu && npm install)

echo "== 5/6 Claude Code (le pilote)"
sudo npm install -g @anthropic-ai/claude-code
echo "   → lance maintenant : claude setup-token   (connexion à ton abonnement Claude, jeton valable 1 an)"
echo "   → puis colle le jeton dans .env à la ligne CLAUDE_CODE_OAUTH_TOKEN="

echo "== 6/6 Fichiers de configuration"
[ -f .env ] || cp .env.exemple .env && chmod 600 .env
chmod +x fabriquer.sh produire.sh
mkdir -p journaux brouillons sortie file_attente
sed -i "s#^USINE=.*#USINE=$(pwd)#" crontab.txt

echo
echo "Installation terminée. Reste à faire (voir MISE_EN_SERVICE.md) :"
echo "  1. remplir .env (ElevenLabs, Upload-Post, Telegram, jeton Claude)"
echo "  2. test : ./produire.sh gta6-fr"
echo "  3. activer l'automatisation : crontab crontab.txt"
