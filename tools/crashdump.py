"""Reads a Minecraft Bedrock crash dump (%LOCALAPPDATA%\\CrashDumps\\Minecraft.Windows.exe.*.dmp) without a debugger:
the exception, the crashing thread's name, the game functions on its stack (named by the strings each function
references, since there are no symbols) and the text found on the stacks of the busy threads.

  python -I tools/crashdump.py [dump] [--exe Minecraft.Windows.exe]     newest dump by default
"""
import bisect
import glob
import os
import re
import struct
import sys

EXE = r'C:/XboxGames/Minecraft for Windows/Content/Minecraft.Windows.exe'


class Dump:
    def __init__(self, path):
        self.data = d = open(path, 'rb').read()
        _, _, n, rva = struct.unpack_from('<IIII', d, 0)
        self.streams = {}
        for i in range(n):
            t, size, srva = struct.unpack_from('<III', d, rva + i * 12)
            self.streams.setdefault(t, (size, srva))
        self.ranges = []
        if 5 in self.streams:  # MemoryListStream
            srva = self.streams[5][1]
            for i in range(struct.unpack_from('<I', d, srva)[0]):
                start, size, mrva = struct.unpack_from('<QII', d, srva + 4 + i * 16)
                self.ranges.append((start, size, mrva))
        self.mods = []  # ModuleListStream
        srva = self.streams[4][1]
        for i in range(struct.unpack_from('<I', d, srva)[0]):
            m = srva + 4 + i * 108
            base, size = struct.unpack_from('<QI', d, m)
            self.mods.append((base, size, self.ustr(struct.unpack_from('<I', d, m + 20)[0]).split('\\')[-1]))
        self.names = {}  # ThreadNamesStream
        if 24 in self.streams:
            srva = self.streams[24][1]
            for i in range(struct.unpack_from('<I', d, srva)[0]):
                tid, nrva = struct.unpack_from('<IQ', d, srva + 4 + i * 12)
                self.names[tid] = self.ustr(nrva)
        self.threads = {}  # ThreadListStream: tid -> (stack start, stack bytes)
        srva = self.streams[3][1]
        for i in range(struct.unpack_from('<I', d, srva)[0]):
            t = srva + 4 + i * 48
            tid = struct.unpack_from('<I', d, t)[0]
            start, size, mrva = struct.unpack_from('<QII', d, t + 24)
            self.threads[tid] = (start, d[mrva:mrva + size])

    def ustr(self, rva):
        n = struct.unpack_from('<I', self.data, rva)[0]
        return self.data[rva + 4:rva + 4 + n].decode('utf-16le')

    def read(self, addr, n):
        for start, size, off in self.ranges:
            if start <= addr and addr + n <= start + size:
                return self.data[off + addr - start:off + addr - start + n]
        return None

    def module(self, a):
        for base, size, name in self.mods:
            if base <= a < base + size:
                return name, a - base
        return None, None

    def exception(self):
        srva = self.streams[6][1]
        tid, _, code, _, _, addr, nparams = struct.unpack_from('<IIIIQQI', self.data, srva)
        params = struct.unpack_from('<4Q', self.data, srva + 48)[:nparams]
        csize, crva = struct.unpack_from('<II', self.data, srva + 160)
        rsp = struct.unpack_from('<Q', self.data, crva + 0x98)[0]
        return tid, code, addr, params, rsp

    def strings(self, tid):
        """Text on a thread's stack, plus text that stack slots point at."""
        _, stack = self.threads[tid]
        out = []
        for m in re.finditer(rb'[ -~]{6,}', stack):
            out.append(m.group(0)[:140].decode())
        for m in re.finditer(rb'(?:[ -~]\x00){6,}', stack):
            out.append(m.group(0).decode('utf-16le')[:140])
        for j in range(0, len(stack) - 8, 8):
            p = struct.unpack_from('<Q', stack, j)[0]
            b = self.read(p, 96) if p > 0x10000 else None
            if b:
                m = re.match(rb'[ -~]{6,}', b) or re.match(rb'(?:[ -~]\x00){6,}', b)
                if m:
                    s = m.group(0)
                    out.append('-> ' + (s.decode('utf-16le') if len(s) > 1 and s[1] == 0 else s.decode()))
        seen, uniq = set(), []
        for s in out:
            if s not in seen:
                seen.add(s)
                uniq.append(s)
        return uniq


