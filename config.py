"""Lit les clés secrètes dans usine/.env (jamais dans le code ni dans les storyboards)."""
import os
from pathlib import Path

_ENV = Path(__file__).parent / ".env"
if _ENV.exists():
    for ligne in _ENV.read_text().splitlines():
        if "=" in ligne and not ligne.strip().startswith("#"):
            k, v = ligne.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


def env(nom):
    v = os.environ.get(nom)
    if not v:
        raise SystemExit(f"Clé manquante : {nom} (à mettre dans usine/.env)")
    return v
