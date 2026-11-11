"""Contrôle qualité d'un brouillon de storyboard écrit par le « cerveau », puis fusion avec la config de la chaîne.

Usage : python valider_storyboard.py brouillon.json chaines/gta6-fr.json sortie/storyboard.json
Code retour 0 = validé (storyboard final écrit), 1 = refusé (liste des problèmes affichée, rien n'est écrit).
"""
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path


def norm(t):
    t = re.sub(r"\[[^\]]*\]", " ", t)  # retire les balises d'intention ElevenLabs
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", t)


def nombres(t):
    return re.findall(r"\d+(?:[.,]\d+)?", t)


def valider(b, ch):
    pb, avert = [], []
    sc = b.get("scenes", [])
    if not 6 <= len(sc) <= 10:
        pb.append(f"{len(sc)} scènes : il en faut entre 6 et 10.")
    for k in ("titre", "legende", "sources"):
        if k not in b:
            pb.append(f"Champ manquant : {k}.")
    if not sc:
        return pb, avert

    total = sum(len(s.get("voix", "")) for s in sc)
    if total > ch["max_caracteres_voix"]:
        pb.append(f"Voix trop longue : {total} caractères (max {ch['max_caracteres_voix']}). Raccourcir.")
    if total < ch["min_caracteres_voix"]:
        pb.append(f"Voix trop courte : {total} caractères (min {ch['min_caracteres_voix']}).")

    if not sc[0].get("gros"):
        pb.append("Scène 1 : il faut un texte choc « gros » (l'accroche lisible sans le son).")
    elif len(sc[0]["gros"].replace("|", "")) > 24:
        pb.append("Scène 1 : accroche trop longue (24 caractères max).")
    if len(sc[0].get("voix", "")) > 60:
        avert.append("Scène 1 : la phrase d'accroche dépasse 60 caractères, elle risque d'être trop lente.")
    if not sc[-1].get("question"):
        pb.append("Dernière scène : il faut une question finale (champ « question ») pour faire réagir en commentaire.")

    for i, s in enumerate(sc, 1):
        v = s.get("voix", "").strip()
        if not v:
            pb.append(f"Scène {i} : voix vide.")
            continue
        if "[" in v:
            pb.append(f"Scène {i} : pas de balise [..] dans « voix » (les mettre dans « voix_jeu »).")
        if s.get("voix_jeu") and norm(s["voix_jeu"]) != norm(v):
            # Une réécriture phonétique d'un nom propre (« Dèdpoul ») est permise, pas un autre texte.
            if difflib.SequenceMatcher(None, norm(s["voix_jeu"]), norm(v)).ratio() < 0.75:
                pb.append(f"Scène {i} : « voix_jeu » ne dit pas les mêmes mots que « voix » (seules les réécritures phonétiques sont permises).")
            else:
                avert.append(f"Scène {i} : « voix_jeu » réécrit des mots en phonétique, vérifie que le sens est identique.")
        plans = s.get("plans", [])
        if not plans or any(p not in ch["plans_autorises"] for p in plans):
            pb.append(f"Scène {i} : plans invalides {plans} (autorisés : {', '.join(ch['plans_autorises'])}).")
        habillages = [k for k in ("gros", "compteur", "question") if s.get(k)]
        if len(habillages) > 1:
            pb.append(f"Scène {i} : un seul habillage parmi gros / compteur / question ({habillages}).")
        if s.get("gros"):
            for n in nombres(s["gros"]):
                if n not in v and n.replace(",", ".") not in v:
                    pb.append(f"Scène {i} : le chiffre « {n} » affiché n'est pas dit dans la voix.")
            if max(len(l) for l in s["gros"].split("|")) > 14:
                avert.append(f"Scène {i} : ligne de texte choc longue (> 14 caractères), elle sera rétrécie.")
        if s.get("compteur"):
            c = s["compteur"]
            if not isinstance(c.get("valeur"), (int, float)):
                pb.append(f"Scène {i} : compteur.valeur doit être un nombre.")
            else:
                val = str(c["valeur"]).replace(".", ",")
                if val not in v and str(c["valeur"]) not in v:
                    pb.append(f"Scène {i} : la valeur du compteur ({val}) n'est pas dite dans la voix.")
            if len(c.get("label", "")) > 32:
                pb.append(f"Scène {i} : label du compteur trop long (32 caractères max).")
        if s.get("tampon") and len(s["tampon"]) > 18:
            pb.append(f"Scène {i} : tampon trop long (18 caractères max).")

    src = b.get("sources", [])
    ok = [x for x in src if str(x.get("url", "")).startswith("http") and x.get("fait")]
    if len(ok) < 2:
        pb.append("Il faut au moins 2 sources (fait + url) vérifiées le jour même.")
    leg = b.get("legende", "")
    if len(leg) > 2200 or "#" not in leg:
        pb.append("Légende : 2200 caractères max et au moins un hashtag.")
    return pb, avert


def main():
    b = json.loads(Path(sys.argv[1]).read_text())
    ch = json.loads(Path(sys.argv[2]).read_text())
    pb, avert = valider(b, ch)
    for a in avert:
        print("AVERTISSEMENT :", a)
    if pb:
        print("REFUSÉ :")
        for p in pb:
            print(" -", p)
        sys.exit(1)
    for i, s in enumerate(b["scenes"]):
        s.setdefault("seed", 11 + i * 13)
    final = {
        "composition": ch["composition"],
        "chaine": {k: ch[k] for k in ("id", "nom", "langue", "voix", "vitesse", "prononciation", "moteur_voix", "voix_elevenlabs", "modele_elevenlabs")},
        **{k: b[k] for k in ("titre", "legende", "sources", "scenes")},
    }
    out = Path(sys.argv[3])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(final, ensure_ascii=False, indent=2))
    print(f"VALIDÉ : {sum(len(s['voix']) for s in b['scenes'])} caractères de voix, {len(b['scenes'])} scènes → {out}")


if __name__ == "__main__":
    main()
