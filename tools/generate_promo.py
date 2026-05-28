#!/usr/bin/env python3
"""tools/generate_promo.py — Generate Chrome Web Store small promotional tile.

Run when listing copy or visual identity changes:
    python3 tools/generate_promo.py

Output:
    icons/promo-440x280.png  — Chrome Web Store small promotional tile
                                (shown on category/search result cards)

Marquee tile (1400×560) is optional and only used if Google features the
extension. Generate later if needed by passing --marquee.
"""

from PIL import Image, ImageDraw, ImageFont
import argparse
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"

# Visual identity — Windshock Lens
BRAND_COLOR_BG     = "#0b0f1a"   # near-black navy
BRAND_COLOR_ACCENT = "#1f6feb"   # Windshock blue (matches action icon)
BRAND_COLOR_TEXT   = "#f5f7fb"   # near-white
BRAND_COLOR_SUB    = "#94a3b8"   # muted slate

def find_font(font_size, bold=True):
    candidates = (
        [
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/SFNS.ttf",
            "/Library/Fonts/Arial Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        if bold
        else [
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    )
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except OSError:
                continue
    return ImageFont.load_default()

def draw_shield_at(draw, cx, cy, size, color):
    """Draw a rounded-rect shield centered at (cx, cy) with a geometric ✓ glyph.

    Glyph drawn as polyline (not Unicode text) to avoid font fallback issues
    on systems whose default fonts lack the U+2713 codepoint.
    """
    half = size // 2
    radius = max(2, int(size * 0.18))
    draw.rounded_rectangle(
        [(cx - half, cy - half), (cx + half, cy + half)],
        radius=radius,
        fill=color,
    )
    # Geometric ✓ — proportions match tools/generate_icons.py
    glyph_extent = int(size * 0.55)
    g_half = glyph_extent // 2
    stroke = max(2, int(glyph_extent * 0.18))
    p1 = (cx - int(g_half * 0.65), cy + int(g_half * 0.05))
    p2 = (cx - int(g_half * 0.10), cy + int(g_half * 0.55))
    p3 = (cx + int(g_half * 0.70), cy - int(g_half * 0.55))
    draw.line([p1, p2, p3], fill="#ffffff", width=stroke, joint="curve")

def make_small_promo():
    """440×280 small promotional tile."""
    W, H = 440, 280
    img = Image.new("RGB", (W, H), BRAND_COLOR_BG)
    draw = ImageDraw.Draw(img)

    # Subtle accent stripe at left
    draw.rectangle([(0, 0), (4, H)], fill=BRAND_COLOR_ACCENT)

    # Shield icon on the left
    shield_size = 96
    shield_cx, shield_cy = 80, H // 2
    draw_shield_at(draw, shield_cx, shield_cy, shield_size, BRAND_COLOR_ACCENT)

    # Brand name
    text_left = 160
    brand_font = find_font(36, bold=True)
    draw.text((text_left, 80), "Windshock", fill=BRAND_COLOR_TEXT, font=brand_font)
    lens_font = find_font(36, bold=False)
    draw.text((text_left, 80), "Windshock", fill=BRAND_COLOR_TEXT, font=brand_font)  # solid
    # Second word "Lens" in accent color
    bbox = draw.textbbox((0, 0), "Windshock ", font=brand_font)
    brand_w = bbox[2] - bbox[0]
    draw.text((text_left + brand_w, 80), "Lens", fill=BRAND_COLOR_ACCENT, font=brand_font)

    # Tagline
    tagline_font = find_font(15, bold=False)
    tagline_lines = [
        "Private, on-device scam and phishing",
        "analysis for Chrome.",
    ]
    y = 140
    for line in tagline_lines:
        draw.text((text_left, y), line, fill=BRAND_COLOR_SUB, font=tagline_font)
        y += 22

    # Bottom hint
    hint_font = find_font(12, bold=False)
    draw.text(
        (text_left, H - 40),
        "Gemini Nano · deterministic rules · zero external LLM",
        fill=BRAND_COLOR_ACCENT,
        font=hint_font,
    )

    out = ICONS_DIR / "promo-440x280.png"
    img.save(out, "PNG")
    print(f"  {out.name}")

def make_marquee():
    """1400×560 marquee promotional tile (optional)."""
    W, H = 1400, 560
    img = Image.new("RGB", (W, H), BRAND_COLOR_BG)
    draw = ImageDraw.Draw(img)

    # Accent stripe
    draw.rectangle([(0, 0), (12, H)], fill=BRAND_COLOR_ACCENT)

    # Large shield on left
    shield_size = 240
    draw_shield_at(draw, 220, H // 2, shield_size, BRAND_COLOR_ACCENT)

    text_left = 400
    brand_font = find_font(96, bold=True)
    draw.text((text_left, 150), "Windshock", fill=BRAND_COLOR_TEXT, font=brand_font)
    bbox = draw.textbbox((0, 0), "Windshock ", font=brand_font)
    brand_w = bbox[2] - bbox[0]
    draw.text((text_left + brand_w, 150), "Lens", fill=BRAND_COLOR_ACCENT, font=brand_font)

    tagline_font = find_font(34, bold=False)
    tagline_lines = [
        "Private, on-device scam and phishing analysis for Chrome.",
        "Catches gray-zone phishing before you click.",
    ]
    y = 290
    for line in tagline_lines:
        draw.text((text_left, y), line, fill=BRAND_COLOR_SUB, font=tagline_font)
        y += 48

    hint_font = find_font(22, bold=False)
    draw.text(
        (text_left, H - 80),
        "Gemini Nano · deterministic rules · zero external LLM",
        fill=BRAND_COLOR_ACCENT,
        font=hint_font,
    )

    out = ICONS_DIR / "promo-1400x560.png"
    img.save(out, "PNG")
    print(f"  {out.name}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--marquee", action="store_true", help="Also generate 1400×560 marquee tile")
    args = ap.parse_args()
    ICONS_DIR.mkdir(exist_ok=True)
    print(f"Writing promo assets to {ICONS_DIR}")
    make_small_promo()
    if args.marquee:
        make_marquee()
    print("Done.")

if __name__ == "__main__":
    main()
