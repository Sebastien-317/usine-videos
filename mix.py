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


def ding():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    return norm((np.sin(2 * np.pi * 1320 * t) + 0.5 * np.sin(2 * np.pi * 1980 * t)) * env(n, 0.002, 0.18))


def buzz():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    onde = np.sign(np.sin(2 * np.pi * 110 * t)) + 0.6 * np.sign(np.sin(2 * np.pi * 167 * t))
    return norm(passe_bas(onde, 2200) * env(n, 0.005, 0.3))


def riser(duree=0.7):
    n = int(duree * SR)
    fc = 300 + 7000 * np.linspace(0, 1, n) ** 2
    return norm(passe_bas(rng.standard_normal(n), fc) * np.linspace(0, 1, n) ** 2)


def alarme():
    morceaux = []
    for f in (880, 660, 880, 660):
        n = int(0.14 * SR)
        t = np.arange(n) / SR
        morceaux.append(np.sin(2 * np.pi * f * t) * env(n, 0.003, 0.2))
        morceaux.append(np.zeros(int(0.03 * SR)))
    return norm(np.concatenate(morceaux))


def clic():
    n = int(0.014 * SR)
    b = rng.standard_normal(n)
    return norm((b - passe_bas(b, 2500)) * env(n, 0.0003, 0.004))


def nappe_sombre(duree, fin_pulse):
    """Ambiance « enquête » : drone grave qui respire + battement de cœur lent + tic discret."""
    n = int(duree * SR) + SR
    t = np.arange(n) / SR
    drone = sum(((f * t) % 1) * 2 - 1 for f in (55.0, 55.35, 82.4, 110.2))
    drone = passe_bas(drone, 260 + 120 * np.sin(2 * np.pi * t / 7) ** 2) * (0.55 + 0.25 * np.sin(2 * np.pi * t / 5.3))
    piste = 0.5 * norm(drone)
    periode = 60 / 72
    b = 0.0
    while b < fin_pulse:
        poser(piste, kick(), b, 0.75)
        poser(piste, kick(), b + 0.24, 0.4)
        poser(piste, hat(), b + periode / 2, 0.05)
        b += periode
    return piste


def nm(m):
    import unicodedata
    m = unicodedata.normalize("NFD", m.lower())
    return "".join(c for c in m if c.isalnum() and unicodedata.category(c) != "Mn")


def caler(mots, debut, textes, dur, frac=0.7, dernier=False):
    """Même calcul que caler() dans Viral.tsx : instants (en s, absolus) où la voix dit chaque texte."""
    res, i0 = [], 0
    for k, tx in enumerate(textes):
        cle = nm(str(tx).split()[0]) if str(tx).split() else ""
        trouve = -1
        idx = range(len(mots) - 1, i0 - 1, -1) if dernier else range(i0, len(mots))
        for j in idx:
            if cle and nm(mots[j]["mot"]) == cle:
                trouve = j
                break
        if trouve >= 0:
            i0 = trouve + 1
            res.append(max(debut, round(mots[trouve]["debut"] * FPS - 2) / FPS))
        else:
            res.append(debut + dur * frac * (k + (1 if len(textes) == 1 else 0)) / max(1, len(textes)))
    return res


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
    fin_beat = duree if story.get("boucle") else debuts[-1]  # en boucle : pas de coupure ; sinon le beat coupe sur la question

    sombre = story.get("composition") == "Doc"
    temps = 60 / BPM
    if sombre:
        beat = nappe_sombre(duree, fin_beat)[:n]
        fin_beat = -1  # pas de beat dansant
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
        fin_sc = debuts[i + 1] if i + 1 < len(debuts) else duree
        mots = timing["scenes"][i].get("mots", [])
        if sc.get("tampon"):
            if sc.get("tamponMot"):
                ta = caler(mots, t0, [sc["tamponMot"]], fin_sc - t0, 0.6, True)[0]
            elif sombre:
                ta = t0 + sc.get("tamponA", (fin_sc - t0) * 0.6)
            else:
                ta = t0 + round(sc.get("tamponA", 1) * FPS) / FPS
            poser(sfx, riser(0.5), ta - 0.5, 0.3)
            poser(sfx, impact(0.9), ta, 0.9)
        if sc.get("lieu"):
            for k, c in enumerate(sc["lieu"]):
                if c != " ":
                    poser(sfx, clic(), t0 + (3 + k * 1.1) / FPS, 0.28)
        if sc.get("document"):
            lignes = sc["document"].get("lignes", [])
            pas = max(6, int((fin_sc - t0) * FPS * 0.55 / max(1, len(lignes))))
            poser(sfx, whoosh(0.4), t0, 0.4)
            for k in range(len(lignes)):
                for j in range(9):
                    poser(sfx, clic(), t0 + (8 + k * pas + j * 1.5) / FPS, 0.22)
            if sc["document"].get("tampon"):
                poser(sfx, impact(0.8), t0 + round((fin_sc - t0) * FPS * 0.62) / FPS, 0.85)
        if sc.get("coupure"):
            poser(sfx, whoosh(0.35), t0 - 0.05, 0.5)
            poser(sfx, pop(), t0 + 0.2, 0.25)
        if sc.get("vrai_faux"):
            r = caler(mots, t0, [sc["vrai_faux"]["verdict"]], fin_sc - t0, 0.62, True)[0]
            poser(sfx, riser(0.7), r - 0.7, 0.35)
            poser(sfx, impact(0.8), r, 0.8)
            poser(sfx, ding() if str(sc["vrai_faux"]["verdict"]).upper() == "VRAI" else buzz(), r, 0.55)
        if sc.get("duel"):
            for j in range(10):
                poser(sfx, tic(), t0 + (8 + j * 26 / 10) / FPS, 0.3)
            poser(sfx, impact(0.8), t0 + 36 / FPS, 0.75)
            poser(sfx, ding(), t0 + 36 / FPS, 0.35)
        if sc.get("frise"):
            et = sc["frise"].get("etapes", [])
            for e, r in zip(et, caler(mots, t0, [e.get("date", "") for e in et], fin_sc - t0, 0.75)):
                poser(sfx, whoosh(0.3), r - 0.1, 0.4)
                poser(sfx, pop(), r + 0.05, 0.35)
                if e.get("barre"):
                    poser(sfx, impact(0.4), r + 12 / FPS, 0.5)
            if et and not et[-1].get("barre"):
                poser(sfx, ding(), caler(mots, t0, [et[-1].get("date", "")], fin_sc - t0, 0.75)[0] + 0.1, 0.4)
        if sc.get("quiz"):
            rev = fin_sc - 14 / FPS
            tt = t0 + 0.3
            while tt < rev - 0.2:
                poser(sfx, tic(), tt, 0.25)
                tt += 0.5
            poser(sfx, ding(), rev, 0.6)
            poser(sfx, impact(0.5), rev, 0.4)
        if sc.get("alerte"):
            poser(sfx, alarme(), t0 + 0.05, 0.45)
        if sc.get("liste"):
            poser(sfx, impact(0.6), t0 + 0.12, 0.6)
        if sc.get("question"):
            fin = debuts[i + 1] if i + 1 < len(debuts) else duree
            poser(sfx, impact(), t0, 0.7)
            poser(sfx, pop(), t0 + round((fin - t0) * FPS * 0.35) / FPS, 0.6)

    sf.write(out / "nappe.wav", (norm(beat) * 0.8).astype(np.float32), SR)
    sf.write(out / "bruitages.wav", (norm(sfx) * 0.9).astype(np.float32), SR)
    print("habillage prêt")


if __name__ == "__main__":
    main()
