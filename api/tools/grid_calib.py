#!/usr/bin/env python3
"""Outil de calibration: dessine une grille pixel (native res) sur un gabarit
pour lire precisement les coordonnees des champs. Usage:
python3 grid_calib.py <image.jpg> <output_prefix> [--crop y0 y1]
Genere des crops en pleine resolution avec grille tous les 20px (labels tous les 100px).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

def draw_grid(img, step=20, label_step=100):
    draw = ImageDraw.Draw(img)
    w, h = img.size
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for x in range(0, w, step):
        color = (255, 0, 0) if x % label_step == 0 else (255, 180, 180)
        draw.line([(x, 0), (x, h)], fill=color, width=1)
        if x % label_step == 0:
            draw.text((x + 2, 2), str(x), fill=(255, 0, 0), font=font)
    for y in range(0, h, step):
        color = (0, 120, 255) if y % label_step == 0 else (180, 210, 255)
        draw.line([(0, y), (w, y)], fill=color, width=1)
        if y % label_step == 0:
            draw.text((2, y + 2), str(y), fill=(0, 120, 255), font=font)
    return img

if __name__ == "__main__":
    path = sys.argv[1]
    out_prefix = sys.argv[2]
    im = Image.open(path).convert("RGB")
    gridded = draw_grid(im.copy())
    w, h = im.size
    # Decouper en 3 bandes horizontales pleine largeur pour lisibilite
    n = 3
    band_h = h // n
    for i in range(n):
        y0 = i * band_h
        y1 = h if i == n - 1 else (i + 1) * band_h
        crop = gridded.crop((0, y0, w, y1))
        crop.save(f"{out_prefix}_band{i}.png")
    print(f"OK {w}x{h}, bands saved with prefix {out_prefix}")
