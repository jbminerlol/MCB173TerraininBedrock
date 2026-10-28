"""TGA reader (true-colour, raw or RLE) and writer (raw 32-bit, top-left origin) using png.Image."""
import struct

from png import Image


def read(path):
    b = open(path, 'rb').read()
    idlen, cmtype, itype = b[0], b[1], b[2]
    w, h, bpp, desc = struct.unpack_from('<HHBB', b, 12)
    pos = 18 + idlen + (struct.unpack_from('<H', b, 5)[0] * ((b[7] + 7) // 8) if cmtype else 0)
    n = w * h
    px = bytearray()
    step = bpp // 8
    if itype == 2:
        px = b[pos:pos + n * step]
    elif itype == 10:
        while len(px) < n * step:
            c = b[pos]
            pos += 1
            if c & 0x80:
                v = b[pos:pos + step]
                pos += step
                px += v * ((c & 0x7f) + 1)
            else:
                k = ((c & 0x7f) + 1) * step
                px += b[pos:pos + k]
                pos += k
    else:
        raise ValueError(f'unsupported TGA type {itype}')
    img = Image(w, h)
    top = (desc & 0x20) != 0
    for i in range(n):
        x, y = i % w, i // w
        if not top:
            y = h - 1 - y
        p = px[i * step:(i + 1) * step]
        a = p[3] if step == 4 else 255
        img.set(x, y, (p[2], p[1], p[0], a))
    return img


def write(path, img):
    out = bytearray(struct.pack('<BBBHHBHHHHBB', 0, 0, 2, 0, 0, 0, 0, 0, img.w, img.h, 32, 0x28))
    for y in range(img.h):
        for x in range(img.w):
            r, g, b, a = img.get(x, y)
            out += bytes((b, g, r, a))
    with open(path, 'wb') as f:
        f.write(out)
