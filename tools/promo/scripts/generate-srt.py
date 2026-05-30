#!/usr/bin/env python3
"""
generate-srt.py — write SRT caption files for promo-en.mp4 and promo-ko.mp4.

Reads public/audio/script.json (same source as the TTS pipeline so spoken text
and captions stay in lock-step) and writes:
    dist/promo-en.srt
    dist/promo-ko.srt

Timing follows the scene boundaries in script.json's `scenes` array (which
match src/PromoVideo.jsx's Sequence boundaries). Each scene becomes one SRT cue.

Run with system Python — no extra deps:
    python3 scripts/generate-srt.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_JSON = ROOT / "public" / "audio" / "script.json"
DIST_DIR = ROOT.parent.parent / "dist"


def srt_timestamp(seconds: float) -> str:
    """Format `seconds` as HH:MM:SS,mmm (SRT-style)."""
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600 * 1000)
    m, ms = divmod(ms, 60 * 1000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(scenes: list[dict], lang_table: dict[str, str], fps: int = 30) -> str:
    """Return SRT body for one language.

    `scenes` is the list from script.json (each item: {id, fromFrame, durationFrames}).
    `lang_table` maps scene_id (e.g. "scene1") to its caption text.
    """
    lines = []
    for i, scene in enumerate(scenes, start=1):
        scene_id = scene["id"]
        text = lang_table.get(scene_id, "").strip()
        if not text:
            continue
        start_frame = int(scene["fromFrame"])
        end_frame = start_frame + int(scene["durationFrames"])
        start_sec = start_frame / fps
        end_sec = end_frame / fps
        lines.append(str(i))
        lines.append(f"{srt_timestamp(start_sec)} --> {srt_timestamp(end_sec)}")
        lines.append(text)
        lines.append("")  # blank separator between cues
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    with SCRIPT_JSON.open() as f:
        data = json.load(f)

    scenes = data["scenes"]
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    for lang in ("en", "ko"):
        if lang not in data:
            continue
        srt = build_srt(scenes, data[lang])
        out = DIST_DIR / f"promo-{lang}.srt"
        out.write_text(srt, encoding="utf-8")
        print(f"  ✓ {out.relative_to(ROOT.parent.parent)}  ({len(srt)} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
