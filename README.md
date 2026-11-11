# Usine à vidéos courtes — v0.4 (automatisée, pilotée par Claude)

Un moteur commun, plusieurs chaînes. Chaque vidéo part d'un **storyboard JSON** (texte dit, type de scène, chiffres, source) ; le moteur fait le reste.

## Ce qui marche déjà (testé le 11/11/2026)

| Étape | Fichier | Outil | Coût |
|---|---|---|---|
| Voix fournie (ElevenLabs, enregistrement perso…) | `caler_voix.py` | Repère les silences, place les coupures de scènes et les sous-titres (testé : coupures à ±0,1 s) | 0 € |
| Voix ElevenLabs par API | `voix_elevenlabs.py` | Clé `ELEVENLABS_API_KEY`, voix et modèle réglés dans la chaîne (non testé ici, pas d'accès réseau) | dès 6 $/mois |
| Voix off française (secours) | `tts.py` | Kokoro (local, licence Apache 2.0) + dictionnaire de prononciation par chaîne | 0 € |
| Contrôle de la voix | `verif_voix.py` | Whisper (sherpa-onnx, local) : compare le texte prévu et le texte entendu | 0 € |
| Habillage sonore | `mix.py` | Nappe + bruitages générés par code (aucun son sous licence), mixage à -14 LUFS | 0 € |
| Motion design v1 | `rendu/src/Video.tsx` | Remotion : 4 gabarits (accroche, chiffre, frise, relance) + sous-titres mot à mot | 0 € |
| 3D pixelisée v2 | `rendu/src/monde.ts` + `Viral.tsx` | Three.js low-poly rendu en 270×480 puis tramé (look console 2000) : 9 plans (avenue, vue aérienne, tour de boîtes, autoroute de nuit, mur d'écrans, pluie de billets, pièce d'or, plage ×2), textes animés, tampons, question finale, sous-titres TikTok | 0 € |
| Chaîne complète | `fabriquer.sh` | storyboard → vidéo 1080×1920 prête à publier | 0 € |

Temps de fabrication observé sur une machine à 2 cœurs : environ 30 s de voix + 5 à 6 min de rendu pour 35 s de vidéo.


## Pilotage automatique (v0.4)
| Rôle | Fichier |
|---|---|
| Manuel du pilote (Claude Code, lu à chaque lancement) | `CLAUDE.md` |
| Lancement quotidien du pilote + rapport Telegram | `produire.sh` |
| Contrôle qualité bloquant des storyboards | `valider_storyboard.py` |
| Réglages d'une chaîne (thème, voix, horaires, plans, interdits) | `chaines/gta6-fr.json` |
| File d'attente + mémoire des sujets traités | `file_attente.py`, `historique.jsonl` |
| Mode veto sur téléphone (bouton Annuler, « stop », « reprise ») | `veto.py` |
| Publication TikTok + Instagram avec label IA | `publier.py` |
| Planification | `crontab.txt` |
| Installation / mise en service | `installer.sh`, `MISE_EN_SERVICE.md`, `.env.exemple` |

Testé à blanc le 11/11/2026 : storyboard → validation → voix fournie → rendu → file d'attente → aperçu veto → publication (mode test, sans réseau).
Non testé ici (pas d'accès réseau) : appels réels à ElevenLabs, Upload-Post, Telegram et Claude Code ; à valider au premier lancement sur le serveur.

## Format du storyboard

- `chaine` : nom, langue, voix, vitesse, couleurs, `prononciation` (ex. `"GTA 6": "gé-té-a sisse"`).
- `composition` : `Video` (motion design v1) ou `Viral` (3D pixelisée v2).
- `scenes[]` (v2) : `voix`, `plans` (un ou plusieurs plans 3D), `seed`, et au choix `gros` (texte choc, `|` = retour à la ligne), `compteur` {valeur, prefixe, suffixe, label}, `tampon` + `tamponA` (secondes), `question` {texte, bulle}.
- `scenes[]` (v1) : `type` (accroche | chiffre | frise | relance), `voix`, puis les champs du gabarit.
  - Dans `texte`, un mot entre `*astérisques*` passe en couleur d'accent.
- `legende` : la légende du post.

Nouvelle chaîne = nouveau storyboard avec d'autres couleurs, une autre voix et un autre nom. Aucun code à toucher.

## À brancher ensuite

1. **Veille** : flux RSS et Reddit par chaîne, sans doublons.
2. **Scénariste** : l'API Claude remplit le storyboard JSON, puis une seconde passe critique note l'accroche et le rythme, vérifie que chaque chiffre a une source et fait réécrire sous le seuil.
3. **Voix premium** : Google Cloud TTS Chirp 3 HD (1 million de caractères gratuits par mois), Kokoro restant en secours.
4. **Publication** : Upload-Post (TikTok, Instagram, YouTube), avec le label « contenu IA ».
5. **Planification** : cron sur l'OptiPlex + « mode veto » (aperçu le matin, publication à midi sauf refus).
6. **Stats** : retour des vues et de la rétention pour privilégier les gabarits qui marchent.

## Installation sur l'OptiPlex (Ubuntu)

```bash
sudo apt install ffmpeg python3-pip nodejs npm   # + Google Chrome (.deb officiel)
pip install kokoro-onnx soundfile sherpa-onnx
mkdir -p models && cd models
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2 && tar xjf sherpa-onnx-whisper-base.tar.bz2
cd ../rendu && npm install
cd .. && ./fabriquer.sh storyboard_gta6.json sortie_gta6/
```

## Règles de contenu (chaîne GTA 6)

Aucune image officielle, aucun logo, aucun personnage, aucune image IA « façon GTA ». Seulement des faits sourcés, mis en scène avec nos propres visuels.
