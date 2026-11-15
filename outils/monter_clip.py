#!/usr/bin/env python3
"""Monte un extrait vertical (1080x1920) à partir d'un segment 16:9 d'interview.

  python3 outils/monter_clip.py segment.mp4 mots.json clip.json sortie.mp4

clip.json : {"titre": "LIGNE 1|LIGNE 2", "credit": "…", "coupes": [[debut, fin], …] (facultatif, en s, relatif au segment)}
- recadrage sur le visage (détection OpenCV, un cadrage par plan, lissé) ;
- sous-titres mot à mot (2 à 4 mots, le mot prononcé surligné) ;
- titre d'accroche en haut, crédit et licence en petit ;
- son normalisé à -14 LUFS.
"""
import json
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

W, H = 1080, 1920
POLICES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rendu", "public", "fonts")


def sonde(src):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate:format=duration", "-of", "json", src],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    num, den = map(int, s["r_frame_rate"].split("/"))
    return s["width"], s["height"], num / den, float(j["format"]["duration"])


def centres_visage(src, w, h, duree, pas=0.25):
    """Centre horizontal du visage principal, échantillonné toutes les `pas` secondes, + détection des changements de plan."""
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(src)
    t, res, prec = 0.0, [], None
    while t < duree:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, img = cap.read()
        if not ok:
            break
        petit = cv2.resize(img, (w // 2, h // 2))
        gris = cv2.cvtColor(petit, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([gris], [0], None, [32], [0, 256]).flatten()
        hist /= hist.sum() + 1e-9
        coupe = prec is not None and float(np.abs(hist - prec).sum()) > 0.5
        prec = hist
        faces = det.detectMultiScale(gris, 1.1, 6, minSize=(h // 16, h // 16))
        x = None
        if len(faces):
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            x = (fx + fw / 2) * 2
        res.append((t, x, coupe))
        t += pas
    cap.release()
    return res


def plans(echantillons, w, cw):
    """Regroupe les échantillons en plans et donne un x de recadrage par plan (médiane des visages)."""
    groupes, cour = [], []
    for e in echantillons:
        if e[2] and cour:
            groupes.append(cour)
            cour = []
        cour.append(e)
    if cour:
        groupes.append(cour)
    sortie, dernier = [], w / 2
    for g in groupes:
        xs = [x for _, x, _ in g if x is not None]
        cx = float(np.median(xs)) if xs else dernier
        dernier = cx
        x0 = int(min(max(cx - cw / 2, 0), w - cw))
        sortie.append((g[0][0], x0))
    return sortie


def expr_crop(segments):
    expr = str(segments[-1][1])
    for (t, x), (t_suiv, _) in reversed(list(zip(segments[:-1], segments[1:]))):
        expr = f"if(lt(t\\,{t_suiv:.2f})\\,{x}\\,{expr})"
    return expr


def ass_temps(s):
    s = max(s, 0)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def sous_titres(mots, titre, credit, duree):
    entete = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Mots,Poppins,82,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1
Style: Titre,Anton,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&HC8000000,0,0,0,0,100,100,1,0,3,18,0,8,70,70,190,1
Style: Credit,Poppins,34,&H00E6E6E6,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,8,60,60,135,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lignes = []
    t1, t2 = titre.split("|") if "|" in titre else (titre, "")
    texte_titre = t1 + (r"\N{\c&H00D7FF&}" + t2 if t2 else "")
    lignes.append(f"Dialogue: 1,{ass_temps(0)},{ass_temps(duree)},Titre,,0,0,0,,{texte_titre}")
    lignes.append(f"Dialogue: 1,{ass_temps(0)},{ass_temps(duree)},Credit,,0,0,0,,{credit}")
    # groupes de 2 à 4 mots, coupés aux pauses et à la ponctuation
    groupes, cour = [], []
    for i, m in enumerate(mots):
        cour.append(m)
        fin_phrase = m["mot"].endswith((".", "?", "!", ","))
        pause = i + 1 < len(mots) and mots[i + 1]["debut"] - m["fin"] > 0.35
        if len(cour) >= 4 or (len(cour) >= 2 and (fin_phrase or pause)) or (fin_phrase and len(" ".join(x["mot"] for x in cour)) > 9):
            groupes.append(cour)
            cour = []
    if cour:
        groupes.append(cour)
    for gi, g in enumerate(groupes):
        fin_groupe = groupes[gi + 1][0]["debut"] if gi + 1 < len(groupes) else g[-1]["fin"] + 0.4
        for j, m in enumerate(g):
            deb = m["debut"] if j else min(m["debut"], g[0]["debut"])
            fin = g[j + 1]["debut"] if j + 1 < len(g) else fin_groupe
            if fin - deb < 0.05:
                continue
            morceaux = []
            for k, x in enumerate(g):
                mot = x["mot"].upper().replace("{", "").replace("}", "")
                morceaux.append(r"{\c&H00D7FF&\fscx108\fscy108}" + mot + r"{\c&HFFFFFF&\fscx100\fscy100}" if k == j else mot)
            lignes.append(f"Dialogue: 0,{ass_temps(deb)},{ass_temps(fin)},Mots,,0,0,0,,{{\\pos({W // 2},1240)}}" + " ".join(morceaux))
    return entete + "\n".join(lignes) + "\n"


def main():
    src, f_mots, f_clip, dest = sys.argv[1:5]
    clip = json.load(open(f_clip))
    mots = json.load(open(f_mots))
    w, h, fps, duree = sonde(src)
    deb, fin = (clip.get("coupe") or [0, duree])
    mots = [dict(m, debut=round(m["debut"] - deb, 2), fin=round(m["fin"] - deb, 2)) for m in mots if m["debut"] >= deb - 0.05 and m["fin"] <= fin + 0.3]
    d = fin - deb
    cw = int(h * 9 / 16) // 2 * 2
    ech = [(t - deb, x, c) for t, x, c in centres_visage(src, w, h, duree) if deb <= t <= fin]
    segs = plans(ech, w, cw)
    print("Plans :", [(round(t, 1), x) for t, x in segs])
    with tempfile.TemporaryDirectory() as tmp:
        ass = os.path.join(tmp, "st.ass")
        open(ass, "w").write(sous_titres(mots, clip["titre"], clip["credit"], d))
        vf = (f"crop={cw}:{h}:'{expr_crop(segs)}':0,scale={W}:{H}:flags=lanczos,setsar=1,"
              f"eq=contrast=1.06:saturation=1.08,unsharp=5:5:0.6,ass={ass}:fontsdir={POLICES}:shaping=simple,"
              f"fade=t=in:st=0:d=0.15")
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{deb:.2f}", "-t", f"{d:.2f}", "-i", src, "-vf", vf,
               "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
               dest + ".tmp.mp4"]
        subprocess.run(cmd, check=True)
        os.replace(dest + ".tmp.mp4", dest)
    print("Clip écrit :", dest, f"{d:.1f} s")


if __name__ == "__main__":
    main()
