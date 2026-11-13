"""Récupère dans l'historique ElevenLabs (sans nouvelle génération, donc sans crédit) l'audio
des voix de demande.json, en prenant pour chaque voix l'entrée la plus récente de même voix et même texte.
Usage : python3 recuperer.py demande.json dossier_sortie/"""
import json, os, sys, urllib.error, urllib.request
from pathlib import Path

def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Accept": accept})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

demande = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
journal = []
try:
    hist = json.loads(get("https://api.elevenlabs.io/v1/history?page_size=50"))["history"]
except urllib.error.HTTPError as e:
    journal.append(f"historique refusé ({e.code}) : {e.read()[:300]!r}"); hist = []
except Exception as e:
    journal.append(f"historique illisible : {type(e).__name__} {e}"); hist = []
for v in demande["voix"]:
    cands = [h for h in hist if h.get("voice_id") == v["voice_id"] and (h.get("text") or "").strip() == v["texte"].strip()]
    if not cands:
        cands = [h for h in hist if h.get("voice_id") == v["voice_id"]]
    if not cands:
        journal.append(f"{v['nom']} : introuvable dans l'historique"); continue
    h = max(cands, key=lambda x: x.get("date_unix", 0))
    try:
        (out / f"{v['nom']}.mp3").write_bytes(get(f"https://api.elevenlabs.io/v1/history/{h['history_item_id']}/audio", "audio/mpeg"))
    except urllib.error.HTTPError as e:
        journal.append(f"{v['nom']} : audio refusé ({e.code}) : {e.read()[:300]!r}"); continue
    journal.append(f"{v['nom']} : récupéré ({h['history_item_id']}, texte identique : {(h.get('text') or '').strip() == v['texte'].strip()})")
(out / "journal_recuperation.txt").write_text("\n".join(journal) + "\n")
print("\n".join(journal))
