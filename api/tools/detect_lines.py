#!/usr/bin/env python3
"""Detecte les lignes horizontales/verticales noires (grille de tableau) d'un
gabarit scanne, pour obtenir des coordonnees pixel exactes (pas d'estimation
visuelle). Usage: python3 detect_lines.py <image.jpg> [--y0 Y0 --y1 Y1]
"""
import sys
import numpy as np
from PIL import Image

def detect_rows(img_gray, x0, x1, y0, y1, thresh=120, min_frac=0.6):
    """Retourne les y ou une ligne horizontale sombre traverse au moins
    min_frac de la largeur [x0,x1]."""
    arr = np.array(img_gray)
    rows = []
    width = x1 - x0
    for y in range(y0, y1):
        line = arr[y, x0:x1]
        dark = np.sum(line < thresh)
        if dark / width > min_frac:
            rows.append(y)
    # Regrouper les y consecutifs (meme ligne physique) -> garder le centre
    groups = []
    cur = [rows[0]] if rows else []
    for y in rows[1:]:
        if y - cur[-1] <= 3:
            cur.append(y)
        else:
            groups.append(cur)
            cur = [y]
    if cur:
        groups.append(cur)
    return [int(np.mean(g)) for g in groups]

def detect_cols(img_gray, y0, y1, x0, x1, thresh=120, min_frac=0.6):
    arr = np.array(img_gray)
    cols = []
    height = y1 - y0
    for x in range(x0, x1):
        col = arr[y0:y1, x]
        dark = np.sum(col < thresh)
        if dark / height > min_frac:
            cols.append(x)
    groups = []
    cur = [cols[0]] if cols else []
    for x in cols[1:]:
        if x - cur[-1] <= 3:
            cur.append(x)
        else:
            groups.append(cur)
            cur = [x]
    if cur:
        groups.append(cur)
    return [int(np.mean(g)) for g in groups]

if __name__ == "__main__":
    path = sys.argv[1]
    im = Image.open(path).convert("L")
    w, h = im.size
    y0, y1 = 0, h
    x0, x1 = 0, w
    args = sys.argv[2:]
    for i, a in enumerate(args):
        if a == "--y0": y0 = int(args[i+1])
        if a == "--y1": y1 = int(args[i+1])
        if a == "--x0": x0 = int(args[i+1])
        if a == "--x1": x1 = int(args[i+1])
    rows = detect_rows(im, x0, x1, y0, y1)
    print("ROWS (y):", rows)
