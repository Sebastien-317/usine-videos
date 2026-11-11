"""Voix off ElevenLabs par API (pour l'OptiPlex). Nécessite la variable d'environnement ELEVENLABS_API_KEY.

Le texte envoyé est la concaténation des champs "voix" du storyboard ; les balises d'émotion ([excited], [whispers]…)
peuvent être mises dans un champ "voix_jeu" par scène (sinon "voix" est utilisé tel quel).
Ensuite : python caler_voix.py sortie/voix_elevenlabs.mp3 storyboard.json sortie/

Usage : python voix_elevenlabs.py storyboard.json sortie/
Réglages dans storyboard["chaine"] : "voix_elevenlabs" (voice_id), "modele_elevenlabs" (par défaut eleven_v3).
Non testé dans l'espace de travail de Claude (pas d'accès réseau à ElevenLabs) : à valider au premier lancement.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from config import env


def main():
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ch = story["chaine"]
    texte = " ".join(sc.get("voix_jeu", sc["voix"]) for sc in story["scenes"])
    voice_id = ch.get("voix_elevenlabs", "3Tp5mYhT9wrfnry9pzvV")  # Hugo – Punchy French Creator
    modeles = [ch.get("modele_elevenlabs", "eleven_v4"), "eleven_v3"]  # repli si le modèle n'est pas ouvert à l'API
    for modele in dict.fromkeys(modeles):
        corps = json.dumps({"text": texte, "model_id": modele, "language_code": "fr"}).encode()
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
            data=corps,
            headers={"xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json", "Accept": "audio/mpeg"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                (out / "voix_elevenlabs.mp3").write_bytes(r.read())
            print("modèle :", modele)
            break
        except urllib.error.HTTPError as e:
            print(f"ElevenLabs a refusé {modele} ({e.code}) : {e.read()[:200]!r}")
    else:
        raise SystemExit("Voix ElevenLabs impossible")
    print("voix prête :", out / "voix_elevenlabs.mp3", f"({len(texte)} caractères)")


if __name__ == "__main__":
    main()
