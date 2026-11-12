"""Prépare les images de fond d'une vidéo « Doc » : vraies vidéos libres de droits (Pixabay), ou 3D maison.

Chaque scène du storyboard liste ses visuels, dans l'ordre où ils doivent apparaître :
  "pixabay:hacker dark room"   -> recherche Pixabay (mots-clés en anglais), clip libre de droits
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
from pathlib import Path

import requests

ICI = Path(__file__).parent
FPS = 30
SEG = 1.7  # secondes par plan
CACHE = ICI / "cache_visuels"
UTILISES = ICI / "bibliotheque" / "pixabay_utilises.json"
REPLI_3D = ["rue_neon", "poursuite_nuit", "helico_nuit", "autoroute_nuit", "vue_aerienne", "avenue_coucher"]
ENTETES = {"User-Agent": "usine-videos/1.0 (generateur de videos courtes; contact via github.com/Sebastien-317)"}
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
    def __init__(self, graine, nom):
        self.cle = os.environ.get("PIXABAY_API_KEY", "")
        self.rng = random.Random(graine)
        self.nom = nom
        # {id du clip: vidéo qui l'a utilisé} ; les clips de CETTE vidéo ne comptent pas (aperçu puis fabrication = mêmes choix)
        self.registre = json.loads(UTILISES.read_text()) if UTILISES.exists() else {}
        if isinstance(self.registre, list):
            self.registre = {str(i): "?" for i in self.registre}
        self.deja = {int(i) for i, v in self.registre.items() if v != nom}
        self.cette_video = set()

    def chercher(self, q):
        if not self.cle:
            return []
        try:
            r = requests.get("https://pixabay.com/api/videos/", timeout=30, headers=ENTETES,
                             params={"key": self.cle, "q": q[:100], "per_page": 30, "safesearch": "true", "video_type": "film"})
            if r.status_code != 200:
                journal("recherche impossible", q, r.status_code, r.text[:160].replace("\n", " "))
                return []
            return r.json().get("hits", [])
        except Exception as e:  # réseau, quota, clé : on se rabat sur la 3D
            journal("recherche impossible", q, e)
            return []

    def clip(self, q, duree):
        """Renvoie (fichier, durée dispo) pour une recherche, en évitant les clips déjà vus récemment."""
        hits = self.chercher(q)
        if not hits and " " in q:
            hits = self.chercher(" ".join(q.split()[:2]))
        # Les mots qui portent le sens (« prison », « courtroom ») doivent figurer dans les étiquettes du clip ;
        # les mots d'ambiance (« dark », « night ») départagent seulement.
        ambiance = {"dark", "night", "the", "a", "of", "in", "and", "close", "up", "view", "black"}
        sens = [w for w in q.lower().split() if w not in ambiance] or q.lower().split()
        def pertinence(h):
            tags = h.get("tags", "").lower()
            return sum(1 for w in sens if w in tags) / len(sens) + 0.25 * sum(1 for w in q.lower().split() if w in ambiance and w in tags)
        def score(rang, h):
            v = h["videos"].get("medium") or {}
            vertical = 1 if v.get("height", 0) > v.get("width", 1) else 0
            neuf = 0 if h["id"] in self.deja else 1.5
            assez = 0.5 if h.get("duration", 0) >= duree + 0.5 else 0
            return 4 * pertinence(h) + 2 * (15 - rang) / 15 + vertical + neuf + assez + self.rng.random() * 0.4
        hits = [(r, h) for r, h in enumerate(hits[:15]) if h["id"] not in self.cette_video and (h["videos"].get("medium") or {}).get("url")]
        hits = [(r, h) for r, h in hits if pertinence(h) > 0] or hits[:3]
        if not hits:
            return None
        h = max(hits, key=lambda rh: score(*rh))[1]
        self.cette_video.add(h["id"])
        CACHE.mkdir(exist_ok=True)
        f = CACHE / f"pixabay-{h['id']}.mp4"
        if not f.exists():
            v = h["videos"]["medium"]
            try:
                if v["url"].startswith("file://"):
                    shutil.copy(v["url"][7:], f)
                else:
                    with requests.get(v["url"], headers=ENTETES, timeout=120, stream=True) as r, open(f, "wb") as o:
                        r.raise_for_status()
                        shutil.copyfileobj(r.raw, o)
            except Exception as e:
                f.unlink(missing_ok=True)
                journal("téléchargement impossible", h["id"], e)
                return None
        return f, h["id"]

    def memoriser(self):
        if self.cette_video:
            UTILISES.parent.mkdir(exist_ok=True)
            reg = {i: v for i, v in self.registre.items() if v != self.nom}
            reg.update({str(i): self.nom for i in self.cette_video})
            reg = dict(list(reg.items())[-600:])  # environ 2 semaines de vidéos
            UTILISES.write_text(json.dumps(reg, indent=0))


def planche(story, pub, out):
    """Une vignette par plan, légendée « scène N · recherche », pour que le pilote vérifie que l'image colle au texte."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    police = ImageFont.load_default()
    for chemin in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                   "/usr/share/fonts/opentype/inter/Inter-Regular.otf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if Path(chemin).exists():
            police = ImageFont.truetype(chemin, 13)
            break
    vignettes = []
    for i, sc in enumerate(story["scenes"]):
        vis = sc.get("visuels") or []
        for k, seg in enumerate(sc.get("segments", [])):
            im = Image.new("RGB", (216, 384), (40, 40, 40))
            if seg["type"] == "video":
                f = ICI / "rendu" / "public" / seg["src"]
                tmp = out / "_vignette.jpg"
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{seg['duree'] / FPS / 2:.2f}", "-i", str(f), "-frames:v", "1",
                                "-vf", "scale=216:384", str(tmp)])
                if tmp.exists():
                    im = Image.open(tmp).convert("RGB")
                    tmp.unlink()
            d = ImageDraw.Draw(im)
            etiquette = seg.get("source", "") if seg.get("raccord") else (vis[k % len(vis)] if vis else seg.get("plan", ""))
            if seg["type"] == "3d":
                etiquette = f"3D {seg.get('plan')} (rien trouvé)" if not str(etiquette).startswith("3d:") else etiquette
            d.rectangle([0, 0, 216, 58], fill=(0, 0, 0))
            d.text((6, 4), f"SCÈNE {i + 1}", fill=(255, 210, 63), font=police)
            d.text((6, 22), str(etiquette)[:30], fill=(255, 255, 255), font=police)
            d.text((6, 38), sc["voix"][:30], fill=(170, 170, 170), font=police)
            vignettes.append(im)
    if not vignettes:
        return
    col = 8
    pl = Image.new("RGB", (col * 220, ((len(vignettes) + col - 1) // col) * 388), (0, 0, 0))
    for k, im in enumerate(vignettes):
        pl.paste(im, ((k % col) * 220, (k // col) * 388))
    pl.save(out / "planche_visuels.jpg", quality=85)
    journal("planche :", out / "planche_visuels.jpg")


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
    px = Pixabay(graine, nom)
    rng = random.Random(graine)
    debuts = [0] + [round(s["debut"] * FPS) for s in timing["scenes"][1:]]
    premier = None  # (fichier, début, id) du tout premier plan, pour boucler la fin dessus
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
            dernier = story.get("boucle") and i == len(story["scenes"]) - 1 and k == n - 1
            if dernier and premier:
                # Boucle : on montre les secondes qui PRÉCÈDENT le tout premier plan, pour que l'image s'y raccorde
                f0, debut0, hid0 = premier
                dispo, _, _ = ffprobe(f0)
                try:
                    recadrer(f0, dest, max(0.0, debut0 - d / FPS), d / FPS + 0.05, dispo)
                    segs.append({"type": "video", "src": f"clips/{nom}/{dest.name}", "duree": d, "source": f"pixabay {hid0} (raccord boucle)", "raccord": True})
                    continue
                except subprocess.CalledProcessError as e:
                    journal("raccord de boucle impossible", e)
            if typ == "pixabay":
                r = px.clip(val, d / FPS)
                if r:
                    f, hid = r
                    dispo, _, _ = ffprobe(f)
                    debut = rng.uniform(0, max(0.0, dispo - d / FPS - 0.3))
                    if story.get("boucle") and i == 0 and k == 0:
                        # on garde de la marge avant le premier plan pour le raccord de fin
                        reste = dispo - d / FPS - 0.3
                        debut = rng.uniform(min(2.5, max(0.0, reste)), max(0.0, reste))
                        premier = (f, debut, hid)
                    try:
                        recadrer(f, dest, debut, d / FPS + 0.05, dispo)
                        seg = {"type": "video", "src": f"clips/{nom}/{dest.name}", "duree": d, "source": f"pixabay {hid}"}
                    except subprocess.CalledProcessError as e:
                        journal("recadrage impossible", f, e)
            if seg is None:
                plan = val if typ == "3d" else REPLI_3D[(i + k) % len(REPLI_3D)]
                seg = {"type": "3d", "plan": plan, "duree": d}
                if typ != "3d":
                    journal(f"scène {i + 1} : « {v} » remplacé par la 3D {plan}")
            segs.append(seg)
        sc["segments"] = segs
        journal(f"scène {i + 1} :", ", ".join(s.get("source", "3d " + s.get("plan", "")) for s in segs))
    px.memoriser()
    planche(story, pub, out)
    story["clips"] = nom
    (out / "storyboard_rendu.json").write_text(json.dumps(story, ensure_ascii=False, indent=1))
    journal("prêt :", out / "storyboard_rendu.json")


if __name__ == "__main__":
    main()
