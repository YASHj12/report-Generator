#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate a multi-resolution Windows .ico file for FEA Report Maker."""
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent


def draw_icon(size: int = 256) -> Image.Image:
    scale = size / 256.0
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # Rounded navy background (#1B304E)
    pad = max(1, round(8 * scale))
    radius = max(2, round(48 * scale))
    d.rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1],
        radius=radius,
        fill=(27, 48, 78, 255),
        outline=(42, 111, 166, 255),
        width=max(1, round(6 * scale)),
    )

    # Subtle stress-contour accent bar on the left
    bar_x0 = round(34 * scale)
    bar_x1 = round(48 * scale)
    colors = [
        (228, 45, 40, 255),    # red (Max)
        (245, 140, 30, 255),   # orange
        (245, 215, 45, 255),   # yellow
        (60, 190, 90, 255),    # green
        (55, 165, 230, 255),   # cyan/blue (Min)
    ]
    y_top, y_bot = round(52 * scale), round(184 * scale)
    seg_h = (y_bot - y_top) / len(colors)
    for idx, col in enumerate(colors):
        sy0 = round(y_top + idx * seg_h)
        sy1 = round(y_top + (idx + 1) * seg_h)
        d.rectangle([bar_x0, sy0, bar_x1, sy1], fill=col)

    # Mech Well / FEA Report Maker mountain peak polygon (#6FB1E6)
    pts = [
        (round(66 * scale), round(188 * scale)),
        (round(112 * scale), round(104 * scale)),
        (round(144 * scale), round(148 * scale)),
        (round(178 * scale), round(72 * scale)),
        (round(218 * scale), round(188 * scale)),
    ]
    d.polygon(pts, fill=(111, 177, 230, 255))

    # Red Max hotspot badge at the highest peak
    px, py = round(178 * scale), round(72 * scale)
    r = max(2, round(11 * scale))
    d.ellipse([px - r, py - r, px + r, py + r], fill=(230, 48, 42, 255))

    # Crisp white baseline at the bottom
    lw = max(2, round(14 * scale))
    d.line(
        [(round(40 * scale), round(196 * scale)), (round(220 * scale), round(196 * scale))],
        fill=(255, 255, 255, 255),
        width=lw,
    )
    return im


def main():
    base = draw_icon(256)
    ico_path = HERE / "icon.ico"
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    base.save(ico_path, format="ICO", sizes=sizes)
    print(f"Wrote {ico_path} ({ico_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
