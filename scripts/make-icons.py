"""Regenerates extension/icons/*.png: a vermilion bookmark ribbon on an ink
tile with a paper rule, matching the in-page design. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

INK = (28, 27, 25, 255)
PAPER = (242, 237, 227, 255)
RED = (210, 59, 31, 255)


def icon(size: int) -> Image.Image:
    s = size * 8  # draw large, then downsample for clean edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.2), fill=INK)
    # paper "card" lines
    for y in (0.58, 0.72):
        d.rectangle([s * 0.18, s * y, s * 0.82, s * y + s * 0.045], fill=PAPER)
    # ribbon hanging from the top edge, notched at the bottom
    l, r, top, bottom = s * 0.30, s * 0.62, 0, s * 0.80
    d.polygon([(l, top), (r, top), (r, bottom), ((l + r) / 2, bottom - s * 0.16), (l, bottom)], fill=RED)
    return img.resize((size, size), Image.LANCZOS)


for n in (16, 32, 48, 128):
    icon(n).save(OUT / f"icon{n}.png")
print("Icons written to", OUT)
