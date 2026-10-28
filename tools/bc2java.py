"""Turn javap -c bytecode into exact pseudo-Java (one statement per side effect, gotos kept).

Ghidra's JVM decompiler loses track of two-slot doubles/longs, so for bit-exact porting the bytecode is
the reference; this makes it readable. Locals are named by slot with a type prefix (i12, d38, a3, ...).

  python -I tools/bc2java.py <class> [method-filter]
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jp import javap_blocks  # noqa: E402

INSN = re.compile(r'^\s+(\d+): (\w+)\s*(.*?)\s*$')


class V:
    """A stack value: expression text, JVM category (1/2), precedence-safe flag."""
    __slots__ = ('t', 'cat', 'atom', 'new')

    def __init__(self, t, cat=1, atom=False, new=False):
        self.t, self.cat, self.atom, self.new = t, cat, atom, new

    def p(self):
        return self.t if self.atom else '(' + self.t + ')'


def desc_args(desc):
    """Parse a method descriptor -> (list of arg type chars, return type char)."""
    m = re.match(r'\((.*)\)(.*)', desc)
    args, i, s = [], 0, m.group(1)
    while i < len(s):
        c = s[i]
        if c == 'L':
            j = s.index(';', i)
            args.append('L')
            i = j + 1
        elif c == '[':
            while s[i] == '[':
                i += 1
            if s[i] == 'L':
                i = s.index(';', i)
            args.append('[')
            i += 1
        else:
            args.append(c)
            i += 1
    return args, m.group(2)[0]


def cat_of(tc):
    return 2 if tc in 'JD' else 1


def convert(sig, body, static):
    lines = body.split('\n')
    insns = []
    desc = None
    for ln in lines:
        if ln.strip().startswith('descriptor:') and desc is None:
            desc = ln.strip().split(None, 1)[1]
        m = INSN.match(ln)
        if m:
            insns.append((int(m.group(1)), m.group(2), m.group(3)))
        elif insns and re.match(r'^\s+(-?\d+|default): \d+$', ln):
            # tableswitch / lookupswitch case lines
            k, tgt = ln.strip().split(': ')
            insns[-1] = insns[-1] + ((k, int(tgt)),) if len(insns[-1]) > 3 else insns[-1] + ((k, int(tgt)),)
    out = []
    # parameter slots
    args, _ = desc_args(desc) if desc else ([], 'V')
    slot = 0 if static else 1
    pnames = [] if static else ['a0=this']
    pre = {'I': 'i', 'J': 'l', 'F': 'f', 'D': 'd', 'Z': 'i', 'B': 'i', 'C': 'i', 'S': 'i', 'L': 'a', '[': 'a'}
    for a in args:
        pnames.append(f'{pre[a]}{slot}')
        slot += cat_of(a)
    out.append(f'// {sig}')
    out.append(f'// {desc}   params: {", ".join(pnames)}')

    targets = set()
    for ins in insns:
        op, arg = ins[1], ins[2]
        if op.startswith('if') or op in ('goto', 'goto_w'):
            targets.add(int(arg.split()[0]))
        if op in ('tableswitch', 'lookupswitch'):
            for c in ins[3:]:
                targets.add(c[1])

    stack = []
    shapes = {}  # label -> stack depth+cats recorded at a jump
    tmp = [0]
    reachable = True

    def emit(s):
        out.append('    ' + s)

    def spill_to(target):
        # name stack slots s0.. so joins agree
        cats = []
        for k, v in enumerate(stack):
            name = f's{k}'
            if v.t != name:
                emit(f'{name} = {v.t};')
            stack[k] = V(name, v.cat, True)
            cats.append(v.cat)
        if target is not None:
            shapes.setdefault(target, cats)

    def pop():
        return stack.pop()

    def push(t, cat=1, atom=False):
        stack.append(V(t, cat, atom))

    def tmpvar(v):
        tmp[0] += 1
        n = f't{tmp[0]}'
        emit(f'{n} = {v.t};')
        return V(n, v.cat, True)

    BIN = {'add': '+', 'sub': '-', 'mul': '*', 'div': '/', 'rem': '%', 'shl': '<<', 'shr': '>>',
           'ushr': '>>>', 'and': '&', 'or': '|', 'xor': '^'}
    CONV = {'i2d': ('double', 2), 'i2f': ('float', 1), 'i2l': ('long', 2), 'l2i': ('int', 1), 'l2d': ('double', 2),
            'l2f': ('float', 1), 'f2i': ('int', 1), 'f2d': ('double', 2), 'f2l': ('long', 2), 'd2i': ('int', 1),
            'd2f': ('float', 1), 'd2l': ('long', 2), 'i2b': ('byte', 1), 'i2c': ('char', 1), 'i2s': ('short', 1)}
    COND = {'eq': '==', 'ne': '!=', 'lt': '<', 'ge': '>=', 'gt': '>', 'le': '<='}
    NEG = {'eq': '!=', 'ne': '==', 'lt': '>=', 'ge': '<', 'gt': '<=', 'le': '>'}
    pending_cmp = None

    for idx, ins in enumerate(insns):
        off, op, arg = ins[0], ins[1], ins[2]
        if off in targets:
            if reachable and stack:
                spill_to(off)
            if not reachable or not stack:
                cats = shapes.get(off, [])
                stack = [V(f's{k}', c, True) for k, c in enumerate(cats)]
            out.append(f'  L{off}:')
            reachable = True
        if not reachable:
            continue
        a = arg.split('//')[0].strip()
        comment = arg.split('//', 1)[1].strip() if '//' in arg else ''

        m = re.match(r'([ilfda])load(?:_(\d))?$', op)
        if m:
            n = m.group(2) if m.group(2) is not None else a
            t = m.group(1)
            push('this' if (t == 'a' and n == '0' and not static) else f'{t}{n}', 2 if t in 'ld' else 1, True)
            continue
        m = re.match(r'([ilfda])store(?:_(\d))?$', op)
        if m:
            n = m.group(2) if m.group(2) is not None else a
            v = pop()
            emit(f'{m.group(1)}{n} = {v.t};')
            continue
        if op == 'iinc':
            n, k = a.split(',')
            k = int(k)
            # a pending load of this local on the stack must keep the old value
            for i, v in enumerate(stack):
                if re.search(rf'\bi{n.strip()}\b', v.t):
                    stack[i] = tmpvar(v)
            emit(f'i{n.strip()} += {k};' if k >= 0 else f'i{n.strip()} -= {-k};')
            continue
        m = re.match(r'([ilfd])const_(m1|\d)$', op)
        if m:
            v = '-1' if m.group(2) == 'm1' else m.group(2)
            suf = {'i': '', 'l': 'L', 'f': 'F', 'd': '.0D'}[m.group(1)]
            push(v + suf, 2 if m.group(1) in 'ld' else 1, True)
            continue
        if op in ('bipush', 'sipush'):
            push(a, 1, True)
            continue
        if op in ('ldc', 'ldc_w', 'ldc2_w'):
            c = comment
            mm = re.match(r'(int|float|double|long|String|class)\s+(.*)', c)
            if mm:
                kind, val = mm.groups()
                if kind == 'String':
                    val = '"' + val + '"'
                elif kind == 'float':
                    val = val.rstrip('f') + 'F'
                elif kind == 'double':
                    val = val.rstrip('d') + 'D'
                elif kind == 'long':
                    val = val.rstrip('l') + 'L'
                push(val, 2 if kind in ('double', 'long') else 1, True)
            else:
                push(c, 1, True)
            continue
        if op == 'aconst_null':
            push('null', 1, True)
            continue
        m = re.match(r'([ilfd])(add|sub|mul|div|rem|shl|shr|ushr|and|or|xor)$', op)
        if m:
            b_, a_ = pop(), pop()
            push(f'{a_.p()} {BIN[m.group(2)]} {b_.p()}', 2 if m.group(1) in 'ld' else 1)
            continue
        m = re.match(r'([ilfd])neg$', op)
        if m:
            v = pop()
            push(f'-{v.p()}', v.cat)
            continue
        if op in CONV:
            v = pop()
            push(f'({CONV[op][0]}){v.p()}', CONV[op][1])
            continue
        if op in ('lcmp', 'fcmpl', 'fcmpg', 'dcmpl', 'dcmpg'):
            b_, a_ = pop(), pop()
            pending_cmp = (op, a_, b_)
            push('<cmp>', 1)
            continue
        m = re.match(r'if(eq|ne|lt|ge|gt|le)$', op)
        if m:
            v = pop()
            c = m.group(1)
            if v.t == '<cmp>' and pending_cmp:
                kind, a_, b_ = pending_cmp
                pending_cmp = None
                nan_hi = kind.endswith('g')  # NaN compares as +1 (cmpg) or -1 (cmpl); lcmp has no NaN
                if kind == 'lcmp' or c in ('eq', 'ne'):
                    cond = f'{a_.p()} {COND[c]} {b_.p()}'
                elif (nan_hi and c in ('lt', 'le')) or (not nan_hi and c in ('gt', 'ge')):
                    cond = f'{a_.p()} {COND[c]} {b_.p()}'
                else:
                    cond = f'!({a_.p()} {NEG[c]} {b_.p()})'
            else:
                cond = f'{v.p()} {COND[c]} 0'
            tgt = int(a)
            spill_to(tgt)
            emit(f'if ({cond}) goto L{tgt};')
            continue
        m = re.match(r'if_([ia])cmp(eq|ne|lt|ge|gt|le)$', op)
        if m:
            b_, a_ = pop(), pop()
            tgt = int(a)
            spill_to(tgt)
            emit(f'if ({a_.p()} {COND[m.group(2)]} {b_.p()}) goto L{tgt};')
            continue
        if op in ('ifnull', 'ifnonnull'):
            v = pop()
            tgt = int(a)
            spill_to(tgt)
            emit(f'if ({v.p()} {"==" if op == "ifnull" else "!="} null) goto L{tgt};')
            continue
        if op in ('goto', 'goto_w'):
            tgt = int(a)
            spill_to(tgt)
            emit(f'goto L{tgt};')
            reachable = False
            continue
        if op in ('tableswitch', 'lookupswitch'):
            v = pop()
            spill_to(None)
            cases = ins[3:]
            emit(f'switch ({v.t}) {{ ' + ' '.join(f'{k}: goto L{t};' for k, t in cases) + ' }')
            for _, t in cases:
                shapes.setdefault(t, [])
            reachable = False
            continue
        m = re.match(r'([ilfda]?)return$', op)
        if m:
            emit('return;' if not m.group(1) else f'return {pop().t};')
            reachable = False
            continue
        if op == 'athrow':
            emit(f'throw {pop().t};')
            reachable = False
            continue
        if op in ('getfield', 'getstatic', 'putfield', 'putstatic'):
            mm = re.match(r'Field (?:(\S+)\.)?(\w+):(\S+)', comment)
            owner, name, ty = mm.group(1), mm.group(2), mm.group(3)
            cat = cat_of(ty[0])
            if op == 'getfield':
                o = pop()
                push(f'{o.p()}.{name}', cat, True)
            elif op == 'getstatic':
                push(f'{owner or "<cls>"}.{name}', cat, True)
            elif op == 'putfield':
                v, o = pop(), pop()
                emit(f'{o.p()}.{name} = {v.t};')
            else:
                v = pop()
                emit(f'{owner or "<cls>"}.{name} = {v.t};')
            continue
        if op.startswith('invoke'):
            mm = re.match(r'(?:Interface)?Method (?:(\S+)\.)?("<init>"|\w+|"<clinit>"):(\S+)', comment)
            owner, name, d = mm.group(1), mm.group(2).strip('"'), mm.group(3)
            args_, ret = desc_args(d)
            av = [pop() for _ in args_][::-1]
            astr = ', '.join(x.t for x in av)
            if op == 'invokestatic':
                call = f'{owner or "<cls>"}.{name}({astr})'
            else:
                recv = pop()
                if name == '<init>':
                    if recv.new:
                        recv.t = f'new {recv.t[4:-2]}({astr})'
                        recv.new = False
                        recv.atom = True
                        continue
                    emit(f'{recv.t}.<init>({astr});')
                    continue
                call = f'{recv.p()}.{name}({astr})'
            if ret == 'V':
                emit(call + ';')
            else:
                push(call, cat_of(ret), True)
            continue
        if op == 'new':
            v = V(f'new {comment.split()[-1]}()', 1, True, new=True)
            v.t = f'new {comment.split()[-1]}()'
            stack.append(v)
            continue
        if op == 'newarray':
            n = pop()
            push(f'new {a}[{n.t}]', 1, True)
            continue
        if op == 'anewarray':
            n = pop()
            push(f'new {comment.split()[-1]}[{n.t}]', 1, True)
            continue
        if op == 'multianewarray':
            dims = int(a.split(',')[1])
            ds = [pop() for _ in range(dims)][::-1]
            push(f'new {comment.split()[-1]}' + ''.join(f'[{x.t}]' for x in ds), 1, True)
            continue
        if op == 'arraylength':
            v = pop()
            push(f'{v.p()}.length', 1, True)
            continue
        m = re.match(r'([ilfdabcs])aload$', op)
        if m:
            i_, arr = pop(), pop()
            push(f'{arr.p()}[{i_.t}]', 2 if m.group(1) in 'ld' else 1, True)
            continue
        m = re.match(r'([ilfdabcs])astore$', op)
        if m:
            v, i_, arr = pop(), pop(), pop()
            emit(f'{arr.p()}[{i_.t}] = {v.t};')
            continue
        if op == 'checkcast':
            v = pop()
            push(f'({comment.split()[-1]}){v.p()}', 1)
            continue
        if op == 'instanceof':
            v = pop()
            push(f'{v.p()} instanceof {comment.split()[-1]}', 1)
            continue
        if op == 'dup':
            v = stack[-1]
            if v.new or v.atom and re.fullmatch(r'[\w.]+', v.t):
                stack.append(v)
            else:
                v = tmpvar(pop())
                stack.extend([v, v])
            continue
        if op in ('dup2', 'dup_x1', 'dup_x2', 'dup2_x1', 'dup2_x2', 'swap', 'pop', 'pop2'):
            def solid(v):
                return v if (v.atom and re.fullmatch(r'[\w.]+', v.t)) else tmpvar(v)
            if op == 'pop':
                v = pop()
                if not v.atom or '(' in v.t:
                    emit(v.t + ';')
            elif op == 'pop2':
                v = pop()
                if v.cat == 1:
                    pop()
                emit('// pop2')
            elif op == 'swap':
                b_, a_ = pop(), pop()
                stack.extend([b_, a_])
            elif op == 'dup2':
                v = pop()
                if v.cat == 2:
                    v = solid(v)
                    stack.extend([v, v])
                else:
                    w = solid(pop())
                    v = solid(v)
                    stack.extend([w, v, w, v])
            elif op == 'dup_x1':
                v1, v2 = solid(pop()), pop()
                stack.extend([v1, v2, v1])
            elif op == 'dup2_x1':
                v1 = pop()
                if v1.cat == 2:
                    v1 = solid(v1)
                    v2 = pop()
                    stack.extend([v1, v2, v1])
                else:
                    v1 = solid(v1)
                    v2 = solid(pop())
                    v3 = pop()
                    stack.extend([v2, v1, v3, v2, v1])
            elif op == 'dup_x2':
                v1 = solid(pop())
                v2 = pop()
                if v2.cat == 2:
                    stack.extend([v1, v2, v1])
                else:
                    v3 = pop()
                    stack.extend([v1, v3, v2, v1])
            else:
                emit(f'// unsupported {op}')
            continue
        if op in ('monitorenter', 'monitorexit'):
            emit(f'{op}({pop().t});')
            continue
        if op == 'nop':
            continue
        emit(f'// ??? {op} {arg}')
    return '\n'.join(out)


def main(argv):
    cls = argv[0]
    flt = argv[1] if len(argv) > 1 else None
    b = javap_blocks()[cls]
    for m in re.finditer(r'\n  (\S[^\n]*)\n((?:    [^\n]*\n|\n(?=    ))*)', b):
        sig = m.group(1)
        if 'Code:' not in m.group(2):
            continue
        if flt is not None and flt not in sig:
            continue
        print(convert(sig, m.group(2), ' static ' in ' ' + sig or sig.startswith('static')))
        print()


if __name__ == '__main__':
    main(sys.argv[1:])
