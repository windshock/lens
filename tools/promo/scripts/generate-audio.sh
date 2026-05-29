#!/usr/bin/env bash
# tools/promo/scripts/generate-audio.sh
#
# macOS `say` 로 narration script.json 의 각 (lang, scene) 텍스트를 mp3 로 굽고
# tools/promo/public/audio/<scene>-<lang>.mp3 에 떨어뜨린다. Remotion 의
# staticFile("audio/scene1-en.mp3") 가 이 경로를 가리킨다.
#
# 사용:
#   ./scripts/generate-audio.sh          # 양 언어 다
#   ./scripts/generate-audio.sh en       # EN 만
#   ./scripts/generate-audio.sh ko       # KO 만
#
# 환경:
#   SAY_RATE_EN : Samantha 의 wpm (기본 175)
#   SAY_RATE_KO : Yuna 의 wpm (기본 200)
#
# 외부 TTS (OpenAI / ElevenLabs) 로 교체할 때:
#   동일한 출력 경로 (public/audio/<scene>-<lang>.mp3) 만 맞추면 됨.
#   Remotion 측은 src/PromoVideo.jsx 의 staticFile 경로 기준으로 자동 sync.

set -euo pipefail

cd "$(dirname "$0")/.."

SCRIPT_JSON="public/audio/script.json"
OUT_DIR="public/audio"

VOICE_EN="${VOICE_EN:-Samantha}"
VOICE_KO="${VOICE_KO:-Yuna}"
SAY_RATE_EN="${SAY_RATE_EN:-175}"
SAY_RATE_KO="${SAY_RATE_KO:-200}"

LANGS=("$@")
if [ "${#LANGS[@]}" -eq 0 ]; then
  LANGS=(en ko)
fi

for lang in "${LANGS[@]}"; do
  case "$lang" in
    en) VOICE="$VOICE_EN"; RATE="$SAY_RATE_EN" ;;
    ko) VOICE="$VOICE_KO"; RATE="$SAY_RATE_KO" ;;
    *) echo "unknown lang: $lang"; exit 1 ;;
  esac

  for scene in scene1 scene2 scene3 scene4; do
    text=$(jq -r ".${lang}.${scene}" "$SCRIPT_JSON")
    if [ -z "$text" ] || [ "$text" = "null" ]; then
      echo "missing text for $lang.$scene"; exit 1
    fi
    aiff="/tmp/promo-${scene}-${lang}.aiff"
    mp3="$OUT_DIR/${scene}-${lang}.mp3"
    echo "→ $lang/$scene (voice=$VOICE rate=$RATE)"
    say -v "$VOICE" -r "$RATE" -o "$aiff" "$text"
    ffmpeg -hide_banner -loglevel error -y -i "$aiff" -codec:a libmp3lame -qscale:a 4 "$mp3"
    rm -f "$aiff"
    # Report actual audio length so user can compare to scene budget.
    dur=$(ffprobe -hide_banner -loglevel error -show_entries format=duration -of csv=p=0 "$mp3")
    printf "   %s  (%.1fs)\n" "$mp3" "$dur"
  done
done

echo ""
echo "Scene budgets (target durations, from script.json):"
jq -r '.scenes[] | "  \(.id)  \(.durationFrames / 30)s"' "$SCRIPT_JSON"
echo ""
echo "If any clip exceeds its scene budget, either shorten the text in script.json or raise"
echo "the rate (e.g. SAY_RATE_EN=190 ./scripts/generate-audio.sh en)."
