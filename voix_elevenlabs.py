"""Voix off ElevenLabs par API (pour l'OptiPlex). Nécessite la variable d'environnement ELEVENLABS_API_KEY.

Le texte envoyé est la concaténation des champs "voix" du storyboard ; les balises d'émotion ([excited], [whispers]…)
peuvent être mises dans un champ "voix_jeu" par scène (sinon "voix" est utilisé tel quel).
Ensuite : python caler_voix.py sortie/voix_elevenlabs.mp3 storyboard.json sortie/

Usage : python voix_elevenlabs.py storyboard.json sortie/
Réglages dans storyboard["chaine"] : "voix_elevenlabs" (voice_id), "modele_elevenlabs" (par défaut eleven_v3).
Non testé dans l'espace de travail de Claude (pas d'accès réseau à ElevenLabs) : à valider au premier lancement.
"""
import base64
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from config import env


def requete(voice_id, modele, texte, horodate):
    corps = json.dumps({"text": texte, "model_id": modele, "language_code": "fr"}).encode()
    chemin = "/with-timestamps" if horodate else ""
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}{chemin}?output_format=mp3_44100_128",
        data=corps,
        headers={"xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json",
                 "Accept": "application/json" if horodate else "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=240) as r:
        return r.read()


def main():
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ch = story["chaine"]
    morceaux = []
    for sc in story["scenes"]:
        t = sc.get("voix_jeu", sc["voix"])
        # Sigles que la voix lit à l'anglaise (« dji-té-a ») : on les écrit comme ils se disent en français.
        for mot, dit in sorted(ch.get("prononciation_elevenlabs", {}).items(), key=lambda kv: -len(kv[0])):
            t = re.sub(rf"(?<![\w-]){re.escape(mot)}(?![\w-])", dit, t)
        morceaux.append(t)
    texte = " ".join(morceaux)
    voice_id = ch.get("voix_elevenlabs", "3Tp5mYhT9wrfnry9pzvV")  # Hugo – Punchy French Creator
    modeles = [ch.get("modele_elevenlabs", "eleven_v4"), "eleven_v3"]  # repli si le modèle n'est pas ouvert à l'API
    (out / "alignement_elevenlabs.json").unlink(missing_ok=True)
    for modele in dict.fromkeys(modeles):
        # 1) avec horodatage caractère par caractère (calage exact des mots), 2) sinon audio seul
        try:
            rep = json.loads(requete(voice_id, modele, texte, True))
            (out / "voix_elevenlabs.mp3").write_bytes(base64.b64decode(rep["audio_base64"]))
            if rep.get("alignment"):
                (out / "alignement_elevenlabs.json").write_text(json.dumps(
                    {"texte": texte, "morceaux": morceaux, "alignment": rep["alignment"]}, ensure_ascii=False))
            print("modèle :", modele, "(avec horodatage)")
            break
        except urllib.error.HTTPError as e:
            print(f"ElevenLabs a refusé l'horodatage pour {modele} ({e.code}) : {e.read()[:200]!r}")
        except (KeyError, ValueError) as e:
            print(f"Réponse horodatée illisible pour {modele} : {e}")
        try:
            (out / "voix_elevenlabs.mp3").write_bytes(requete(voice_id, modele, texte, False))
            print("modèle :", modele, "(sans horodatage)")
            break
        except urllib.error.HTTPError as e:
            print(f"ElevenLabs a refusé {modele} ({e.code}) : {e.read()[:200]!r}")
    else:
        raise SystemExit("Voix ElevenLabs impossible")
    print("voix prête :", out / "voix_elevenlabs.mp3", f"({len(texte)} caractères)")


if __name__ == "__main__":
    main()
