"""Génère chaque voix de demande.json avec ElevenLabs (horodatage caractère par caractère).
La clé est lue dans ELEVENLABS_API_KEY et n'est jamais affichée.
Usage : python3 generer.py demande.json dossier_sortie/"""
import base64, json, os, sys, urllib.error, urllib.request
from pathlib import Path

def appel(voice_id, modele, texte):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": texte, "model_id": modele, "language_code": "fr"}).encode(),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read())

demande = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
journal = []
for v in demande["voix"]:
    for modele in [v.get("modele", "eleven_v4"), "eleven_v3"]:
        try:
            rep = appel(v["voice_id"], modele, v["texte"])
            (out / f"{v['nom']}.mp3").write_bytes(base64.b64decode(rep["audio_base64"]))
            (out / f"{v['nom']}_alignement.json").write_text(json.dumps({"texte": v["texte"], "modele": modele, "alignment": rep.get("alignment")}, ensure_ascii=False))
            journal.append(f"{v['nom']} : OK ({modele}, {len(v['texte'])} caractères)")
            break
        except urllib.error.HTTPError as e:
            journal.append(f"{v['nom']} : refus {modele} ({e.code}) {e.read()[:200]!r}")
    else:
        journal.append(f"{v['nom']} : ÉCHEC")
(out / "journal.txt").write_text("\n".join(journal) + "\n")
print("\n".join(journal))
