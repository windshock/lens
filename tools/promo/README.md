# Windshock Lens — Promo Video

Remotion-based 30-second promo for the Chrome Web Store / YouTube listing.

## Setup (one-time)

```bash
cd tools/promo
npm install
```

Downloads Remotion + React (~200 MB into `tools/promo/node_modules/`, gitignored).

## Render

```bash
# English (default)
npm run render:en          # → dist/promo-en.mp4

# Korean
npm run render:ko          # → dist/promo-ko.mp4

# Both
npm run render
```

Output: `dist/promo-{en,ko}.mp4`, 1280×720, 30 fps, ~30 sec, H.264.
Upload to YouTube directly, link the YouTube URL in Chrome Web Store listing.

## Live preview (iterate on scenes)

```bash
npm run studio
```

Opens Remotion Studio at `http://localhost:3000` with timeline scrubbing. Pick
`PromoEN` or `PromoKO` from the sidebar to preview.

## Storyboard (30 sec)

| Frame range | Scene | Beat |
|---|---|---|
| 0 – 300 | Problem | Reputation lists block known-bad URLs. But zero-hour phishing is on no list yet. |
| 300 – 540 | Solution | Windshock Lens reads the page itself: DOM · OCR · WHOIS · on-device LLM · deterministic rules. |
| 540 – 750 | Verdict | Fake Microsoft login on workers.dev. Scan runs, danger 9/10, warning intercept slides up. |
| 750 – 900 | Outro | "100% on-device · No external LLM · Free + open source" + Pages URL. |

Each scene's source is in `src/scenes/`. Strings are centralized in `src/i18n.js`
with `en` and `ko` dictionaries — both share the same timing.

## File layout

```
tools/promo/
├── package.json          # Remotion + React deps
├── remotion.config.mjs   # render config
├── README.md
└── src/
    ├── index.jsx         # registerRoot entry
    ├── Root.jsx          # PromoEN / PromoKO Composition registration
    ├── PromoVideo.jsx    # 4 Sequence boundaries (Problem / Solution / Verdict / Outro)
    ├── i18n.js           # EN + KO string tables
    └── scenes/
        ├── Problem.jsx
        ├── Solution.jsx
        ├── Verdict.jsx
        └── Outro.jsx
```

## Editing the script

1. Open `src/i18n.js` and edit both `en` and `ko` strings.
2. Run `npm run studio` to preview live.
3. Adjust timing per scene in `src/PromoVideo.jsx` (Sequence `durationInFrames`).
4. Render with `npm run render`.

## Notes

- `node_modules/` and `dist/promo-*.mp4` are in the root `.gitignore`.
- EN narration uses **Kokoro-82M** (open-source local TTS, near-human quality).
  Setup (one-time):

  ```bash
  brew install espeak-ng
  python3.12 -m venv .venv-kokoro
  .venv-kokoro/bin/pip install kokoro soundfile
  ```

  Generate / regenerate:

  ```bash
  .venv-kokoro/bin/python scripts/tts-kokoro.py --speed 1.1
  ```

  The script reports each clip's duration vs scene budget. If a clip exceeds
  budget, raise `--speed` (1.1–1.2) or shorten the text in
  `public/audio/script.json`. Default voice is `af_heart`; alternates include
  `af_bella`, `af_nicole`, `am_michael`, `bm_george`. Kokoro v1.0 ships English
  voices only (Korean is not yet supported upstream).

- KO narration falls back to macOS `say` (Yuna voice) via the older
  `scripts/generate-audio.sh ko` path. Quality is noticeably synthetic compared
  to Kokoro EN. To upgrade KO, swap to an external TTS — OpenAI TTS API
  (`nova` or `shimmer`), ElevenLabs, or a recorded VO. As long as the output
  files keep the names `public/audio/scene{N}-ko.mp3`, the Remotion composition
  picks them up automatically — no code change needed.

- `.venv-kokoro/` is gitignored (large model weights + torch). `npm install` and
  the Python setup above must run once on each machine.
- Korean glyph rendering depends on the system having a Korean font (macOS does
  by default — `Apple SD Gothic Neo`). For server-side rendering on a different
  host, embed a Korean web font in `src/index.jsx` via Remotion's font loading
  pattern.
