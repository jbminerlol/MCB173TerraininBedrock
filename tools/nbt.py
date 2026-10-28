"""Little-endian NBT (Bedrock) reader/writer.

Values are plain Python objects tagged with small wrapper classes where the type would be ambiguous:
Byte, Short, Int, Long, Float, Double, and List(tag_type, items). dict = compound, str = string.
"""
import struct

END, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, BYTE_ARRAY, STRING, LIST, COMPOUND, INT_ARRAY, LONG_ARRAY = range(13)


class _Num:
    __slots__ = ('v',)

    def __init__(self, v):
        self.v = v

    def __repr__(self):
        return f'{type(self).__name__}({self.v!r})'

    def __eq__(self, o):
        return type(o) is type(self) and o.v == self.v


class Byte(_Num): pass
class Short(_Num): pass
class Int(_Num): pass
class Long(_Num): pass
class Float(_Num): pass
class Double(_Num): pass


class List:
    def __init__(self, tag, items):
        self.tag = tag
        self.items = list(items)

    def __repr__(self):
        return f'List({self.tag}, {self.items!r})'


def _tag_of(v):
    if isinstance(v, Byte): return BYTE
    if isinstance(v, Short): return SHORT
    if isinstance(v, Int): return INT
    if isinstance(v, Long): return LONG
    if isinstance(v, Float): return FLOAT
    if isinstance(v, Double): return DOUBLE
    if isinstance(v, (bytes, bytearray)): return BYTE_ARRAY
    if isinstance(v, str): return STRING
    if isinstance(v, List): return LIST
    if isinstance(v, dict): return COMPOUND
    if isinstance(v, bool): return BYTE
    if isinstance(v, int): return INT
    raise TypeError(type(v))


def _w_str(out, s):
    b = s.encode('utf-8')
    out += struct.pack('<H', len(b)) + b


def _w_payload(out, tag, v):
    if tag == BYTE: out += struct.pack('<b', int(v.v if isinstance(v, _Num) else v))
    elif tag == SHORT: out += struct.pack('<h', v.v)
    elif tag == INT: out += struct.pack('<i', v.v if isinstance(v, _Num) else v)
    elif tag == LONG: out += struct.pack('<q', v.v)
    elif tag == FLOAT: out += struct.pack('<f', v.v)
    elif tag == DOUBLE: out += struct.pack('<d', v.v)
    elif tag == BYTE_ARRAY: out += struct.pack('<i', len(v)) + bytes(v)
    elif tag == STRING: _w_str(out, v)
    elif tag == LIST:
        out += struct.pack('<bi', v.tag, len(v.items))
        for it in v.items:
            _w_payload(out, v.tag, it)
    elif tag == COMPOUND:
        for k, it in v.items():
            t = _tag_of(it)
            out += struct.pack('<b', t)
            _w_str(out, k)
            _w_payload(out, t, it)
        out += b'\x00'
    else:
        raise ValueError(tag)


def dumps(root, name=''):
    out = bytearray()
    out += struct.pack('<b', COMPOUND)
    _w_str(out, name)
    _w_payload(out, COMPOUND, root)
    return bytes(out)


class _R:
    def __init__(self, b, i=0):
        self.b, self.i = b, i

    def take(self, fmt):
        v = struct.unpack_from(fmt, self.b, self.i)
        self.i += struct.calcsize(fmt)
        return v[0]

    def str(self):
        n = self.take('<H')
        s = self.b[self.i:self.i + n].decode('utf-8', 'replace')
        self.i += n
        return s


def _r_payload(r, tag):
    if tag == BYTE: return Byte(r.take('<b'))
    if tag == SHORT: return Short(r.take('<h'))
    if tag == INT: return Int(r.take('<i'))
    if tag == LONG: return Long(r.take('<q'))
    if tag == FLOAT: return Float(r.take('<f'))
    if tag == DOUBLE: return Double(r.take('<d'))
    if tag == BYTE_ARRAY:
        n = r.take('<i')
        v = r.b[r.i:r.i + n]
        r.i += n
        return bytes(v)
    if tag == STRING: return r.str()
    if tag == LIST:
        t = r.take('<b')
        n = r.take('<i')
        return List(t, [_r_payload(r, t) for _ in range(n)])
    if tag == COMPOUND:
        d = {}
        while True:
            t = r.take('<b')
            if t == END:
                return d
            k = r.str()
            d[k] = _r_payload(r, t)
    if tag == INT_ARRAY:
        n = r.take('<i')
        return List(INT, [Int(r.take('<i')) for _ in range(n)])
    if tag == LONG_ARRAY:
        n = r.take('<i')
        return List(LONG, [Long(r.take('<q')) for _ in range(n)])
    raise ValueError(tag)


def loads(b):
    r = _R(b)
    t = r.take('<b')
    assert t == COMPOUND
    name = r.str()
    return _r_payload(r, COMPOUND), name, r.i


def read_level_dat(path):
    b = open(path, 'rb').read()
    version, length = struct.unpack_from('<ii', b, 0)
    root, _, _ = loads(b[8:8 + length])
    return version, root


def write_level_dat(path, version, root):
    body = dumps(root)
    with open(path, 'wb') as f:
        f.write(struct.pack('<ii', version, len(body)) + body)
