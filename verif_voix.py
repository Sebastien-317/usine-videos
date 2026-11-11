"""Contrôle qualité : retranscrit la voix off scène par scène (Whisper local) pour repérer les mots mal prononcés."""
import json, sys
import numpy as np, soundfile as sf, sherpa_onnx
from pathlib import Path
t = "small" if Path("models/sherpa-onnx-whisper-small").exists() else "base"  # small : bien plus fiable en français
m = f"models/sherpa-onnx-whisper-{t}/"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=m+f"{t}-encoder.int8.onnx", decoder=m+f"{t}-decoder.int8.onnx", tokens=m+f"{t}-tokens.txt", language="fr", task="transcribe")
audio, sr = sf.read(sys.argv[1], dtype="float32")
timing = json.load(open(sys.argv[2])); story = json.load(open(sys.argv[3]))
for sc, st in zip(timing["scenes"], story["scenes"]):
    seg = audio[max(0, int(sc["debut"]*sr)): int(sc["fin"]*sr)]
    if len(seg) < sr // 10:
        continue
    s = rec.create_stream(); s.accept_waveform(sr, seg); rec.decode_stream(s)
    print("ATTENDU :", st["voix"]); print("ENTENDU :", s.result.text.strip()); print()
