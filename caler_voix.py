"""Cale n'importe quelle voix off (MP3/WAV : ElevenLabs, enregistrement perso, autre service) sur un storyboard.

Sans modèle d'alignement : on repère les silences de la voix, on y place les coupures de phrases et de scènes
(au plus près de la durée attendue de chaque phrase), puis on répartit les mots dans chaque phrase.
Sortie identique à tts.py : sortie/voix.wav + sortie/timing.json, donc le reste du moteur ne change pas.

Usage : python caler_voix.py voix.mp3 storyboard.json sortie/
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx.tokenizer import Tokenizer

SR = 24000
HOP = 0.01  # 10 ms


def phrases(texte):
    return [p for p in re.split(r"(?<=[.!?…])\s+", texte.strip()) if p]


def poids_phonetique(texte, tok, ch):
    dit = texte
    for mot, son in ch.get("prononciation", {}).items():
        dit = re.sub(rf"\b{re.escape(mot)}\b", son, dit)
    return len(re.sub(r"\([a-z]{2}\)|[ˈˌ\s]", "", tok.phonemize(dit, ch["langue"]))) + 1


def main():
    src, story_path, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    story = json.loads(story_path.read_text())
    ch = story["chaine"]
    tok = Tokenizer()

    wav = out / "voix.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    # copie haute qualité pour le mixage final (l'analyse se fait en 24 kHz)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "48000", str(out / "voix_hd.wav")], check=True)
    audio, _ = sf.read(wav, dtype="float32")

    # enveloppe d'énergie et zones de parole
    h = int(HOP * SR)
    n = len(audio) // h
    rms = np.sqrt(np.mean(audio[: n * h].reshape(n, h) ** 2, axis=1))
    rms = np.convolve(rms, np.ones(3) / 3, mode="same")
    seuil = 0.08 * np.percentile(rms, 95)
    parle = rms > seuil
    idx = np.where(parle)[0]
    t_deb, t_fin = idx[0] * HOP, (idx[-1] + 1) * HOP

    # silences candidats (≥ 90 ms) : (milieu, longueur)
    silences, i = [], idx[0]
    while i < idx[-1]:
        if not parle[i]:
            j = i
            while j < n and not parle[j]:
                j += 1
            if (j - i) * HOP >= 0.09:
                silences.append(((i + j) / 2 * HOP, (j - i) * HOP, i * HOP, j * HOP))
            i = j
        else:
            i += 1

    # unités = phrases, rattachées à leur scène
    unites = []
    for si, sc in enumerate(story["scenes"]):
        for ph in phrases(sc["voix"]):
            unites.append({"scene": si, "texte": ph, "poids": poids_phonetique(ph, tok, ch)})
    total = sum(u["poids"] for u in unites)

    # coupures entre phrases : silence le plus proche de la position attendue (ordre conservé)
    bornes = [t_deb]
    cumul, dernier = 0, t_deb
    for u in unites[:-1]:
        cumul += u["poids"]
        attendu = t_deb + (t_fin - t_deb) * cumul / total
        cands = [s for s in silences if s[0] > dernier + 0.25 and abs(s[0] - attendu) < 1.2]
        if cands:
            s = min(cands, key=lambda s: abs(s[0] - attendu) - 0.8 * s[1])
            bornes.append(s)
            dernier = s[0]
        else:
            bornes.append((attendu, 0, attendu, attendu))
            dernier = attendu
    bornes.append(t_fin)

    scenes = [{"index": i, "debut": None, "fin": None, "mots": []} for i in range(len(story["scenes"]))]
    for k, u in enumerate(unites):
        a = bornes[k] if k == 0 else bornes[k][3]          # fin du silence précédent
        b = bornes[k + 1] if k == len(unites) - 1 else bornes[k + 1][2]  # début du silence suivant
        mots = u["texte"].split()
        p = [poids_phonetique(m, tok, ch) + 1.5 for m in mots]
        t, tot = a, sum(p)
        sc = scenes[u["scene"]]
        for m, w in zip(mots, p):
            d = (b - a) * w / tot
            sc["mots"].append({"mot": m, "debut": round(t, 3), "fin": round(t + d, 3)})
            t += d
        sc["debut"] = round(max(0.0, a - 0.06), 3) if sc["debut"] is None else sc["debut"]
        sc["fin"] = round(b, 3)

    duree = round(len(audio) / SR + 0.4, 3)
    (out / "timing.json").write_text(json.dumps({"duree": duree, "scenes": scenes}, ensure_ascii=False, indent=1))
    for s in scenes:
        print(f"scène {s['index']}: {s['debut']:6.2f}s → {s['fin']:6.2f}s")
    print(f"durée {duree}s — {len(silences)} silences repérés")


if __name__ == "__main__":
    main()
