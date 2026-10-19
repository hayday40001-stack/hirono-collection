"""Draws the app icon: an ivory specimen tag with a punched hole and string on charcoal.
Original artwork (no POP MART / HIRONO character art). Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
CHARCOAL = (42, 39, 37)
IVORY = (241, 237, 228)
BROWN = (116, 96, 79)
OLIVE = (92, 97, 64)


def draw(size: int, safe: float = 1.0) -> Image.Image:
    s = 4  # supersample
    W = size * s
    im = Image.new("RGB", (W, W), CHARCOAL)
    d = ImageDraw.Draw(im)
    k = W * safe
    off = (W - k) / 2
    # tag body: rectangle with clipped top corners, tilted feel via offset string
    tw, th = k * 0.50, k * 0.62
    x0, y0 = off + (k - tw) / 2, off + k * 0.24
    cut = tw * 0.22
    poly = [(x0 + cut, y0), (x0 + tw - cut, y0), (x0 + tw, y0 + cut), (x0 + tw, y0 + th), (x0, y0 + th), (x0, y0 + cut)]
    d.polygon(poly, fill=IVORY)
    # hole
    cx, cy, r = x0 + tw / 2, y0 + cut * 0.9, tw * 0.07
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CHARCOAL)
    # string
    d.line([(cx, cy - r * 0.2), (cx - tw * 0.18, off + k * 0.08)], fill=BROWN, width=max(2, int(W * 0.012)))
    # ruled lines on the tag
    for i in range(3):
        yy = y0 + th * (0.52 + i * 0.13)
        d.line([(x0 + tw * 0.18, yy), (x0 + tw * (0.82 if i < 2 else 0.6), yy)], fill=(200, 191, 176), width=max(2, int(W * 0.008)))
    # ownership stamp
    sr = tw * 0.17
    sx, sy = x0 + tw * 0.74, y0 + th * 0.86
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], outline=OLIVE, width=max(2, int(W * 0.012)))
    return im.resize((size, size), Image.LANCZOS)


draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, safe=0.8).save(OUT / "icon-maskable-512.png")
draw(180).save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
