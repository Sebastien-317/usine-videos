"""Contrôle qualité d'un brouillon de storyboard écrit par le « cerveau », puis fusion avec la config de la chaîne.

Usage : python valider_storyboard.py brouillon.json chaines/gta6-fr.json sortie/storyboard.json
Code retour 0 = validé (storyboard final écrit), 1 = refusé (liste des problèmes affichée, rien n'est écrit).
"""
import difflib
import json
import re
import sys
import unicodedata
from datetime import date, timedelta
from pathlib import Path

ICI = Path(__file__).parent


def norm(t):
    t = re.sub(r"\[[^\]]*\]", " ", t)  # retire les balises d'intention ElevenLabs
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", t)


HABILLAGES = ("gros", "compteur", "question", "vrai_faux", "duel", "frise", "quiz", "alerte", "liste")
# Composition « Doc » (vraies images) : un habillage principal par scène, plus « lieu » et « tampon » en option
HABILLAGES_DOC = ("gros", "compteur", "document", "coupure", "liste", "duel", "frise")
EN_PLUS_DOC = ("lieu", "tampon")
# Six formats d'histoire et cinq thèmes visuels : deux vidéos qui se suivent ne partagent ni l'un ni l'autre
FORMATS = {
    "enquete": "une histoire vraie racontée comme un polar, l'accroche donne la fin choquante",
    "decryptage": "comment ou pourquoi c'est arrivé : le mécanisme expliqué pas à pas, l'accroche est une question",
    "top3": "trois faits classés du moins fort au plus fort (liste 3, 2, 1)",
    "mythe": "une croyance répandue confrontée aux faits, verdict au tampon",
    "saga": "une chronologie (frise) qui mène à un dénouement",
    "chiffre": "un seul chiffre fou, décortiqué et mis en perspective (compteur, duel)",
}
THEMES_DOC = ("dossier", "neon", "presse", "data", "terminal")


def nombres(t):
    return re.findall(r"\d+(?:[.,]\d+)?", t)


def fin_mots(t, n=3):
    return " ".join(re.findall(r"[a-zà-ÿ0-9']+", t.lower())[-n:])


def precedentes(ch, sortie):
    """Vidéos à ne pas imiter : l'historique de la chaîne (30 jours) et les autres vidéos préparées le même jour."""
    vues, jour_, h = [], [], ICI / "historique.jsonl"
    limite = (date.today() - timedelta(days=30)).isoformat()
    if h.exists():
        for l in h.read_text().splitlines():
            try:
                x = json.loads(l)
            except Exception:
                continue
            if x.get("chaine") == ch["id"] and x.get("date", "") >= limite:
                vues.append(x)
    if sortie:
        jour = sortie.parent.name[:10]
        for f in sorted(sortie.parent.parent.glob(f"{jour}-{ch['id']}-*/storyboard.json")):
            if f.parent.resolve() == sortie.parent.resolve():
                continue
            try:
                x = json.loads(f.read_text())
                jour_.append({"titre": x.get("titre", ""), "format": x.get("format"), "theme": x.get("theme"),
                              "accroche": x["scenes"][0]["voix"], "fin": x["scenes"][-1]["voix"]})
            except Exception:
                pass
    # Les démos de l'atelier sont des histoires déjà racontées : on ne les refait pas (comparées au titre et à l'accroche)
    for f in sorted((ICI / "brouillons").glob("demo-*.json")):
        try:
            x = json.loads(f.read_text())
            vues.insert(0, {"titre": x.get("titre", ""), "accroche": x["scenes"][0]["voix"], "fin": x["scenes"][-1]["voix"]})
        except Exception:
            pass
    return vues, jour_


