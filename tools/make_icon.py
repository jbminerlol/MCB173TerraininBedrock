"""Draws the pack icon (an isometric grass block, original pixel art) to packs/BP/pack_icon.png."""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 128
CX, TOP, HALF_W, HALF_H, SIDE = 64, 10, 54, 27, 62  # cube: top rhombus centre x, its top y, half sizes, side height
TEXELS = 8


def noise(face, u, v):
    """Deterministic per-texel value in 0..1 (so the faces look pixelated, not smooth)."""
    h = (face * 73856093) ^ (u * 19349663) ^ (v * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 255) / 255


def shade(rgb, k):
    return tuple(max(0, min(255, round(c * k))) for c in rgb)


GRASS = [(96, 160, 56), (110, 176, 64), (84, 146, 48), (120, 186, 72)]
DIRT = [(134, 96, 67), (121, 85, 58), (150, 108, 76), (110, 78, 54)]


def texel_colour(face, u, v):
    """face 0 top, 1 left, 2 right; u, v in 0..TEXELS-1 (v down the side faces)."""
    n = noise(face, u, v)
    if face == 0:
        return GRASS[int(n * 3.99)]
    # a grass fringe hanging over the dirt: two rows, ragged on the second
    if v == 0 or (v == 1 and n > 0.45):
        c = GRASS[int(n * 3.99)]
    else:
        c = DIRT[int(n * 3.99)]
    return shade(c, 0.78 if face == 1 else 0.6)


def pixel(x, y):
    px, py = x + 0.5, y + 0.5
    cy = TOP + HALF_H
    # top face: rhombus; (a, b) are its two edge coordinates in 0..1
    a = ((px - CX) / HALF_W + (py - cy) / HALF_H + 1) / 2
    b = (-(px - CX) / HALF_W + (py - cy) / HALF_H + 1) / 2
    if 0 <= a < 1 and 0 <= b < 1:
        return texel_colour(0, int(a * TEXELS), int(b * TEXELS))
    # side faces: parallelograms below the rhombus' lower edges
    if CX - HALF_W <= px < CX:
        u = (px - (CX - HALF_W)) / HALF_W
        y0 = cy + u * HALF_H
        v = (py - y0) / SIDE
        if 0 <= v < 1:
            return texel_colour(1, int(u * TEXELS), int(v * TEXELS))
    if CX <= px < CX + HALF_W:
        u = (px - CX) / HALF_W
        y0 = TOP + 2 * HALF_H - u * HALF_H
        v = (py - y0) / SIDE
        if 0 <= v < 1:
            return texel_colour(2, int(u * TEXELS), int(v * TEXELS))
    return None


def write_png(path, rows):
    raw = b''.join(b'\0' + bytes(c for p in row for c in p) for row in rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    rows = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            c = pixel(x, y)
            row.append((*c, 255) if c else (0, 0, 0, 0))
        rows.append(row)
    out = os.path.join(ROOT, 'packs', 'BP', 'pack_icon.png')
    write_png(out, rows)
    print('wrote', out)


if __name__ == '__main__':
    main()
