"""Images officielles de GTA 6, tirées du kit média de Rockstar (https://www.rockstargames.com/VI/media).

Rockstar y propose de « télécharger et partager » ses bandes-annonces et clips. Cet outil les transforme en
plans verticaux prêts à monter :
  1. chaque vidéo officielle est recadrée en 1080×1920 (centre de l'image), sans le son (les musiques des
     bandes-annonces ne sont jamais reprises) → cache_officiel/<code>.mp4 ;
  2. elle est découpée en plans (détection des changements de plan) ;
  3. chaque plan est décrit par CLIP (une image du milieu du plan comparée à un vocabulaire de scènes en anglais).

Usage :
  python3 officiel.py construire          # tout (téléchargement, plans, CLIP) → bibliotheque/officiel/
  python3 officiel.py preparer            # en production : refait seulement les vidéos verticales absentes du cache
  python3 officiel.py chercher "police chase night"

Dans un storyboard : "officiel:<3 à 5 mots anglais>" (recherche) ou "officiel:#T2-014" (un plan précis, vu sur
candidats.jpg). La recherche n'a besoin que de numpy : les vecteurs CLIP sont calculés une fois pour toutes.
"""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ICI = Path(__file__).parent
DOSSIER = ICI / "bibliotheque" / "officiel"
CACHE = ICI / "cache_officiel"
PLANS = DOSSIER / "plans.json"
MEDIA = "https://media-rockstargames-com.akamaized.net/VI/downloads/videos/"
SOURCES = {
    "T1": ("Bande-annonce 1", MEDIA + "GTAVI_Trailer_1/GTAVI_Trailer_1.mp4"),
    "T2": ("Bande-annonce 2", MEDIA + "GTAVI_Trailer_2/GTAVI_Trailer_2.mp4"),
    "LT": ("Bande-annonce de lancement", MEDIA + "GTAVI_Launch_Trailer/GTAVI_Launch_Trailer.mp4"),
    "XL": ("Un large aperçu (gameplay)", MEDIA + "GTAVI_An_Extended_Look/GTAVI_An_Extended_Look.mp4"),
    "PL": ("Préchargez maintenant", MEDIA + "GTAVI_Pre-Load_Now/GTAVI_Pre-Load_Now.mp4"),
}
ZIP_CLIPS = MEDIA + "GTAVI_Videos.zip"  # clips des personnages (Jason, Lucia, Cal, Boobie…)
ENTETES = "User-Agent: usine-videos/1.0 (github.com/Sebastien-317/usine-videos)\r\n"

# Ce que CLIP sait reconnaître ; la recherche du pilote est rapprochée de ces descriptions
VOCABULAIRE = [
    "a woman", "a man", "a couple", "a woman holding a gun", "a man holding a gun", "a couple holding guns",
    "a woman driving a car", "a man driving a car", "a couple in a car", "a kiss", "a woman on her phone", "a man on his phone",
    "a selfie video on a phone", "a social media video", "people dancing at a party", "a nightclub", "a pool party",
    "a crowd at the beach", "a woman in a bikini", "a bodybuilder at the gym", "people lifting weights", "a tattooed man",
    "a police officer", "police officers arresting someone", "handcuffs", "a prison", "an inmate in a prison jumpsuit",
    "a prison yard", "a robbery with masks", "a store robbery", "a cashier in a convenience store", "a gas station",
    "a stack of cash", "a man counting money", "a bank", "a jewelry store", "a pawn shop", "a gun store", "a gun", "a rifle",
    "a shootout", "an explosion", "a car on fire", "fire", "a car crash", "a police car", "a police chase", "a police helicopter",
    "a helicopter", "a small airplane", "a sports car", "a muscle car", "a pickup truck", "a motorcycle", "a speedboat",
    "a yacht", "a jet ski", "a boat at sea", "a dock with boats", "a highway", "a bridge", "a city street at night",
    "a city street during the day", "neon lights at night", "a city skyline at night", "a city skyline at sunset",
    "aerial view of a city", "aerial view of islands", "palm trees", "a sunset over the ocean", "a beach", "the ocean",
    "a swamp", "an alligator", "a flamingo", "wild animals", "a rural town", "a trailer park", "a farm", "a motel",
    "a mansion", "a luxury hotel", "a strip mall", "a shopping mall", "a parking lot", "a construction site", "a bar",
    "a restaurant", "a diner", "a barber shop", "a car dealership", "a garage", "an office", "a TV news broadcast",
    "a stadium", "a basketball court", "a golf course", "fireworks", "a storm with rain", "a hurricane", "a sunrise",
    "a rap music video", "a recording studio", "a hospital", "an ambulance", "a fire truck", "a truck", "a bus",
    "a dog", "a fight", "a man running", "a woman running", "a map", "white text on a black background", "a video game logo",
]
TEXTE = {"white text on a black background", "a video game logo"}
VIDES = {"a", "an", "the", "of", "in", "on", "at", "and", "with", "dark", "night", "close", "up", "view", "shot", "scene",
         "gta", "game", "video", "vice", "city", "leonida", "official", "trailer"}