def regles_doc(b, sc, ch, sortie):
    """Variété (format, thème, ton, boucle) et densité (faits appris, sources) des vidéos « Doc »."""
    pb = []
    fmt, th = b.get("format"), b.get("theme")
    if fmt not in FORMATS:
        pb.append(f"Champ « format » obligatoire, parmi : {', '.join(FORMATS)}.")
    if th not in THEMES_DOC:
        pb.append(f"Champ « theme » obligatoire, parmi : {', '.join(THEMES_DOC)}.")
    v1 = sc[0].get("voix", "")
    if fmt == "top3":
        nums = [s["liste"].get("numero") for s in sc if s.get("liste")]
        if nums != [3, 2, 1]:
            pb.append(f"Format top3 : trois scènes « liste » numérotées 3, puis 2, puis 1 (trouvé : {nums}).")
        if "3" not in v1 and "trois" not in v1.lower():
            pb.append("Format top3 : l'accroche annonce les 3 (« 3 secrets que… »).")
    if fmt == "mythe" and not any(s.get("tampon") for s in sc):
        pb.append("Format mythe : un « tampon » donne le verdict (VRAI, FAUX, EXAGÉRÉ…).")
    if fmt == "saga" and not any(s.get("frise") for s in sc):
        pb.append("Format saga : il faut une « frise » (2 à 4 dates).")
    if fmt == "chiffre":
        if not re.search(r"\d", v1):
            pb.append("Format chiffre : l'accroche contient LE chiffre.")
        if not any(s.get("compteur") for s in sc[:3]):
            pb.append("Format chiffre : un « compteur » dans les 3 premières scènes.")
    if fmt == "decryptage":
        if "?" not in v1 and not re.match(r"(?i)(comment|pourquoi)", v1):
            pb.append("Format décryptage : l'accroche est une question (« Comment… ? », « Pourquoi… ? »).")
        if not any(s.get("document") or s.get("frise") for s in sc):
            pb.append("Format décryptage : un « document » ou une « frise » montre le mécanisme.")

    # Densité : ce que le spectateur apprend, appuyé sur des faits sourcés
    app = [a for a in b.get("apprend", []) if isinstance(a, str) and len(a.strip()) >= 20]
    if len(app) < 3:
        pb.append("Champ « apprend » : au moins 3 choses précises que le spectateur ne savait pas (une phrase chacune, 20 caractères min).")
    src = [x for x in b.get("sources", []) if str(x.get("url", "")).startswith("http") and x.get("fait")]
    if len(src) < 4:
        pb.append(f"Densité : {len(src)} fait(s) sourcé(s), il en faut au moins 4 (un par élément de « sources »).")
    if len({re.sub(r"^https?://(www\.)?", "", x["url"]).split("/")[0] for x in src}) < 2:
        pb.append("Sources : au moins 2 médias différents.")

    # Ton de voix varié : le chuchotement est un effet, pas un style
    tags = [t.lower() for s in sc for t in re.findall(r"\[([^\]]+)\]", s.get("voix_jeu", ""))]
    if tags.count("whispers") > 1:
        pb.append(f"[whispers] utilisé {tags.count('whispers')} fois : une fois au maximum par vidéo (varie : [curious], [excited], [surprised], [dramatically]…).")
    for t in set(tags):
        if tags.count(t) > 3:
            pb.append(f"Balise [{t}] utilisée {tags.count(t)} fois : 3 au maximum, varie le ton.")

    # Variété : ni le même format ni le même thème que la vidéo précédente ou celle du même jour ; pas de redite
    hist, jour = precedentes(ch, sortie)
    vues = hist + jour
    for x in jour + hist[-1:]:
        if fmt and x.get("format") == fmt:
            pb.append(f"Format « {fmt} » déjà utilisé par « {x.get('titre')} » (vidéo précédente ou du même jour) : choisis-en un autre.")
        if th and x.get("theme") == th:
            pb.append(f"Thème « {th} » déjà utilisé par « {x.get('titre')} » (vidéo précédente ou du même jour) : choisis-en un autre.")
    for x in vues:
        for a, c, quoi in ((b.get("titre", ""), x.get("titre", ""), "titre"), (v1, x.get("accroche", ""), "accroche")):
            if a and c and difflib.SequenceMatcher(None, norm(a), norm(c)).ratio() > 0.6:
                pb.append(f"{quoi.capitalize()} trop proche d'une vidéo déjà faite (« {c} ») : histoire différente exigée.")
    fins = {fin_mots(x.get("fin", "")) for x in vues[-8:] if x.get("fin")}
    if sc and fin_mots(sc[-1].get("voix", "")) in fins:
        pb.append(f"Formule de fin « …{fin_mots(sc[-1]['voix'])}… » déjà utilisée récemment : invente une autre chute en boucle.")
    return list(dict.fromkeys(pb))


