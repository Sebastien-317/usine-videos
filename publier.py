"""Publication TikTok + Instagram via Upload-Post, avec le label IA.

python publier.py programmer  → envoie tout de suite les vidéos en attente à Upload-Post avec leur date de publication
                                (Upload-Post publie lui-même à l'heure prévue : aucun ordinateur n'a besoin d'être allumé).
                                C'est le mode utilisé avec GitHub Actions.
python publier.py             → mode serveur : publie immédiatement ce qui arrive à échéance (cron toutes les 5 min).
Option --test : n'appelle pas Upload-Post. Variable : UPLOAD_POST_API_KEY.
"""
import sys
from datetime import datetime, timezone

import requests

from config import env
from file_attente import PAUSE, charger, changer_etat, elements, sauver

TEST = "--test" in sys.argv


def publier(d, st, programme=False):
    champs = [("user", st["upload_post_user"]), ("title", st["legende"]), ("async_upload", "true"),
              ("is_aigc", "true"), ("is_ai_generated", "true"), ("privacy_level", "PUBLIC_TO_EVERYONE"),
              ("media_type", "REELS"), ("share_to_feed", "true")]
    champs += [("platform[]", p) for p in st["plateformes"]]
    if programme:  # publication programmée : Upload-Post renvoie un job_id (pas d'envoi asynchrone)
        champs = [c for c in champs if c[0] != "async_upload"]
        quand = datetime.fromisoformat(st["heure_publication"])
        champs += [("scheduled_date", quand.strftime("%Y-%m-%dT%H:%M:%S")), ("timezone", st.get("fuseau", "Europe/Paris"))]
    if TEST:
        print("[test] POST https://api.upload-post.com/api/upload", dict(champs), "plateformes:", st["plateformes"])
        return {"success": True, "test": True}
    with open(d / "video.mp4", "rb") as f:
        r = requests.post("https://api.upload-post.com/api/upload", data=champs, files={"video": f}, timeout=600,
                          headers={"Authorization": f"Apikey {env('UPLOAD_POST_API_KEY')}", "Idempotency-Key": st["id"]})
    r.raise_for_status()
    return r.json()


def programmer():
    if PAUSE.exists():
        print("pause active : rien n'est programmé")
        return
    for d in elements():
        st = charger(d)
        if st["etat"] != "en_attente":
            continue
        try:
            rep = publier(d, st, programme=True)
            st = charger(d)
            st["reponse_upload_post"] = rep
            st["job_id"] = rep.get("job_id") or rep.get("request_id")
            sauver(d, st)
            changer_etat(st["id"], "programme")
            print("PROGRAMMÉE :", st["id"], "job", st["job_id"])
        except Exception as e:
            changer_etat(st["id"], "erreur", str(e)[:200])
            print("ERREUR :", st["id"], e)


def annuler_programmation(st):
    """Supprime une publication programmée chez Upload-Post (utilisé par le veto)."""
    if TEST or not st.get("job_id"):
        print("[test] DELETE schedule", st.get("job_id"))
        return True
    r = requests.delete(f"https://api.upload-post.com/api/uploadposts/schedule/{st['job_id']}", timeout=60,
                        headers={"Authorization": f"Apikey {env('UPLOAD_POST_API_KEY')}"})
    return r.ok


def main():
    if PAUSE.exists():
        print("pause active : rien n'est publié")
        return
    maintenant = datetime.now(timezone.utc)
    for d in elements():
        st = charger(d)
        if st["etat"] != "en_attente" or datetime.fromisoformat(st["heure_publication"]) > maintenant:
            continue
        try:
            rep = publier(d, st)
            st = charger(d)  # relire : un veto a pu arriver pendant l'envoi
            st["reponse_upload_post"] = rep
            sauver(d, st)
            changer_etat(st["id"], "publie")
            print("PUBLIÉE :", st["id"])
        except Exception as e:  # on retente au passage suivant, 3 fois maximum
            st = charger(d)
            st["erreurs"] = st.get("erreurs", 0) + 1
            sauver(d, st)
            if st["erreurs"] >= 3:
                changer_etat(st["id"], "erreur", str(e)[:200])
            print("ERREUR :", st["id"], e)


if __name__ == "__main__":
    programmer() if "programmer" in sys.argv else main()
