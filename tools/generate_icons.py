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

def draw_glyph(draw, kind, cx, cy, size):
    """Draw a glyph geometrically — system fonts often lack ✓ ✕ in regular weights.

    kind: "check" | "bang" | "cross"
    cx, cy: center of bounding circle
    size: full glyph extent (~0.55 of shield size looks balanced)
    """
    half = size // 2
    stroke = max(2, int(size * 0.18))
    white = "#ffffff"
    if kind == "check":
        # ✓ — two-segment polyline: bottom-left, bottom-vertex, top-right
        # Tweaked proportions: short left segment, long right segment
        p1 = (cx - int(half * 0.65), cy + int(half * 0.05))
        p2 = (cx - int(half * 0.10), cy + int(half * 0.55))
        p3 = (cx + int(half * 0.70), cy - int(half * 0.55))
        draw.line([p1, p2, p3], fill=white, width=stroke, joint="curve")
    elif kind == "bang":
        # ! — vertical bar + dot
        bar_w = max(3, int(size * 0.18))
        bar_top = cy - int(half * 0.55)
        bar_bot = cy + int(half * 0.15)
        draw.rounded_rectangle(
            [(cx - bar_w // 2, bar_top), (cx + bar_w // 2, bar_bot)],
            radius=bar_w // 2,
            fill=white,
        )
        dot_r = bar_w
        dot_cy = cy + int(half * 0.50)
        draw.ellipse(
            [(cx - dot_r, dot_cy - dot_r), (cx + dot_r, dot_cy + dot_r)],
            fill=white,
        )
    elif kind == "cross":
        # ✕ — two diagonal lines
        off = int(half * 0.55)
        draw.line(
            [(cx - off, cy - off), (cx + off, cy + off)],
            fill=white, width=stroke,
        )
        draw.line(
            [(cx - off, cy + off), (cx + off, cy - off)],
            fill=white, width=stroke,
        )

def draw_shield(size, bg_color, glyph_kind):
    """Draw a rounded-rect shield with a centered geometric glyph.

    Mirrors offscreen.js#drawShield aesthetics but draws the glyph as
    polygons/lines instead of Unicode text. Reliable on any system.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(2, int(size * 0.18))
    draw.rounded_rectangle(
        [(1, 1), (size - 2, size - 2)],
        radius=radius,
        fill=bg_color,
    )
    draw_glyph(draw, glyph_kind, size // 2, size // 2, int(size * 0.55))
    return img

def main():
    print(f"Writing icons to {ICONS_DIR}")
    # Toolbar action icons (✓ check)
    for size in (16, 32, 48, 128):
        img = draw_shield(size, ACTION_COLOR, "check")
        out = ICONS_DIR / f"action-{size}.png"
        img.save(out, "PNG")
        print(f"  {out.name}")
    # Notification icons
    for name, color, kind in (
        ("ok",     OK_COLOR,     "check"),
        ("warn",   WARN_COLOR,   "bang"),
        ("danger", DANGER_COLOR, "cross"),
    ):
        img = draw_shield(128, color, kind)
        out = ICONS_DIR / f"notif-{name}-128.png"
        img.save(out, "PNG")
        print(f"  {out.name}")
    print("Done.")

if __name__ == "__main__":
    main()