def valider(b, ch, sortie=None):
    pb, avert = [], []
    doc = ch.get("composition") == "Doc"
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
    if doc:
        fin = sc[-1]["voix"].strip() if sc else ""
        if sc and sc[-1].get("question"):
            pb.append("Dernière scène : pas de carte question. La vidéo se termine en boucle : la dernière phrase s'enchaîne avec la première.")
        if sc and not fin.endswith(("…", "...")):
            pb.append("Dernière scène : la voix doit finir en suspens par « … » (ex. « Tout ça parce que… ») pour s'enchaîner avec la phrase d'accroche.")
        if any("commentaire" in s["voix"].lower() for s in sc):
            pb.append("La voix ne doit jamais dire « commentaire » : pas d'appel à commenter, la fin boucle sur le début.")
        if sc:
            avert.append(f"Boucle à relire à voix haute : « {fin} {sc[0]['voix']} »")
        pb += regles_doc(b, sc, ch, sortie)
    elif not sc[-1].get("question"):
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
        vn = v.replace(" ", "").replace("\u202f", "")
        def dit(n):
            return n in v or n.replace(",", ".") in v or n in vn
        def verifier(texte, quoi):
            for n in nombres(str(texte)):
                if not dit(n):
                    pb.append(f"Scène {i} : le chiffre « {n} » ({quoi}) n'est pas dit dans la voix.")
        if doc:
            vis = s.get("visuels") or []
            if not 1 <= len(vis) <= 4:
                pb.append(f"Scène {i} : « visuels » doit lister 1 à 4 visuels (2 ou 3 conseillés).")
            for x in vis:
                typ, _, val = str(x).partition(":")
                if typ not in ("pixabay", "3d") or not val.strip():
                    pb.append(f"Scène {i} : visuel « {x} » invalide (pixabay:mots anglais ou 3d:rue_neon).")
                elif typ == "3d" and val not in ch["plans_autorises"]:
                    pb.append(f"Scène {i} : plan 3D « {val} » inconnu.")
                elif typ == "pixabay" and val.startswith("#") and not val[1:].split()[0].isdigit():
                    pb.append(f"Scène {i} : « {x} » : après # il faut l'identifiant numérique du clip (ex. pixabay:#250395).")
                elif typ == "pixabay" and len(val) > 60:
                    pb.append(f"Scène {i} : recherche Pixabay trop longue (3 à 5 mots anglais).")
            principaux = [k for k in HABILLAGES_DOC if s.get(k)]
            if len(principaux) > 1:
                pb.append(f"Scène {i} : un seul habillage principal parmi {' / '.join(HABILLAGES_DOC)} ({principaux}).")
            if not principaux and not any(s.get(k) for k in EN_PLUS_DOC):
                avert.append(f"Scène {i} : aucun habillage : seuls les sous-titres et l'image porteront la scène.")
            if s.get("lieu"):
                if len(s["lieu"]) > 32:
                    pb.append(f"Scène {i} : lieu trop long (32 caractères max).")
                verifier(s["lieu"], "lieu")
            if s.get("document"):
                d = s["document"]
                if not d.get("titre") or not 1 <= len(d.get("lignes", [])) <= 4 or any(len(l) > 34 for l in d.get("lignes", [])):
                    pb.append(f"Scène {i} : document = un titre et 1 à 4 lignes de 34 caractères max.")
                for l in d.get("lignes", []):
                    verifier(l, "document")
            if s.get("coupure"):
                c = s["coupure"]
                if not c.get("source") or not c.get("titre") or len(c["titre"]) > 70:
                    pb.append(f"Scène {i} : coupure = une source (nom du média) et un titre réécrit de 70 caractères max.")
                verifier(c.get("titre", ""), "coupure")
            if s.get("tampon"):
                verifier(s["tampon"], "tampon")
                if s.get("tamponMot") and str(s["tamponMot"]).lower() not in v.lower():
                    pb.append(f"Scène {i} : tamponMot « {s['tamponMot']} » doit être un mot de la voix.")
        else:
            plans = s.get("plans", [])
            if not plans or any(p not in ch["plans_autorises"] for p in plans):
                pb.append(f"Scène {i} : plans invalides {plans} (autorisés : {', '.join(ch['plans_autorises'])}).")
            habillages = [k for k in HABILLAGES if s.get(k)]
            if len(habillages) > 1:
                pb.append(f"Scène {i} : un seul habillage parmi {' / '.join(HABILLAGES)} ({habillages}).")
            if not habillages:
                avert.append(f"Scène {i} : aucun habillage, la scène risque d'être plate.")
        if s.get("vrai_faux"):
            vf = s["vrai_faux"]
            if str(vf.get("verdict", "")).upper() not in ("VRAI", "FAUX"):
                pb.append(f"Scène {i} : vrai_faux.verdict doit valoir VRAI ou FAUX.")
            elif str(vf["verdict"]).lower() not in v.lower():
                pb.append(f"Scène {i} : la voix doit prononcer le verdict « {vf['verdict']} » (c'est lui qui déclenche le tampon).")
            if not vf.get("affirmation") or len(vf["affirmation"]) > 60:
                pb.append(f"Scène {i} : vrai_faux.affirmation obligatoire, 60 caractères max.")
            verifier(vf.get("affirmation", ""), "affirmation")
        if s.get("duel"):
            d = s["duel"]
            for cote in ("gauche", "droite"):
                c = d.get(cote) or {}
                if not isinstance(c.get("valeur"), (int, float)) or not c.get("label"):
                    pb.append(f"Scène {i} : duel.{cote} doit avoir une valeur numérique et un label.")
                else:
                    verifier(str(c["valeur"]).replace(".", ","), f"duel {cote}")
                    if len(c["label"]) > 24:
                        pb.append(f"Scène {i} : label du duel trop long (24 caractères max).")
        if s.get("frise"):
            et = s["frise"].get("etapes") or []
            if not 2 <= len(et) <= 4 or any(not e.get("date") or len(e["date"]) > 16 for e in et):
                pb.append(f"Scène {i} : frise = 2 à 4 étapes avec une « date » de 16 caractères max.")
            for e in et:
                verifier(e.get("date", ""), "frise")
        if s.get("quiz"):
            q = s["quiz"]
            choix = q.get("choix") or []
            if not 2 <= len(choix) <= 4 or not isinstance(q.get("bonne"), int) or not 0 <= q["bonne"] < len(choix):
                pb.append(f"Scène {i} : quiz = 2 à 4 choix et « bonne » = index (0 = premier) de la bonne réponse.")
            if any(len(c) > 14 for c in choix) or len(q.get("question", "")) > 50:
                pb.append(f"Scène {i} : quiz trop long (choix 14 caractères, question 50 max).")
            for c in choix:
                verifier(c, "choix du quiz")
        if s.get("alerte"):
            if not s["alerte"].get("texte") or len(s["alerte"]["texte"]) > 50:
                pb.append(f"Scène {i} : alerte.texte obligatoire, 50 caractères max.")
            verifier(s["alerte"].get("texte", ""), "alerte")
        if s.get("liste"):
            if not isinstance(s["liste"].get("numero"), int):
                pb.append(f"Scène {i} : liste.numero doit être un entier.")
            if s["liste"].get("texte") and max(len(l) for l in s["liste"]["texte"].split("|")) > 14:
                avert.append(f"Scène {i} : texte de liste long (> 14 caractères par ligne).")
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

    types = {k for s in sc for k in (HABILLAGES_DOC + EN_PLUS_DOC if doc else HABILLAGES) if s.get(k)}
    if sc and len(types) < 3:
        pb.append(f"Seulement {len(types)} type(s) d'habillage ({', '.join(sorted(types))}) : il en faut au moins 3 différents pour que la vidéo reste vivante.")

    src = b.get("sources", [])
    ok = [x for x in src if str(x.get("url", "")).startswith("http") and x.get("fait")]
    if len(ok) < 2 and not doc:
        pb.append("Il faut au moins 2 sources (fait + url) vérifiées le jour même.")
    leg = b.get("legende", "")
    if len(leg) > 2200 or "#" not in leg:
        pb.append("Légende : 2200 caractères max et au moins un hashtag.")
    vides = [h for h in re.findall(r"#\w+", leg.lower()) if h in ("#fyp", "#foryou", "#foryoupage", "#pourtoi", "#viral", "#trending", "#xyzbca", "#fy")]
    if vides:
        pb.append(f"Hashtags inutiles (TikTok les ignore, ils font même moins bien) : {', '.join(vides)}.")
    # Recherche TikTok : le sujet doit être dit tôt et écrit au début de la légende, avec les mots que les gens tapent
    cles = [c.lower() for c in ch.get("mots_cles_recherche", [])]
    if cles and doc:
        if not any(c in re.sub(r"#\w+", "", leg)[:80].lower() for c in cles):
            pb.append(f"Légende : les 80 premiers caractères doivent contenir un mot que les gens cherchent ({', '.join(ch['mots_cles_recherche'])}), pas seulement les hashtags.")
        if sc and not any(c in " ".join(x.get("voix", "") for x in sc[:2]).lower() for c in cles):
            pb.append(f"La voix des 2 premières scènes doit dire le sujet avec un mot cherché ({', '.join(ch['mots_cles_recherche'])}).")
    return pb, avert


def main():
    b = json.loads(Path(sys.argv[1]).read_text())
    ch = json.loads(Path(sys.argv[2]).read_text())
    pb, avert = valider(b, ch, Path(sys.argv[3]))
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
        "boucle": ch["composition"] == "Doc",
        "chaine": {k: ch[k] for k in ("id", "nom", "langue", "voix", "vitesse", "prononciation", "prononciation_elevenlabs", "moteur_voix", "voix_elevenlabs", "modele_elevenlabs") if k in ch},
        **{k: b[k] for k in ("titre", "legende", "sources", "scenes", "format", "theme", "apprend") if k in b},
    }
    out = Path(sys.argv[3])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(final, ensure_ascii=False, indent=2))
    print(f"VALIDÉ : {sum(len(s['voix']) for s in b['scenes'])} caractères de voix, {len(b['scenes'])} scènes → {out}")


if __name__ == "__main__":
    main()
