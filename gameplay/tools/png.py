"""Minimal PNG reader/writer (no PIL): reads any non-interlaced or Adam7 PNG with bit depth <= 8 into RGBA,
writes 8-bit RGBA. Images are (width, height, bytearray of RGBA rows)."""
import struct
import zlib


class Image:
    def __init__(self, w, h, data=None):
        self.w, self.h = w, h
        self.data = data if data is not None else bytearray(w * h * 4)

    def get(self, x, y):
        i = (y * self.w + x) * 4
        return tuple(self.data[i:i + 4])

    def set(self, x, y, px):
        i = (y * self.w + x) * 4
        self.data[i:i + 4] = bytes(px)

    def crop(self, x, y, w, h):
        out = Image(w, h)
        for row in range(h):
            s = ((y + row) * self.w + x) * 4
            out.data[row * w * 4:(row + 1) * w * 4] = self.data[s:s + w * 4]
        return out

    def paste(self, img, x, y):
        for row in range(img.h):
            d = ((y + row) * self.w + x) * 4
            self.data[d:d + img.w * 4] = img.data[row * img.w * 4:(row + 1) * img.w * 4]

    def scaled(self, f):
        out = Image(self.w * f, self.h * f)
        for y in range(out.h):
            for x in range(out.w):
                out.set(x, y, self.get(x // f, y // f))
        return out


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def _unfilter(raw, w, h, bpp, stride):
    out = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        ft = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                c = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return out, pos


def read(path_or_bytes):
    b = path_or_bytes if isinstance(path_or_bytes, (bytes, bytearray)) else open(path_or_bytes, 'rb').read()
    assert b[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos = 8
    idat = bytearray()
    plte = None
    trns = None
    while pos < len(b):
        n, typ = struct.unpack_from('>I4s', b, pos)
        body = b[pos + 8:pos + 8 + n]
        pos += 12 + n
        if typ == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif typ == b'PLTE':
            plte = body
        elif typ == b'tRNS':
            trns = body
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
    raw = zlib.decompress(bytes(idat))
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bits = depth * channels
    img = Image(w, h)

    def decode_pass(raw, pos, pw, ph, place):
        if pw == 0 or ph == 0:
            return pos
        stride = (pw * bits + 7) // 8
        bpp = max(1, bits // 8)
        px, used = _unfilter(raw[pos:], pw, ph, bpp, stride)
        for y in range(ph):
            row = px[y * stride:(y + 1) * stride]
            for x in range(pw):
                if depth == 8:
                    v = row[x * channels:(x + 1) * channels]
                else:
                    per = 8 // depth
                    byte = row[x // per]
                    shift = 8 - depth * (x % per + 1)
                    v = [(byte >> shift) & ((1 << depth) - 1)]
                if ctype == 0:
                    g = v[0] * 255 // ((1 << depth) - 1)
                    a = 0 if trns and struct.unpack('>H', trns[:2])[0] == v[0] else 255
                    rgba = (g, g, g, a)
                elif ctype == 2:
                    a = 255
                    if trns and len(trns) >= 6 and struct.unpack('>HHH', trns[:6]) == tuple(v):
                        a = 0
                    rgba = (v[0], v[1], v[2], a)
                elif ctype == 3:
                    i = v[0]
                    a = trns[i] if trns and i < len(trns) else 255
                    rgba = (plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], a)
                elif ctype == 4:
                    rgba = (v[0], v[0], v[0], v[1])
                else:
                    rgba = tuple(v)
                place(x, y, rgba)
        return pos + used

    if interlace == 0:
        decode_pass(raw, 0, w, h, lambda x, y, c: img.set(x, y, c))
    else:
        passes = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
        pos = 0
        for x0, y0, dx, dy in passes:
            pw = (w - x0 + dx - 1) // dx if w > x0 else 0
            ph = (h - y0 + dy - 1) // dy if h > y0 else 0
            pos = decode_pass(raw, pos, pw, ph, lambda x, y, c, x0=x0, y0=y0, dx=dx, dy=dy: img.set(x0 + x * dx, y0 + y * dy, c))
    return img


def _chunk(typ, body):
    return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xffffffff)


def write(path, img):
    raw = bytearray()
    stride = img.w * 4
    for y in range(img.h):
        raw.append(0)
        raw += img.data[y * stride:(y + 1) * stride]
    out = b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', img.w, img.h, 8, 6, 0, 0, 0))
    out += _chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + _chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)