class Exe:
    """Function bounds from .pdata; a function is named by the strings it loads RIP-relative."""
    def __init__(self, path):
        self.b = b = open(path, 'rb').read()
        pe = struct.unpack_from('<I', b, 0x3C)[0]
        opt, optsize = pe + 24, struct.unpack_from('<H', b, pe + 20)[0]
        self.secs = []
        for i in range(struct.unpack_from('<H', b, pe + 6)[0]):
            s = opt + optsize + i * 40
            vsize, va, rawsize, raw = struct.unpack_from('<IIII', b, s + 8)
            self.secs.append((va, max(vsize, rawsize), raw))
        exc_rva, exc_size = struct.unpack_from('<II', b, opt + 112 + 3 * 8)
        pd = self.off(exc_rva)
        self.funcs = [struct.unpack_from('<II', b, pd + i * 12) for i in range(exc_size // 12)]
        self.starts = [f[0] for f in self.funcs]

    def off(self, rva):
        for va, size, raw in self.secs:
            if va <= rva < va + size:
                return raw + rva - va
        return None

    def cstr(self, rva):
        o = self.off(rva)
        if o is None:
            return None
        m = re.match(rb'[ -~]{4,160}\x00', self.b[o:o + 162])
        return m.group(0)[:-1].decode() if m else None

    def describe(self, rva):
        i = bisect.bisect_right(self.starts, rva) - 1
        if i < 0 or not (self.funcs[i][0] <= rva < self.funcs[i][1]):
            return 'leaf (no unwind data)'
        b, e = self.funcs[i]
        code = self.b[self.off(b):self.off(b) + e - b]
        found = []
        for k in range(len(code) - 7):
            if code[k] in (0x48, 0x4C) and code[k + 1] in (0x8D, 0x8B) and (code[k + 2] & 0xC7) == 0x05:
                s = self.cstr(b + k + 7 + struct.unpack_from('<i', code, k + 3)[0])
                if s and s not in found:
                    found.append(s)
        return f'fn {b:#x} ({e - b} B) ' + ('; '.join(found[:6]) if found else '')


def main():
    args = sys.argv[1:]
    exe = EXE
    if '--exe' in args:
        exe = args[args.index('--exe') + 1]
        del args[args.index('--exe'):args.index('--exe') + 2]
    path = args[0] if args else max(glob.glob(os.path.join(os.environ['LOCALAPPDATA'], 'CrashDumps', 'Minecraft.Windows.exe*.dmp')), key=os.path.getmtime)
    d = Dump(path)
    tid, code, addr, params, rsp = d.exception()
    mod, rva = d.module(addr)
    print(f'{os.path.basename(path)}: exception {code:#x} at {mod}+{rva:#x}, params {[hex(p) for p in params]}')
    print(f'thread {tid} "{d.names.get(tid, "")}"')
    x = Exe(exe) if os.path.exists(exe) else None
    start, stack = d.threads[tid]
    frames, seen = [], set()
    for j in range(max(rsp - start, 0), len(stack) - 8, 8):
        a = struct.unpack_from('<Q', stack, j)[0]
        m, r = d.module(a)
        if m == 'Minecraft.Windows.exe' and r not in seen:
            seen.add(r)
            frames.append(r)
    print('game code on the crashing stack (innermost first):')
    for r in [rva] + frames[:30]:
        print(f'  +{r:#x}  {x.describe(r) if x else ""}')
    for t in sorted(d.threads, key=lambda t: d.names.get(t, '')):
        name = d.names.get(t, '')
        if t == tid or name.startswith(('Streaming', 'MC_SERVER', 'MINECRAFT MAIN', 'LevelDB', 'IO Thread')):
            s = d.strings(t)
            if s:
                print(f'== {t} "{name}"' + (' (crashed)' if t == tid else ''))
                for line in s[:25]:
                    print('   ', line)


if __name__ == '__main__':
    main()
