"""Bibliothèque des vidéos officielles (trailers GTA 6) : découpage en plans et planches contact.

Les fichiers vidéo sont fournis par Sébastien et rangés dans la release GitHub « bibliotheque » du dépôt
(nommés t1.mp4, t2.mp4, el.mp4…). Le workflow « Bibliothèque » les récupère et lance :
  python3 bibliotheque.py decouper   -> bibliotheque/catalogue.json + bibliotheque/planches/<id>-NN.jpg
Chaque plan a un identifiant court (ex. « t2-037 ») que le pilote cite dans ses storyboards.
La production n'en télécharge que les secondes utiles.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).parent / "bibliotheque"
SOURCES = RACINE / "sources"
PLANCHES = RACINE / "planches"

VIDEOS = [
    {"id": "t1", "titre": "Grand Theft Auto VI Trailer 1"},
    {"id": "t2", "titre": "Grand Theft Auto VI Trailer 2"},
    {"id": "el", "titre": "Grand Theft Auto VI: An Extended Look"},
]


def duree(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                capture_output=True, text=True).stdout)


def decouper():
    PLANCHES.mkdir(parents=True, exist_ok=True)
    cat = {"note": "Plans des vidéos officielles. Utilise l'identifiant (ex. t2-037) dans « visuels ».", "videos": {}, "plans": []}
    for v in VIDEOS:
        f = SOURCES / f"{v['id']}.mp4"
        if not f.exists():
            continue
        d = duree(f)
        r = subprocess.run(["ffmpeg", "-i", str(f), "-vf", "select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-"],
                           capture_output=True, text=True)
        coupes = [0.0] + [float(x) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)] + [d]
        plans = []
        for a, b in zip(coupes, coupes[1:]):
            if b - a >= 0.8:
                plans.append((a, b))
        cat["videos"][v["id"]] = {"titre": v["titre"], "duree": round(d, 2)}
        vignettes = []
        for k, (a, b) in enumerate(plans):
            pid = f"{v['id']}-{k:03d}"
            vig = PLANCHES / f"_{pid}.jpg"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{(a + b) / 2:.2f}", "-i", str(f), "-frames:v", "1",
                            "-vf", f"scale=320:180,drawtext=text='{pid}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7",
                            str(vig)], check=True)
            vignettes.append(vig)
            cat["plans"].append({"id": pid, "video": v["id"], "debut": round(a, 2), "fin": round(b, 2), "description": ""})
        # planches de 5 × 8 vignettes, lisibles d'un coup d'œil
        for p in range(0, len(vignettes), 40):
            lot = vignettes[p:p + 40]
            liste = RACINE / "_liste.txt"
            liste.write_text("".join(f"file '{x.resolve()}'\n" for x in lot))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(liste),
                            "-vf", "tile=5x8:padding=4:color=black", "-frames:v", "1",
                            str(PLANCHES / f"{v['id']}-{p // 40 + 1:02d}.jpg")], check=True)
            liste.unlink()
        for x in vignettes:
            x.unlink()
        print(v["id"], len(plans), "plans")
    (RACINE / "catalogue.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    {"decouper": decouper}[sys.argv[1]]()