NUIT = {"night", "dark"}


def journal(*a):
    print("[officiel]", *a, flush=True)


def duree(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def vertical(src, dest):
    """Recadre une vidéo officielle en 1080×1920 (centre), 30 i/s, sans le son. src = URL ou fichier."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.mp4")
    entree = ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10", "-headers", ENTETES] if str(src).startswith("http") else []
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entree, "-i", str(src), "-an",
                    "-vf", "scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(tmp)],
                   check=True)
    tmp.rename(dest)
    journal("vertical prêt :", dest.name, f"{duree(dest):.0f} s")


def clips_zip():
    """Télécharge le zip des clips des personnages et renvoie {code: fichier}."""
    import requests
    z = CACHE / "GTAVI_Videos.zip"
    if not z.exists():
        CACHE.mkdir(exist_ok=True)
        with requests.get(ZIP_CLIPS, timeout=600, stream=True, headers={"User-Agent": ENTETES.split(": ", 1)[1].strip()}) as r:
            r.raise_for_status()
            with open(z.with_suffix(".tmp"), "wb") as o:
                for b in r.iter_content(1 << 20):
                    o.write(b)
        z.with_suffix(".tmp").rename(z)
    sortie = {}
    with zipfile.ZipFile(z) as zf:
        for nom in zf.namelist():
            if not nom.lower().endswith((".mp4", ".mov")) or "/." in nom or nom.startswith("__"):
                continue
            base = Path(nom).stem
            code = "C-" + re.sub(r"[^A-Za-z]", "", base.replace("Video_Clip", "").replace("GTAVI", ""))[:12]
            f = CACHE / "zip" / Path(nom).name
            if not f.exists():
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(zf.read(nom))
            sortie[code] = (base.replace("_", " "), f)
    return sortie


def coupes(f):
    """Instants des changements de plan (détection de scène sur une version réduite)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-an", "-vf", "scale=240:-2,select='gt(scene,0.30)',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True)
    return sorted({round(float(m), 2) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)})


def decouper(code, f):
    """Plans de 0,8 s au moins ; un plan de plus de 6 s est coupé en morceaux d'environ 4 s."""
    fin = duree(f)
    bornes = [0.0] + [c for c in coupes(f) if 0.3 < c < fin - 0.3] + [fin]
    plans = []
    for a, b in zip(bornes, bornes[1:]):
        if b - a < 0.8:
            continue
        n = max(1, round((b - a) / 4)) if b - a > 6 else 1
        pas = (b - a) / n
        for k in range(n):
            plans.append({"id": f"{code}-{len(plans):03d}", "v": code, "debut": round(a + k * pas, 2), "fin": round(a + (k + 1) * pas, 2)})
    return plans


def vignette(p, taille=448):
    """Image du milieu du plan (pour CLIP et pour les planches)."""
    f = CACHE / "vignettes" / f"{p['id']}.jpg"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{(p['debut'] + p['fin']) / 2:.2f}", "-i", str(CACHE / f"{p['v']}.mp4"),
                        "-frames:v", "1", "-vf", f"scale=-2:{taille}", str(f)])
    return f


def construire():
    import numpy as np
    import open_clip
    import torch
    from PIL import Image, ImageStat
    CACHE.mkdir(exist_ok=True)
    sources = {c: (nom, url) for c, (nom, url) in SOURCES.items()}
    for c, (nom, url) in sources.items():
        if not (CACHE / f"{c}.mp4").exists():
            journal("recadrage de", nom)
            vertical(url, CACHE / f"{c}.mp4")
    try:
        for c, (nom, f) in clips_zip().items():
            sources[c] = (nom, "zip:" + f.name)
            if not (CACHE / f"{c}.mp4").exists():
                vertical(f, CACHE / f"{c}.mp4")
    except Exception as e:
        journal("clips des personnages indisponibles :", e)
    plans = []
    for c in sources:
        p = decouper(c, CACHE / f"{c}.mp4")
        journal(c, len(p), "plans")
        plans += p
    modele, _, prep = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
    tok = open_clip.get_tokenizer("ViT-B-32")
    modele.eval()
    with torch.no_grad():
        mots = modele.encode_text(tok([f"a video game screenshot of {v}" for v in VOCABULAIRE]))
        mots = mots / mots.norm(dim=-1, keepdim=True)
        vecs = []
        for i in range(0, len(plans), 32):
            lot = plans[i:i + 32]
            ims = []
            for p in lot:
                im = Image.open(vignette(p)).convert("RGB")
                p["lum"] = round(ImageStat.Stat(im.convert("L")).mean[0] / 255, 3)
                ims.append(prep(im))
            v = modele.encode_image(torch.stack(ims))
            vecs.append(v / v.norm(dim=-1, keepdim=True))
        img = torch.cat(vecs)
    sim = (img @ mots.T).numpy()
    for p, s in zip(plans, sim):
        top = s.argsort()[::-1][:5]
        p["tags"] = [VOCABULAIRE[j] for j in top]
        p["texte"] = VOCABULAIRE[top[0]] in TEXTE
    DOSSIER.mkdir(parents=True, exist_ok=True)
    np.save(DOSSIER / "vecteurs_plans.npy", img.numpy().astype("float16"))
    np.save(DOSSIER / "vecteurs_mots.npy", mots.numpy().astype("float16"))
    PLANS.write_text(json.dumps({"origine": "https://www.rockstargames.com/VI/media", "vocabulaire": VOCABULAIRE,
                                 "sources": {c: {"nom": n, "url": u} for c, (n, u) in sources.items()}, "plans": plans},
                                ensure_ascii=False, indent=0))
    journal(len(plans), "plans décrits →", PLANS)


