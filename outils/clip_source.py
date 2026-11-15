#!/usr/bin/env python3
"""Récupère des passages d'interviews publiées sous licence libre sur une instance PeerTube (Thinkerview par défaut).

Utilisé par .github/workflows/clip.yml (le bac à sable de Claude ne peut pas joindre ces sites, GitHub Actions oui).
  lister   [recherche]          -> controle/videos.json      (vidéos de l'instance, les plus vues d'abord)
  transcrire <video>            -> controle/transcription.txt (horodatée, pour repérer les meilleurs passages)
  extraire <video> <debut> <fin> -> controle/segment.mp4 + controle/mots.json (sous-titres mot à mot)
Seules les vidéos de l'instance elle-même sont utilisées : la licence de Thinkerview (CC BY-NC-SA 4.0) ne couvre que les siennes.
"""
import json
import os
import subprocess
import sys

import requests

INSTANCE = os.environ.get("INSTANCE", "https://videos.thinkerview.com").rstrip("/")
OUT = "controle"


def hms(s):
    s = int(s)
    return f"{s // 3600:d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def sonder(*_):
    urls = ["https://thinkerview.video/api/v1/config", "https://thinkerview.video/api/v1/videos?count=2",
            "https://videos.thinkerview.com/api/v1/config", "https://videos.thinkerview.com/feeds/podcast/videos.xml?videoChannelId=2",
            "https://videos.thinkerview.com/feeds/videos.xml?videoChannelId=2", "https://thinkerview.video/feeds/videos.xml"]
    with open(f"{OUT}/sonde.txt", "w") as f:
        for u in urls:
            try:
                r = requests.get(u, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
                f.write(f"== {u}\n{r.status_code} {r.url} {r.headers.get('content-type')}\n{r.text[:1500]}\n\n")
                if "xml" in r.headers.get("content-type", "") and r.status_code == 200:
                    open(f"{OUT}/flux_{len(r.text)}.xml", "w").write(r.text)
            except Exception as e:
                f.write(f"== {u}\nERREUR {e}\n\n")


def chercher(recherche="Thinkerview"):
    """Copies sous licence libre hébergées par Wikimedia Commons et Internet Archive (téléchargement direct autorisé)."""
    res = {"commons": [], "archive": []}
    ua = {"User-Agent": "usine-videos/1.0 (clips sous licence libre)"}
    r = requests.get("https://commons.wikimedia.org/w/api.php", headers=ua, timeout=30, params={
        "action": "query", "format": "json", "generator": "search", "gsrsearch": f"{recherche} filetype:video",
        "gsrnamespace": 6, "gsrlimit": 50, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata"})
    for page in (r.json().get("query") or {}).get("pages", {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata") or {}
        res["commons"].append({"titre": page["title"], "url": ii.get("url"), "taille_mo": round(ii.get("size", 0) / 1e6),
                               "licence": (meta.get("LicenseShortName") or {}).get("value"),
                               "auteur": (meta.get("Artist") or {}).get("value", "")[:120]})
    r = requests.get("https://archive.org/advancedsearch.php", headers=ua, timeout=30, params={
        "q": f"{recherche} AND mediatype:movies", "fl[]": ["identifier", "title", "downloads", "licenseurl", "date"],
        "rows": 200, "output": "json", "sort[]": "downloads desc"})
    res["archive"] = r.json().get("response", {}).get("docs", [])
    json.dump(res, open(f"{OUT}/recherche.json", "w"), ensure_ascii=False, indent=1)
    print(len(res["commons"]), "sur Commons,", len(res["archive"]), "sur Archive")


def fichiers_archive(identifiant):
    r = requests.get(f"https://archive.org/metadata/{identifiant}", timeout=30).json()
    vids = [f for f in r.get("files", []) if f.get("name", "").lower().endswith((".mp4", ".webm", ".mkv", ".ogv"))]
    vids.sort(key=lambda f: int(f.get("size", 0)))
    return [f"https://archive.org/download/{identifiant}/{f['name']}" for f in vids], r.get("metadata", {})


def lister(recherche=""):
    vus, vids = set(), []
    for start in range(0, 300, 100):
        if recherche:
            url, params = f"{INSTANCE}/api/v1/search/videos", {"search": recherche, "searchTarget": "local", "count": 100, "start": start}
        else:
            url, params = f"{INSTANCE}/api/v1/videos", {"sort": "-views", "count": 100, "start": start, "isLocal": "true"}
        r = requests.get(url, params=params, timeout=30, headers={"Accept": "application/json"})
        if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
            sys.exit(f"Réponse inattendue {r.status_code} {r.url} : {r.text[:300]}")
        data = r.json().get("data", [])
        for v in data:
            if v["uuid"] in vus or not v.get("isLocal", True):
                continue
            vus.add(v["uuid"])
            vids.append({"nom": v["name"], "id": v.get("shortUUID") or v["uuid"], "duree": hms(v.get("duration", 0)),
                         "vues": v.get("views"), "date": (v.get("publishedAt") or "")[:10], "url": v.get("url")})
        if len(data) < 100:
            break
    json.dump(vids, open(f"{OUT}/videos.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(vids)} vidéos listées")


def details(video):
    if video.startswith("http") or video.startswith("archive:"):
        if video.startswith("archive:"):
            urls, meta = fichiers_archive(video[8:])
            json.dump({"nom": meta.get("title"), "licence": meta.get("licenseurl"), "source": f"https://archive.org/details/{video[8:]}",
                       "fichiers": urls}, open(f"{OUT}/video.json", "w"), ensure_ascii=False, indent=1)
        else:
            urls = [video]
        return None, [{"fileUrl": u, "resolution": {"id": i + 1}} for i, u in enumerate(urls)]
    r = requests.get(f"{INSTANCE}/api/v1/videos/{video}", timeout=30)
    r.raise_for_status()
    v = r.json()
    fichiers = list(v.get("files") or [])
    for p in v.get("streamingPlaylists") or []:
        fichiers += p.get("files") or []
    fichiers = [f for f in fichiers if (f.get("resolution") or {}).get("id", 0) > 0 and f.get("fileUrl")]
    if not fichiers:
        sys.exit("Aucun fichier vidéo téléchargeable sur cette vidéo")
    fichiers.sort(key=lambda f: f["resolution"]["id"])
    info = {"nom": v["name"], "url": v.get("url"), "licence": (v.get("licence") or {}).get("label"),
            "duree": v.get("duration"), "description": (v.get("description") or "")[:600]}
    json.dump(info, open(f"{OUT}/video.json", "w"), ensure_ascii=False, indent=1)
    return v, fichiers


def telecharger(url, dest="source.bin"):
    """Téléchargement local d'abord : Wikimedia refuse l'agent par défaut de ffmpeg."""
    with requests.get(url, stream=True, timeout=60, headers={"User-Agent": "usine-videos/1.0 (clips sous licence libre; github.com/Sebastien-317)"}) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for bloc in r.iter_content(1 << 20):
                f.write(bloc)
    print(f"Téléchargé : {os.path.getsize(dest) / 1e6:.0f} Mo")
    return dest


def lire_wav(chemin):
    """Audio 16 kHz mono en tableau : évite le décodeur PyAV de faster-whisper (incompatible avec certaines versions)."""
    import wave
    import numpy as np
    with wave.open(chemin) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0


def modele(nom):
    from faster_whisper import WhisperModel
    return WhisperModel(nom, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)


def transcrire(video):
    _, fichiers = details(video)
    src = telecharger(fichiers[0]["fileUrl"])  # la plus petite résolution suffit pour le son
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "audio.wav"], check=True)
    segs, _ = modele(os.environ.get("MODELE", "base")).transcribe(lire_wav("audio.wav"), language="fr", vad_filter=True, beam_size=1)
    with open(f"{OUT}/transcription.txt", "w") as f:
        for s in segs:
            f.write(f"[{hms(s.start)}|{s.start:.1f}] {s.text.strip()}\n")
    print("Transcription écrite")


def extraire(video, debut, fin):
    debut, fin = float(debut), float(fin)
    _, fichiers = details(video)
    hd = [f for f in fichiers if f["resolution"]["id"] <= 1080] or fichiers
    src = telecharger(hd[-1]["fileUrl"])
    long = fin - debut > 120  # film entier : en 720p pour rester sous la limite de taille de git
    qualite = ["-vf", "scale=-2:'min(720,ih)'", "-crf", "23"] if long else ["-crf", "18"]
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{debut:.2f}", "-i", src, "-t", f"{fin - debut:.2f}",
                    "-c:v", "libx264", *qualite, "-preset", "veryfast", "-c:a", "aac", "-b:a", "192k",
                    f"{OUT}/segment.mp4"], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{OUT}/segment.mp4", "-vn", "-ac", "1", "-ar", "16000",
                    "segment.wav"], check=True)
    segs, _ = modele(os.environ.get("MODELE_MOTS", "small")).transcribe(lire_wav("segment.wav"), language=os.environ.get("LANGUE") or None, beam_size=5,
                                                                        word_timestamps=True)
    mots = [{"mot": w.word.strip(), "debut": round(w.start, 2), "fin": round(w.end, 2)} for s in segs for w in s.words]
    json.dump(mots, open(f"{OUT}/mots.json", "w"), ensure_ascii=False, indent=0)
    print(f"Segment de {fin - debut:.0f} s extrait, {len(mots)} mots")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    etape, args = sys.argv[1], [a for a in sys.argv[2:] if a != ""]
    {"chercher": chercher, "sonder": sonder, "lister": lister, "transcrire": transcrire, "extraire": extraire}[etape](*args)
