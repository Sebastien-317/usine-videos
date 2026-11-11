"""File d'attente des vidéos prêtes à publier.

python file_attente.py ajouter <dossier_sortie> <chaines/x.json> <n°_créneau>   (0 = 1er horaire du jour)
python file_attente.py lister
python file_attente.py annuler <id>
python file_attente.py pause | reprise        (bloque / débloque toutes les publications)
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ICI = Path(__file__).parent
FILE = ICI / "file_attente"
PAUSE = FILE / "PAUSE"


def charger(d):
    return json.loads((d / "statut.json").read_text())


def sauver(d, st):
    (d / "statut.json").write_text(json.dumps(st, ensure_ascii=False, indent=1))


def elements():
    FILE.mkdir(exist_ok=True)
    return sorted((d for d in FILE.iterdir() if (d / "statut.json").exists()), key=lambda d: d.name)


def ajouter(sortie, chaine_path, creneau):
    sortie, ch = Path(sortie), json.loads(Path(chaine_path).read_text())
    story = json.loads((sortie / "storyboard.json").read_text())
    tz = ZoneInfo(ch["fuseau"])
    maintenant = datetime.now(tz)
    h, m = map(int, ch["horaires"][creneau % len(ch["horaires"])].split(":"))
    quand = maintenant.replace(hour=h, minute=m, second=0, microsecond=0)
    if quand <= maintenant + timedelta(minutes=20):  # créneau trop proche : le lendemain
        quand += timedelta(days=1)
    vid = f"{quand:%Y%m%d-%H%M}-{ch['id']}"
    d = FILE / vid
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy(sortie / "video.mp4", d / "video.mp4")
    shutil.copy(sortie / "storyboard.json", d / "storyboard.json")
    # aperçu léger pour le téléphone (Telegram limite les envois des bots à 50 Mo)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "video.mp4"), "-vf", "scale=540:-2", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", str(d / "apercu.mp4")], check=True)
    sauver(d, {
        "id": vid, "chaine": ch["id"], "titre": story["titre"], "legende": story["legende"],
        "heure_publication": quand.isoformat(), "fuseau": ch["fuseau"], "plateformes": ch["plateformes"], "upload_post_user": ch["upload_post_user"],
        "etat": "en_attente", "veto_envoye": False, "historique": [f"{maintenant:%Y-%m-%d %H:%M} ajoutée"],
    })
    with open(ICI / "historique.jsonl", "a") as h:  # mémoire des sujets traités, relue chaque matin par le pilote
        h.write(json.dumps({"date": f"{maintenant:%Y-%m-%d}", "chaine": ch["id"], "id": vid, "titre": story["titre"],
                            "sources": [s.get("fait") for s in story.get("sources", [])]}, ensure_ascii=False) + "\n")
    print(f"AJOUTÉE : {vid} — publication prévue le {quand:%d/%m à %H:%M}")
    return vid


def lister():
    for d in elements():
        st = charger(d)
        print(f"{st['id']:32} {st['etat']:12} {st['heure_publication'][:16]}  {st['titre']}")
    if PAUSE.exists():
        print("⚠ PAUSE active : aucune publication tant que « reprise » n'est pas lancé.")


def changer_etat(vid, etat, motif=""):
    d = FILE / vid
    st = charger(d)
    if st["etat"] == "publie":
        return False
    st["etat"] = etat
    st["historique"].append(f"{datetime.now():%Y-%m-%d %H:%M} {etat} {motif}".strip())
    sauver(d, st)
    return True


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "lister"
    if cmd == "ajouter":
        ajouter(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    elif cmd == "annuler":
        print("annulée" if changer_etat(sys.argv[2], "annule", "(manuel)") else "déjà publiée")
    elif cmd == "pause":
        FILE.mkdir(exist_ok=True)
        PAUSE.touch()
        print("pause activée")
    elif cmd == "reprise":
        PAUSE.unlink(missing_ok=True)
        print("publications reprises")
    else:
        lister()