def preparer():
    """En production : les vidéos verticales viennent du cache GitHub ; celles qui manquent sont refaites."""
    if not PLANS.exists():
        journal("pas de bibliothèque officielle (lancer « construire »)")
        return
    sources = json.loads(PLANS.read_text())["sources"]
    manque = [c for c in sources if not (CACHE / f"{c}.mp4").exists()]
    if any(str(sources[c]["url"]).startswith("zip:") for c in manque):
        try:
            zf = clips_zip()
            for c in manque:
                if c in zf:
                    vertical(zf[c][1], CACHE / f"{c}.mp4")
        except Exception as e:
            journal("clips des personnages indisponibles :", e)
    for c in manque:
        if str(sources[c]["url"]).startswith("http"):
            try:
                vertical(sources[c]["url"], CACHE / f"{c}.mp4")
            except subprocess.CalledProcessError as e:
                journal("vidéo officielle indisponible :", c, e)
    for f in [CACHE / "GTAVI_Videos.zip", *(CACHE / "zip").glob("*")]:
        f.unlink(missing_ok=True)
    journal("prêt :", sum((CACHE / f"{c}.mp4").exists() for c in sources), "/", len(sources), "vidéos officielles")


class Bibliotheque:
    def __init__(self):
        import numpy as np
        self.np = np
        self.ok = PLANS.exists()
        if not self.ok:
            return
        d = json.loads(PLANS.read_text())
        self.vocab = d["vocabulaire"]
        self.plans = [p for p in d["plans"] if (CACHE / f"{p['v']}.mp4").exists()]
        tous = {p["id"]: i for i, p in enumerate(d["plans"])}
        self.par_id = {p["id"]: p for p in self.plans}
        img = np.load(DOSSIER / "vecteurs_plans.npy").astype("float32")
        self.img = img[[tous[p["id"]] for p in self.plans]] if self.plans else img[:0]
        self.mots = np.load(DOSSIER / "vecteurs_mots.npy").astype("float32")
        self.ok = bool(self.plans)

    def chercher(self, q, n=8, exclure=()):
        """Plans classés pour une recherche en anglais : la requête est rapprochée des descriptions du vocabulaire."""
        if not self.ok:
            return []
        if q.startswith("#"):
            p = self.par_id.get(q[1:].strip())
            return [(p, 1.0)] if p else []
        mots = [w.rstrip("s") for w in re.findall(r"[a-z]+", q.lower()) if w not in VIDES]
        idx = [i for i, v in enumerate(self.vocab) if v not in TEXTE and any(re.search(rf"\b{re.escape(w)}", v) for w in mots)]
        if not idx:
            return []
        cible = self.mots[idx].mean(0)
        cible /= self.np.linalg.norm(cible)
        score = self.img @ cible
        nuit = any(w in NUIT for w in re.findall(r"[a-z]+", q.lower()))
        res = []
        for i in score.argsort()[::-1]:
            p = self.plans[i]
            if p["id"] in exclure or p.get("texte") or p.get("lum", 1) < 0.06:
                continue
            s = float(score[i]) + (0.01 if nuit and p.get("lum", 1) < 0.3 else 0)
            res.append((p, s))
            if len(res) >= n:
                break
        return res

    def fichier(self, p):
        return CACHE / f"{p['v']}.mp4"


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action == "construire":
        construire()
    elif action == "preparer":
        preparer()
    elif action == "chercher":
        for p, s in Bibliotheque().chercher(" ".join(sys.argv[2:])):
            print(f"{p['id']}  {s:.3f}  {p['debut']:.1f}-{p['fin']:.1f}s  {', '.join(p.get('tags', [])[:3])}")
    else:
        print(__doc__)
