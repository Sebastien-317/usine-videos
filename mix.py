"""Habillage sonore généré par code (aucun son sous licence) : beat + bruitages calés sur le storyboard.

Usage : python mix.py storyboard.json sortie/  -> sortie/nappe.wav + sortie/bruitages.wav (48 kHz)
Le mixage final (voix + habillage, ducking, -14 LUFS) se fait ensuite avec ffmpeg (voir fabriquer.sh).
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
FPS = 30
BPM = 128
rng = np.random.default_rng(7)


def env(n, attaque=0.003, decroissance=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attaque, 1e-4)) * np.exp(-t / decroissance)


def passe_bas(x, fc):
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def kick():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 42 + 110 * np.exp(-t / 0.035)
    return np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16))


def clap():
    n = int(0.25 * SR)
    b = rng.standard_normal(n)
    b = passe_bas(b, 3500) - passe_bas(b, 900)
    e = env(n, 0.001, 0.07)
    for d in (0.008, 0.016):  # petites répétitions = clap
        k = int(d * SR)
        e[k:] += 0.6 * env(n - k, 0.001, 0.05)
    return norm(b * e)


def hat(ouvert=False):
    n = int((0.18 if ouvert else 0.05) * SR)
    b = rng.standard_normal(n)
    b = b - passe_bas(b, 7000)
    return norm(b * env(n, 0.0005, 0.06 if ouvert else 0.012))


def basse(freq, duree):
    n = int(duree * SR)
    t = np.arange(n) / SR
    onde = 2 * ((freq * t) % 1) - 1  # dent de scie
    return passe_bas(onde, 380) * env(n, 0.005, duree * 0.8)


def whoosh(duree=0.45):
    n = int(duree * SR)
    fc = 300 + 6000 * np.sin(np.linspace(0, np.pi, n)) ** 2
    return norm(passe_bas(rng.standard_normal(n), fc) * np.sin(np.linspace(0, np.pi, n)) ** 1.5)


def impact(duree=1.1):
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = 30 + 100 * np.exp(-t / 0.07)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.4)
    return norm(np.tanh(1.8 * (boom + 1.5 * passe_bas(rng.standard_normal(n), 1200) * env(n, 0.001, 0.06))))


def tic():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2600 * t) * env(n, 0.0005, 0.006)


def pop():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f = 450 + 1100 * (1 - np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.06)


def poser(piste, son, t, gain):
    i = int(t * SR)
    if i >= len(piste) or i + len(son) <= 0:
        return
    a, b = max(i, 0), min(len(piste), i + len(son))
    piste[a:b] += gain * son[a - i: b - i]


def main():
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    timing = json.loads((out / "timing.json").read_text())
    duree = timing["duree"]
    n = int(duree * SR) + SR
    beat = np.zeros(n)
    sfx = np.zeros(n)
    debuts = [0.0] + [round(s["debut"] * FPS) / FPS for s in timing["scenes"][1:]]
    fin_beat = debuts[-1]  # le beat coupe sur la question finale

    temps = 60 / BPM
    notes = [55.0, 43.65, 65.41, 49.0]  # La, Fa, Do, Sol (graves)
    k, b = 0, 0.0
    while b < fin_beat:
        poser(beat, kick(), b, 0.9 if k % 4 in (0, 2) else 0.0)
        if k % 4 in (1, 3):
            poser(beat, clap(), b, 0.45)
        poser(beat, hat(), b + temps / 2, 0.16)
        poser(beat, hat(), b, 0.08)
        if k % 8 == 7:
            poser(beat, hat(True), b + temps / 2, 0.12)
        if k % 2 == 0:
            poser(beat, basse(notes[(k // 8) % 4], temps * 1.8), b, 0.35)
        b += temps
        k += 1

    poser(sfx, impact(), 0.0, 1.0)
    for i, (sc, t0) in enumerate(zip(story["scenes"], debuts)):
        if i > 0:
            poser(sfx, whoosh(), t0 - 0.22, 0.55)
            poser(sfx, impact(0.5), t0, 0.35)
        if sc.get("compteur"):
            for j in range(10):
                poser(sfx, tic(), t0 + (2 + j * 18 / 10) / FPS, 0.3)
            poser(sfx, pop(), t0 + 20 / FPS, 0.45)
        if sc.get("tampon"):
            poser(sfx, impact(0.7), t0 + round(sc.get("tamponA", 1) * FPS) / FPS, 0.8)
        if sc.get("question"):
            fin = debuts[i + 1] if i + 1 < len(debuts) else duree
            poser(sfx, impact(), t0, 0.7)
            poser(sfx, pop(), t0 + round((fin - t0) * FPS * 0.35) / FPS, 0.6)

    sf.write(out / "nappe.wav", (norm(beat) * 0.8).astype(np.float32), SR)
    sf.write(out / "bruitages.wav", (norm(sfx) * 0.9).astype(np.float32), SR)
    print("habillage prêt")


if __name__ == "__main__":
    main()
