#!/usr/bin/env python3
"""tools/generate_icons.py — Generate static action & notification icons.

Replaces the runtime OffscreenCanvas generation in offscreen.js (which Chrome
Web Store reviewers cannot evaluate at scan time, and which has a known
ImageData serialization bug — see SPR-010).

Run once when icon design changes:
    python3 tools/generate_icons.py

Outputs:
    icons/action-{16,32,48,128}.png  — toolbar action icon (Windshock blue shield with check)
    icons/notif-{ok,warn,danger}-128.png  — notification icons (color-coded)
    icons/store-{128,440x280,1280x800}.png  — store listing assets (separately)

The runtime fallback in offscreen.js can stay as defensive backup, but
manifest.json#action.default_icon should reference the static PNGs.
"""

from PIL import Image, ImageDraw, ImageFont
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"
ICONS_DIR.mkdir(exist_ok=True)

# Color palette — matches offscreen.js drawShield colors
ACTION_COLOR = "#1f6feb"   # Windshock blue
OK_COLOR     = "#1f883d"   # green
WARN_COLOR   = "#d97706"   # amber
DANGER_COLOR = "#b91c1c"   # red

def find_font(font_size):
    """Try common system fonts. Fall back to PIL default if none found."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",          # macOS
        "/System/Library/Fonts/HelveticaNeue.ttc",      # macOS
        "/System/Library/Fonts/SFNS.ttf",               # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
        "/Library/Fonts/Arial Bold.ttf",                # macOS legacy
        "C:\\Windows\\Fonts\\arialbd.ttf",              # Windows
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except OSError:
                continue
    return ImageFont.load_default()

def draw_shield(size, bg_color, glyph):
    """Draw a rounded-rect shield with a centered glyph.

    Mirrors offscreen.js#drawShield design:
      - Background: rounded rect, padding 1px, corner radius ~size*0.18
      - Glyph: bold white, ~size*0.62 for single char (or 0.42 for multi)
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(2, int(size * 0.18))
    # Rounded rectangle background
    draw.rounded_rectangle(
        [(1, 1), (size - 2, size - 2)],
        radius=radius,
        fill=bg_color,
    )
    # Glyph
    font_size = round(size * (0.42 if len(glyph) > 1 else 0.62))
    font = find_font(font_size)
    bbox = draw.textbbox((0, 0), glyph, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) // 2 - bbox[0]
    # Slight downward nudge matches the +size*0.04 offset in offscreen.js
    y = (size - h) // 2 - bbox[1] + int(size * 0.02)
    draw.text((x, y), glyph, fill="#ffffff", font=font)
    return img

def main():
    print(f"Writing icons to {ICONS_DIR}")
    # Toolbar action icons
    for size in (16, 32, 48, 128):
        img = draw_shield(size, ACTION_COLOR, "✓")  # ✓
        out = ICONS_DIR / f"action-{size}.png"
        img.save(out, "PNG")
        print(f"  {out.name}")
    # Notification icons
    for name, color, glyph in (
        ("ok",     OK_COLOR,     "✓"),
        ("warn",   WARN_COLOR,   "!"),
        ("danger", DANGER_COLOR, "✕"),  # ✕
    ):
        img = draw_shield(128, color, glyph)
        out = ICONS_DIR / f"notif-{name}-128.png"
        img.save(out, "PNG")
        print(f"  {out.name}")
    print("Done.")

if __name__ == "__main__":
    main()
