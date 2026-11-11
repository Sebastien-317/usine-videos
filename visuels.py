"""Prépare les images de fond d'une vidéo « Doc » : vraies vidéos (Pixabay), plans officiels, ou 3D maison.

Chaque scène du storyboard liste ses visuels, dans l'ordre où ils doivent apparaître :
  "pixabay:hacker dark room"   -> recherche Pixabay (mots-clés en anglais), clip libre de droits
  "officiel:t2-037"            -> plan de la bibliothèque des vidéos officielles (bibliotheque/catalogue.json)
  "3d:rue_neon"                -> plan 3D généré par le moteur
Le moteur coupe toutes les ~1,7 s et alterne ces visuels. Chaque morceau est recadré en 1080×1920,
étalonné (contraste, couleurs froides dans les ombres, vignette) et coupé à la bonne durée.

Usage : python3 visuels.py storyboard.json sortie/  (après le calage de la voix : il lit sortie/timing.json)
Sortie : sortie/storyboard_rendu.json (storyboard + découpage) et rendu/public/clips/<nom>/…
Sans clé Pixabay ou sans résultat, le visuel est remplacé par un plan 3D : la vidéo se fabrique toujours.
"""
import hashlib
import json
import math
import os
import random
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ICI = Path(__file__).parent
FPS = 30
SEG = 1.7  # secondes par plan
CACHE = ICI / "cache_visuels"
UTILISES = ICI / "bibliotheque" / "pixabay_utilises.json"
REPLI_3D = ["rue_neon", "poursuite_nuit", "helico_nuit", "autoroute_nuit", "vue_aerienne", "avenue_coucher"]
ETALONNAGE = ("eq=contrast=1.12:saturation=0.8:brightness=-0.035,"
              "colorbalance=rs=-0.04:bs=0.05:rh=0.05:bh=-0.04,vignette=angle=PI/4.6")


def journal(*a):
    print("[visuels]", *a, flush=True)


