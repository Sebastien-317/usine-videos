"""Mode veto par Telegram : chaque vidéo arrive sur ton téléphone avec un bouton « Annuler ».
Sans réponse de ta part, elle part à l'heure prévue.

python veto.py envoyer      → envoie les aperçus pas encore envoyés
python veto.py lire         → traite tes réponses (bouton Annuler, ou messages « stop » / « reprise »)
python veto.py message "…"  → t'envoie un message (rapport, alerte)
Variables (.env) : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. Option --test : n'appelle pas Telegram.
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import requests

from config import env
from file_attente import FILE, PAUSE, charger, changer_etat, elements, sauver

TEST = "--test" in sys.argv


def chat():
    return "TEST" if TEST else env("TELEGRAM_CHAT_ID")
OFFSET = FILE / ".telegram_offset"


def api(methode, **kw):
    if TEST:
        print(f"[test] Telegram {methode}", {k: (v if k != "files" else list(v)) for k, v in kw.items() if k != "files"})
        return {"ok": True, "result": []}
    r = requests.post(f"https://api.telegram.org/bot{env('TELEGRAM_BOT_TOKEN')}/{methode}", timeout=120, **kw)
    r.raise_for_status()
    return r.json()


def version_publication(d):
    """Copie de la vidéo sous 48 Mo (limite Telegram des bots), en qualité de publication."""
    sortie = d / "publication.mp4"
    for debit in ("9M", "6M", "4M"):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "video.mp4"), "-c:v", "libx264", "-preset", "veryfast",
                        "-b:v", debit, "-maxrate", debit, "-bufsize", "18M", "-c:a", "aac", "-b:a", "160k",
                        "-movflags", "+faststart", str(sortie)], check=True)
        if sortie.stat().st_size < 48_000_000:
            return sortie
    return sortie


def envoyer_manuel():
    """Mode « publication à la main » : la vidéo prête à poster + la légende à copier, sur ton téléphone."""
    for d in elements():
        st = charger(d)
        if st["veto_envoye"] or st["etat"] != "en_attente":
            continue
        quand = datetime.fromisoformat(st["heure_publication"])
        fichier = version_publication(d)
        with open(fichier, "rb") as f:
            api("sendVideo", data={"chat_id": chat(), "supports_streaming": "true",
                                   "caption": f"📲 À publier le {quand:%d/%m} vers {quand:%H:%M} : {st['titre']}"}, files={"video": f})
        message(st["legende"])
        message("Avant de publier :\n"
                "• TikTok : ajoute un son tendance à faible volume (sous la voix) et active « Contenu généré par l'IA ».\n"
                "• Instagram : même vidéo en Reel, avec l'étiquette « Créé avec l'IA ».\n"
                "• Colle la légende ci-dessus.")
        st["veto_envoye"] = True
        sauver(d, st)
        print("vidéo envoyée pour publication manuelle :", st["id"], f"({fichier.stat().st_size / 1e6:.1f} Mo)")


def envoyer():
    if os.environ.get("MODE_PUBLICATION") == "manuel":
        return envoyer_manuel()
    for d in elements():
        st = charger(d)
        if st["veto_envoye"] or st["etat"] not in ("en_attente", "programme"):
            continue
        quand = datetime.fromisoformat(st["heure_publication"])
        legende = (f"🎬 {st['titre']}\nPublication le {quand:%d/%m à %H:%M} sur {', '.join(st['plateformes'])}.\n"
                   f"Sans réponse de ta part, elle part toute seule.\n\nLégende : {st['legende'][:700]}")
        clavier = {"inline_keyboard": [[{"text": "❌ Annuler cette vidéo", "callback_data": f"annuler:{st['id']}"}]]}
        with open(d / "apercu.mp4", "rb") as f:
            api("sendVideo", data={"chat_id": chat(), "caption": legende, "supports_streaming": "true",
                                   "reply_markup": json.dumps(clavier)}, files={"video": f})
        st["veto_envoye"] = True
        sauver(d, st)
        print("aperçu envoyé :", st["id"])


def lire():
    offset = int(OFFSET.read_text()) if OFFSET.exists() else 0
    maj = api("getUpdates", data={"offset": offset, "timeout": 0}).get("result", [])
    for u in maj:
        offset = u["update_id"] + 1
        cb = u.get("callback_query")
        if cb and cb.get("data", "").startswith("annuler:"):
            vid = cb["data"].split(":", 1)[1]
            ok = (FILE / vid).exists() and annuler(vid)
            api("answerCallbackQuery", data={"callback_query_id": cb["id"], "text": "Annulée ✅" if ok else "Déjà publiée"})
            print("veto :", vid, "annulée" if ok else "trop tard")
        texte = (u.get("message") or {}).get("text", "").strip().lower()
        if texte == "stop":
            PAUSE.touch()
            for d in elements():
                if charger(d)["etat"] == "programme":
                    annuler(d.name)
            message("⏸ Publications en pause. Envoie « reprise » pour relancer.")
        elif texte == "reprise":
            PAUSE.unlink(missing_ok=True)
            message("▶️ Publications reprises.")
    OFFSET.write_text(str(offset))


def annuler(vid):
    from publier import annuler_programmation
    st = charger(FILE / vid)
    if st["etat"] == "programme" and not annuler_programmation(st):
        return False
    return changer_etat(vid, "annule", "(veto Telegram)")


def message(texte):
    api("sendMessage", data={"chat_id": chat(), "text": texte})


if __name__ == "__main__":
    {"envoyer": envoyer, "lire": lire}.get(sys.argv[1], lambda: message(sys.argv[2]))()
