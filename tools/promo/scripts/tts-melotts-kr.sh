#!/usr/bin/env bash
# tools/promo/scripts/tts-melotts-kr.sh — generate Korean narration via MeloTTS.
#
# Sister script of scripts/tts-kokoro.py (which handles English via Kokoro-82M).
# Reads public/audio/script.json's .ko.* entries and writes scene{N}-ko.mp3 next
# to the EN files.
#
# Setup (one-time, shared across all projects on this machine):
#   ~/Downloads/tts/scripts/setup-melotts-kr.sh
#
# Usage:
#   ./scripts/tts-melotts-kr.sh                  # default speed 1.0
#   SPEED=1.4 ./scripts/tts-melotts-kr.sh        # MeloTTS KR speaks slowly; bump speed
#
# Per-clip duration is reported so you can compare to the scene budget in
# src/PromoVideo.jsx (10 / 8 / 7 / 5 sec). If a clip exceeds its budget, raise
# SPEED or shorten the .ko.<scene> text in script.json.
#
# For single-text use from any other project, the shared CLI is simpler:
#   ~/Downloads/tts/melotts-kr "한국어 텍스트" out.mp3 [--speed 1.3]

set -euo pipefail

cd "$(dirname "$0")/.."

MELO="${HOME}/Downloads/tts/.venv-melotts-kr/bin/melo"
SCRIPT_JSON="public/audio/script.json"
OUT_DIR="public/audio"
SPEED="${SPEED:-1.0}"

if [ ! -x "$MELO" ]; then
  echo "MeloTTS not installed. Run: ~/Downloads/tts/scripts/setup-melotts-kr.sh" >&2
  exit 1
fi

echo "Generating Korean narration via MeloTTS (speed=$SPEED)…"

for scene in scene1 scene2 scene3 scene4; do
  text=$(jq -r ".ko.${scene}" "$SCRIPT_JSON")
  if [ -z "$text" ] || [ "$text" = "null" ]; then
    echo "missing text for ko.$scene" >&2; exit 1
  fi
  budget=$(jq -r ".scenes[] | select(.id==\"${scene}\") | .durationFrames / 30" "$SCRIPT_JSON")
  wav="/tmp/melo-${scene}-ko.wav"
  mp3="$OUT_DIR/${scene}-ko.mp3"

  "$MELO" -l KR -d cpu -s "$SPEED" "$text" "$wav" 2>&1 | tail -1
  ffmpeg -hide_banner -loglevel error -y -i "$wav" -codec:a libmp3lame -qscale:a 4 "$mp3"
  rm -f "$wav"

  dur=$(ffprobe -hide_banner -loglevel error -show_entries format=duration -of csv=p=0 "$mp3")
  marker="✓"
  if (( $(echo "$dur > $budget" | bc -l) )); then marker="!"; fi
  printf "  %s %s  %.1fs / budget %.0fs\n" "$marker" "$(basename $mp3)" "$dur" "$budget"
done

echo ""
echo "Done. If any clip is marked '!' the audio will be cut to scene budget."
echo "Raise SPEED (e.g. SPEED=1.1 ./scripts/tts-melotts-kr.sh) or shorten .ko.<scene>"
echo "text in public/audio/script.json."