def ffprobe(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", str(f)], capture_output=True, text=True)
    d = json.loads(r.stdout or "{}")
    s = (d.get("streams") or [{}])[0]
    return float(d.get("format", {}).get("duration", 0) or 0), s.get("width", 0), s.get("height", 0)


def recadrer(src, dest, debut, duree, dispo):
    """Recadre en 1080×1920, étalonne, coupe ; prolonge la dernière image si la source est trop courte."""
    manque = max(0.0, duree - max(0.0, dispo - debut))
    vf = f"scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920,fps={FPS},{ETALONNAGE}"
    if manque > 0.02:
        vf += f",tpad=stop_mode=clone:stop_duration={manque + 0.1:.2f}"
    tmp = dest.with_suffix(".tmp.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{debut:.2f}", "-i", str(src), "-t", f"{duree:.3f}", "-vf", vf,
                    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", str(tmp)], check=True)
    tmp.rename(dest)


class Pixabay:
    def __init__(self, graine):
        self.cle = os.environ.get("PIXABAY_API_KEY", "")
        self.rng = random.Random(graine)
        self.deja = set(json.loads(UTILISES.read_text())) if UTILISES.exists() else set()
        self.cette_video = set()

    def chercher(self, q):
        if not self.cle:
            return []
        url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode(
            {"key": self.cle, "q": q[:100], "per_page": 30, "safesearch": "true", "video_type": "film"})
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read()).get("hits", [])
        except Exception as e:  # réseau, quota, clé : on se rabat sur la 3D
            journal("recherche impossible", q, e)
            return []

    def clip(self, q, duree):
        """Renvoie (fichier, durée dispo) pour une recherche, en évitant les clips déjà vus récemment."""
        hits = self.chercher(q)
        if not hits and " " in q:
            hits = self.chercher(" ".join(q.split()[:2]))
        def score(h):
            v = h["videos"].get("medium") or {}
            vertical = 2 if v.get("height", 0) > v.get("width", 1) else 0
            neuf = 0 if h["id"] in self.deja else 3
            assez = 1 if h.get("duration", 0) >= duree + 0.5 else 0
            return vertical + neuf + assez + self.rng.random() * 1.5
        hits = [h for h in hits if h["id"] not in self.cette_video and (h["videos"].get("medium") or {}).get("url")]
        if not hits:
            return None
        h = max(hits[:20], key=score)
        self.cette_video.add(h["id"])
        CACHE.mkdir(exist_ok=True)
        f = CACHE / f"pixabay-{h['id']}.mp4"
        if not f.exists():
            v = h["videos"]["medium"]
            try:
                req = urllib.request.Request(v["url"], headers={"User-Agent": "usine-videos"})
                with urllib.request.urlopen(req, timeout=120) as r, open(f, "wb") as o:
                    shutil.copyfileobj(r, o)
            except Exception as e:
                journal("téléchargement impossible", h["id"], e)
                return None
        return f, h["id"]

    def memoriser(self):
        if self.cette_video:
            UTILISES.parent.mkdir(exist_ok=True)
            tout = list(self.deja | self.cette_video)[-600:]  # environ 2 semaines de vidéos
            UTILISES.write_text(json.dumps(sorted(tout)))


def officiel(pid):
    cat_f = ICI / "bibliotheque" / "catalogue.json"
    if not cat_f.exists():
        return None
    cat = json.loads(cat_f.read_text())
    p = next((x for x in cat["plans"] if x["id"] == pid), None)
    if not p:
        return None
    src = ICI / "bibliotheque" / "sources" / f"{p['video']}.mp4"
    return (src, p) if src.exists() else None


def main():
    story_f, out = Path(sys.argv[1]), Path(sys.argv[2])
    story = json.loads(story_f.read_text())
    timing = json.loads((out / "timing.json").read_text())
    total = math.ceil(timing["duree"] * FPS)
    nom = out.resolve().name
    pub = ICI / "rendu" / "public" / "clips" / nom
    shutil.rmtree(pub, ignore_errors=True)
    pub.mkdir(parents=True)
    graine = int(hashlib.md5(nom.encode()).hexdigest()[:8], 16)
    px = Pixabay(graine)
    rng = random.Random(graine)
    debuts = [0] + [round(s["debut"] * FPS) for s in timing["scenes"][1:]]
    for i, sc in enumerate(story["scenes"]):
        dur = (debuts[i + 1] if i + 1 < len(debuts) else total) - debuts[i]
        n = max(1, round(dur / (SEG * FPS)))
        part = dur // n
        vis = sc.get("visuels") or [f"3d:{p}" for p in sc.get("plans", [])] or ["3d:rue_neon"]
        segs = []
        for k in range(n):
            d = dur - part * (n - 1) if k == n - 1 else part
            v = vis[k % len(vis)]
            typ, _, val = v.partition(":")
            seg = None
            dest = pub / f"s{i:02d}_{k}.mp4"
            if typ == "pixabay":
                r = px.clip(val, d / FPS)
                if r:
                    f, hid = r
                    dispo, _, _ = ffprobe(f)
                    debut = rng.uniform(0, max(0.0, dispo - d / FPS - 0.3))
                    try:
                        recadrer(f, dest, debut, d / FPS + 0.05, dispo)
                        seg = {"type": "video", "src": f"clips/{nom}/{dest.name}", "duree": d, "source": f"pixabay {hid}"}
                    except subprocess.CalledProcessError as e:
                        journal("recadrage impossible", f, e)
            elif typ == "officiel":
                r = officiel(val)
                if r:
                    src, p = r
                    debut = p["debut"] + 0.12
                    try:
                        recadrer(src, dest, debut, d / FPS + 0.05, p["fin"])
                        seg = {"type": "video", "src": f"clips/{nom}/{dest.name}", "duree": d, "source": val}
                    except subprocess.CalledProcessError as e:
                        journal("recadrage impossible", val, e)
                else:
                    journal("plan officiel introuvable :", val)
            if seg is None:
                plan = val if typ == "3d" else REPLI_3D[(i + k) % len(REPLI_3D)]
                seg = {"type": "3d", "plan": plan, "duree": d}
                if typ != "3d":
                    journal(f"scène {i + 1} : « {v} » remplacé par la 3D {plan}")
            segs.append(seg)
        sc["segments"] = segs
        journal(f"scène {i + 1} :", ", ".join(s.get("source", "3d " + s.get("plan", "")) for s in segs))
    px.memoriser()
    story["clips"] = nom
    (out / "storyboard_rendu.json").write_text(json.dumps(story, ensure_ascii=False, indent=1))
    journal("prêt :", out / "storyboard_rendu.json")


if __name__ == "__main__":
    main()
