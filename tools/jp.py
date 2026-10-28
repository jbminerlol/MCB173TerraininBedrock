"""Print javap bytecode (re/javap/all.txt) or Ghidra decompilation (re/decomp/<cls>.c) for one class/method.

  python -I tools/jp.py <class>                  class summary (fields + method signatures)
  python -I tools/jp.py <class> <method-filter>  bytecode of methods whose signature line contains the filter
  python -I tools/jp.py -g <class> [filter]      Ghidra decompilation instead
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def javap_blocks():
    txt = open(os.path.join(ROOT, 're', 'javap', 'all.txt'), encoding='utf-8').read()
    out = {}
    for b in re.split(r'\n(?=Compiled from)', txt):
        m = re.search(r'(?:class|interface) (\S+)', b)
        if m:
            out[m.group(1)] = b
    return out


def main(argv):
    ghidra = argv and argv[0] == '-g'
    if ghidra:
        argv = argv[1:]
    cls = argv[0]
    flt = argv[1] if len(argv) > 1 else None
    if ghidra:
        txt = open(os.path.join(ROOT, 're', 'decomp', cls + '.c'), encoding='utf-8').read()
        parts = re.split(r'\n(?=// @ram:)', txt)
        for p in parts:
            if flt is None or flt in p.split('\n', 1)[0]:
                print(re.sub(r'/\* Flags:.*?\*/\n', '', p, flags=re.S))
        return
    b = javap_blocks()[cls]
    if flt is None:
        for line in b.split('\n'):
            if line.startswith('  ') and not line.startswith('    ') or line.startswith(('public', 'class', 'final', 'abstract', 'interface')):
                print(line)
        return
    # methods: signature line at 2-space indent, followed by an indented body until a blank line
    for m in re.finditer(r'\n  (\S[^\n]*)\n((?:    [^\n]*\n|\n(?=    ))*)', b):
        if flt in m.group(1):
            print('  ' + m.group(1))
            print(m.group(2))


if __name__ == '__main__':
    main(sys.argv[1:])
