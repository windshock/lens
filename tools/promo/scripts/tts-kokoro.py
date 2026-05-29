#!/usr/bin/env python3
"""
tools/promo/scripts/tts-kokoro.py — generate English narration via Kokoro-82M.

Reads narration text from public/audio/script.json (the .en.* keys) and writes
public/audio/scene{N}-en.mp3 (one per scene). Each clip's actual duration is
reported so it can be compared to its scene budget in src/PromoVideo.jsx.

Usage:
    ~/Downloads/tts/.venv-kokoro/bin/python scripts/tts-kokoro.py [--voice <voice>] [--speed <s>]

Setup (one-time, shared across all projects on this machine):
    ~/Downloads/tts/scripts/setup-kokoro.sh

Options:
    --voice    Kokoro voice id (default: af_heart)
               Other good options: af_bella, af_nicole, am_michael, bm_george
    --speed    Speech speed multiplier (default: 1.0; promo videos work well at 1.05–1.1)

Kokoro is loaded once and reused across scenes. M-series Mac generates each
clip in well under 1 sec, so the whole batch finishes in a few seconds. For
single-text use from any other project, the shared CLI is simpler:
    ~/Downloads/tts/kokoro "text" out.mp3 [--voice af_heart] [--speed 1.0]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_JSON = ROOT / "public" / "audio" / "script.json"
OUT_DIR = ROOT / "public" / "audio"


def wav_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-hide_banner", "-loglevel", "error",
         "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    )
    return float(out.decode().strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    with SCRIPT_JSON.open() as f:
        data = json.load(f)

    en_lines = data.get("en", {})
    if not en_lines:
        print("script.json has no .en entries", file=sys.stderr)
        return 1

    print(f"Loading Kokoro (voice={args.voice}, speed={args.speed})…")
    t0 = time.time()
    pipeline = KPipeline(lang_code="a")  # American English
    print(f"  loaded in {time.time() - t0:.1f}s")

    budgets = {s["id"]: s["durationFrames"] / 30.0 for s in data["scenes"]}

    for scene_id, text in en_lines.items():
        if not text:
            continue
        wav = OUT_DIR / f"{scene_id}-en.wav"
        mp3 = OUT_DIR / f"{scene_id}-en.mp3"

        t0 = time.time()
        gen = pipeline(text, voice=args.voice, speed=args.speed)
        # First (only, for short text) chunk
        audio_chunk = None
        for _, _, audio in gen:
            audio_chunk = audio
            break
        if audio_chunk is None:
            print(f"  ! {scene_id}: empty audio output")
            continue
        sf.write(str(wav), audio_chunk, 24000)
        # Convert to mp3 via ffmpeg (matches MeloTTS / say output format)
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
             "-i", str(wav),
             "-codec:a", "libmp3lame", "-qscale:a", "4",
             str(mp3)],
            check=True
        )
        wav.unlink()  # keep only mp3

        dur = wav_duration(mp3)
        budget = budgets.get(scene_id, 0)
        marker = "✓" if dur <= budget else "!"
        gen_time = time.time() - t0
        print(f"  {marker} {mp3.name}  {dur:.1f}s / budget {budget:.0f}s  (gen {gen_time:.1f}s)")

    print("\nDone. If any clip exceeds its scene budget, raise --speed or shorten")
    print("the text in script.json. Kokoro voice options: af_heart (default), af_bella,")
    print("af_nicole, am_michael, am_eric, bm_george, bm_lewis, etc.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
