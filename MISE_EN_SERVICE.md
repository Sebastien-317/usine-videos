# Mise en service de l'usine — sans serveur (GitHub Actions)

**Phase 1 (démarrage) — mode « manuel » :** chaque matin, les 2 vidéos prêtes à poster (fichier de moins de 48 Mo) et leurs légendes arrivent sur Telegram. Tu les publies toi-même depuis ton téléphone, avec un son tendance. Il suffit de 3 secrets (Claude, ElevenLabs, Telegram) et Upload-Post n'est pas nécessaire.

**Phase 2 — mode « programmer » :** Upload-Post publie seul à 12 h 30 et 19 h. Il faut ajouter le secret Upload-Post, passer `MODE_PUBLICATION: programmer` dans `production.yml` et réactiver l'horaire de `veto.yml`.

GitHub prête gratuitement des ordinateurs dans le cloud qui s'allument à heure fixe, exécutent l'usine, puis s'éteignent. Tu n'as rien à acheter ni à laisser allumé.

## Comment ça tourne
| Quand (heure de Paris, hiver) | Quoi |
|---|---|
| 7 h 12 | Claude (Claude Code, connecté à ton abonnement) fait la veille et écrit puis vérifie 2 scripts. Il fabrique ensuite les vidéos (voix ElevenLabs, 3D, son) et les programme chez Upload-Post pour 12 h 30 et 19 h. Les aperçus arrivent sur Telegram. |
| 9 h, 10 h 30, 11 h 15, 16 h, 18 h | Lecture de tes réponses Telegram : un bouton **Annuler** supprime la publication programmée, « stop » met tout en pause. |
| 12 h 30 et 19 h | Upload-Post publie sur TikTok et Instagram avec le label « contenu IA ». Aucun ordinateur n'a besoin d'être allumé. |

**Pour annuler à coup sûr :** avant 11 h pour la vidéo de midi, avant 17 h 30 pour celle du soir. Les horaires GitHub peuvent prendre quelques minutes de retard, et ils glissent d'une heure en été.

**Consommation :** environ 30 minutes de machine par jour, soit à peu près 1 000 minutes par mois. L'offre gratuite de GitHub couvre environ 2 000 minutes par mois sur un dépôt privé.

## Ce qu'il te faut (une fois)
1. **Un dépôt GitHub privé** `usine-videos` contenant ce dossier. Claude peut le créer et tout y installer.
2. **5 secrets**, dans GitHub → le dépôt → Settings → Secrets and variables → Actions → New repository secret. Ne les donne jamais par chat.
   - `CLAUDE_CODE_OAUTH_TOKEN` : sur ton PC, installe Claude Code (`npm install -g @anthropic-ai/claude-code`), lance `claude setup-token`, valide dans le navigateur et copie le jeton (valable 1 an). C'est ton abonnement Claude qui est utilisé, pas une facture API.
   - `ELEVENLABS_API_KEY` : ElevenLabs → Profil → API Keys.
   - `UPLOAD_POST_API_KEY` : Upload-Post → API Keys. Crée aussi un profil nommé `gta6-fr` et connecte-y les comptes TikTok et Instagram de la chaîne.
   - `TELEGRAM_BOT_TOKEN` : dans Telegram, écris à **@BotFather**, tape `/newbot` et copie le jeton.
   - `TELEGRAM_CHAT_ID` : envoie un message à ton bot, ouvre `https://api.telegram.org/bot<JETON>/getUpdates` et copie le nombre `"chat":{"id": …}`.
3. **Premier essai** : onglet **Actions** du dépôt → « Production quotidienne » → **Run workflow**. Environ 30 minutes plus tard, les aperçus arrivent sur Telegram.

Ensuite, tout est automatique.

## Variante avec une machine allumée en permanence (si un jour tu en as une)
Lancer `bash installer.sh`, remplir `.env`, puis `crontab crontab.txt`. Dans ce mode, `publier.py` publie lui-même à l'heure prévue et le veto est lu toutes les 5 minutes.

## Ajouter une chaîne
Copier `chaines/gta6-fr.json` sous un nouveau nom, puis changer :
- le thème, le public, la voix, les sources, les hashtags et les horaires ;
- le profil Upload-Post.

Ajouter ensuite une ligne `./produire.sh <nouvel-id>` dans `.github/workflows/production.yml`.
