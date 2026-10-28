"""List / extract Bedrock .brarchive files (vanilla pack archives).

Layout: 8-byte magic, u32 entry count, u32 version, then per entry a 1-byte name length + 247-byte name field
+ u32 data offset + u32 size; file data follows the entry table (offsets relative to its start).

  python -I tools/brarchive.py list <archive>
  python -I tools/brarchive.py extract <archive> <out-dir>
  python -I tools/brarchive.py extract-pack <pack-dir> <out-dir>     every archive under <pack-dir>/__brarchive
"""
import os
import struct
import sys


def read(path):
    b = open(path, 'rb').read()
    count, _version = struct.unpack_from('<II', b, 8)
    entries = []
    pos = 16
    for _ in range(count):
        n = b[pos]
        name = b[pos + 1:pos + 1 + n].decode('utf-8')
        off, size = struct.unpack_from('<II', b, pos + 248)
        entries.append((name, off, size))
        pos += 256
    data = pos
    return [(name, b[data + off:data + off + size]) for name, off, size in entries]


def main(argv):
    if argv[0] == 'list':
        for name, blob in read(argv[1]):
            print(f'{len(blob):9d} {name}')
    elif argv[0] == 'extract':
        for name, blob in read(argv[1]):
            dst = os.path.join(argv[2], *name.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(blob)
    elif argv[0] == 'extract-pack':
        base = os.path.join(argv[1], '__brarchive')
        n = 0
        for dirpath, _, files in os.walk(base):
            for fn in files:
                if not fn.endswith('.brarchive'):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, fn[:-len('.brarchive')]), base)
                for name, blob in read(os.path.join(dirpath, fn)):
                    dst = os.path.join(argv[2], rel, *name.split('/'))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    open(dst, 'wb').write(blob)
                    n += 1
        print('extracted', n, 'files')


if __name__ == '__main__':
    main(sys.argv[1:])
