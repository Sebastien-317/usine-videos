"""Voix off : synthétise chaque scène phrase par phrase avec Kokoro (local, gratuit).

Sortie : audio/voix.wav + timing.json (début/fin de chaque scène et de chaque mot).
Usage : python tts.py storyboard.json sortie/
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer

HERE = Path(__file__).parent
PAUSE_PHRASE = 0.18   # silence entre deux phrases d'une même scène (s)
PAUSE_SCENE = 0.32    # silence entre deux scènes (s)
DEBUT = 0.25          # petit silence au tout début


def phrases(texte):
    morceaux = re.split(r"(?<=[.!?:])\s+", texte.strip())
    return [m for m in morceaux if m]


def mots_avec_temps(texte, t0, t1, tok, ch):
    """Répartit les mots d'une phrase sur sa durée, au prorata de leur longueur prononcée."""
    mots = texte.split()
    poids = []
    for m in mots:
        dit = ch.get("prononciation", {}).get(m.strip(".,!?:;"), m)
        ph = re.sub(r"\([a-z]{2}\)|[ˈˌ.,!?:;\s]", "", tok.phonemize(dit, ch["langue"]))
        poids.append(len(ph) + 1.5)
    total = sum(poids)
    t, sortie = t0, []
    for m, p in zip(mots, poids):
        d = (t1 - t0) * p / total
        sortie.append({"mot": m, "debut": round(t, 3), "fin": round(t + d, 3)})
        t += d
    return sortie


def main():
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ch = story["chaine"]
    tts = Kokoro(str(HERE / "models/kokoro-v1.0.onnx"), str(HERE / "models/voices-v1.0.bin"))

    tok = Tokenizer()
    sr = 24000
    pistes = [np.zeros(int(DEBUT * sr), dtype=np.float32)]
    t = DEBUT
    scenes = []
    for i, sc in enumerate(story["scenes"]):
        debut_scene = t
        mots = []
        for ph in phrases(sc["voix"]):
            dit = ph
            for mot, son in ch.get("prononciation", {}).items():
                dit = re.sub(rf"\b{re.escape(mot)}\b", son, dit)
            phon = tok.phonemize(dit, ch["langue"])
            phon = re.sub(r"\([a-z]{2}\)", "", phon)  # retire les marqueurs de langue d'espeak
            audio, sr = tts.create(phon, voice=ch["voix"], speed=ch["vitesse"], is_phonemes=True)
            audio = audio.astype(np.float32)
            # coupe les silences de bord produits par le modèle
            seuil = 0.01 * np.max(np.abs(audio))
            idx = np.where(np.abs(audio) > seuil)[0]
            audio = audio[max(idx[0] - 240, 0): idx[-1] + 480]
            d = len(audio) / sr
            mots += mots_avec_temps(ph, t, t + d, tok, ch)
            pistes += [audio, np.zeros(int(PAUSE_PHRASE * sr), dtype=np.float32)]
            t += d + PAUSE_PHRASE
        pistes.append(np.zeros(int((PAUSE_SCENE - PAUSE_PHRASE) * sr), dtype=np.float32))
        t += PAUSE_SCENE - PAUSE_PHRASE
        scenes.append({"index": i, "debut": round(debut_scene, 3), "fin": round(t, 3), "mots": mots})
        print(f"scène {i}: {debut_scene:5.2f}s → {t:5.2f}s")

    voix = np.concatenate(pistes)
    voix = voix / max(1e-6, np.max(np.abs(voix))) * 0.89
    sf.write(out / "voix.wav", voix, sr)
    (out / "timing.json").write_text(json.dumps({"duree": round(t + 0.6, 3), "scenes": scenes}, ensure_ascii=False, indent=1))
    print(f"durée totale ≈ {t + 0.6:.2f}s")


if __name__ == "__main__":
    main()
