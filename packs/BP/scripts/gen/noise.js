// b1.7.3 noise: NoiseGeneratorPerlin (am), NoiseGeneratorOctaves (uf), NoiseGeneratorSimplex (cc) and
// NoiseGeneratorOctaves2 (ug). Ported from the bytecode, including Beta's quirks (the 2D path's first gradient
// is the 2D one; the 3D path reuses the cached lerps whenever the Y lattice cell repeats).

function lerp(t, a, b) {
    return a + t * (b - a);
}

function grad2(h, x, z) {
    const i = h & 15;
    const a = (1 - ((i & 8) >> 3)) * x;
    const b = i < 4 ? 0.0 : i === 12 || i === 14 ? x : z;
    return ((i & 1) !== 0 ? -a : a) + ((i & 2) !== 0 ? -b : b);
}

function grad3(h, x, y, z) {
    const i = h & 15;
    const a = i < 8 ? x : y;
    const b = i < 4 ? y : i === 12 || i === 14 ? x : z;
    return ((i & 1) !== 0 ? -a : a) + ((i & 2) !== 0 ? -b : b);
}

function fade(t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// `int i = (int)d; if (d < i) i--;` with Java int semantics: the cast saturates and the decrement wraps,
// which is what produces the Far Lands at 12.55 million blocks.
function ifloor(d) {
    const i = d >= 2147483647 ? 2147483647 : d <= -2147483648 ? -2147483648 : d | 0;
    return d < i ? (i - 1) | 0 : i;
}

export class Perlin {
    constructor(rand) {
        const p = new Int32Array(512);
        this.xo = rand.nextDouble() * 256.0;
        this.yo = rand.nextDouble() * 256.0;
        this.zo = rand.nextDouble() * 256.0;
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 0; i < 256; i++) {
            const j = rand.nextInt(256 - i) + i;
            const t = p[i];
            p[i] = p[j];
            p[j] = t;
            p[i + 256] = p[i];
        }
        this.p = p;
    }

    noise3(x0, y0, z0) {
        const p = this.p;
        let x = x0 + this.xo;
        let y = y0 + this.yo;
        let z = z0 + this.zo;
        const ix = ifloor(x), iy = ifloor(y), iz = ifloor(z);
        const X = ix & 255, Y = iy & 255, Z = iz & 255;
        x -= ix;
        y -= iy;
        z -= iz;
        const u = fade(x), v = fade(y), w = fade(z);
        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
        const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        return lerp(w,
            lerp(v, lerp(u, grad3(p[AA], x, y, z), grad3(p[BA], x - 1.0, y, z)),
                lerp(u, grad3(p[AB], x, y - 1.0, z), grad3(p[BB], x - 1.0, y - 1.0, z))),
            lerp(v, lerp(u, grad3(p[AA + 1], x, y, z - 1.0), grad3(p[BA + 1], x - 1.0, y, z - 1.0)),
                lerp(u, grad3(p[AB + 1], x, y - 1.0, z - 1.0), grad3(p[BB + 1], x - 1.0, y - 1.0, z - 1.0))));
    }

    noise2(x, y) {
        return this.noise3(x, y, 0.0);
    }

    // am.a(double[], x, y, z, sx, sy, sz, scx, scy, scz, amplitude): adds this octave into out
    add(out, x, y, z, sx, sy, sz, scx, scy, scz, amp) {
        const p = this.p;
        if (sy === 1) {
            let n = 0;
            const inv = 1.0 / amp;
            for (let i = 0; i < sx; i++) {
                let fx = (x + i) * scx + this.xo;
                const ix = ifloor(fx);
                const X = ix & 255;
                fx -= ix;
                const u = fade(fx);
                for (let k = 0; k < sz; k++) {
                    let fz = (z + k) * scz + this.zo;
                    const iz = ifloor(fz);
                    const Z = iz & 255;
                    fz -= iz;
                    const w = fade(fz);
                    const A = p[X] + 0, AA = p[A] + Z;
                    const B = p[X + 1] + 0, BA = p[B] + Z;
                    const a = lerp(u, grad2(p[AA], fx, fz), grad3(p[BA], fx - 1.0, 0.0, fz));
                    const b = lerp(u, grad3(p[AA + 1], fx, 0.0, fz - 1.0), grad3(p[BA + 1], fx - 1.0, 0.0, fz - 1.0));
                    out[n++] += lerp(w, a, b) * inv;
                }
            }
            return;
        }
        let n = 0;
        const inv = 1.0 / amp;
        let lastY = -1;
        let l0 = 0.0, l1 = 0.0, l2 = 0.0, l3 = 0.0;
        for (let i = 0; i < sx; i++) {
            let fx = (x + i) * scx + this.xo;
            const ix = ifloor(fx);
            const X = ix & 255;
            fx -= ix;
            const u = fade(fx);
            for (let k = 0; k < sz; k++) {
                let fz = (z + k) * scz + this.zo;
                const iz = ifloor(fz);
                const Z = iz & 255;
                fz -= iz;
                const w = fade(fz);
                for (let j = 0; j < sy; j++) {
                    let fy = (y + j) * scy + this.yo;
                    const iy = ifloor(fy);
                    const Y = iy & 255;
                    fy -= iy;
                    const v = fade(fy);
                    if (j === 0 || Y !== lastY) {
                        lastY = Y;
                        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
                        const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
                        l0 = lerp(u, grad3(p[AA], fx, fy, fz), grad3(p[BA], fx - 1.0, fy, fz));
                        l1 = lerp(u, grad3(p[AB], fx, fy - 1.0, fz), grad3(p[BB], fx - 1.0, fy - 1.0, fz));
                        l2 = lerp(u, grad3(p[AA + 1], fx, fy, fz - 1.0), grad3(p[BA + 1], fx - 1.0, fy, fz - 1.0));
                        l3 = lerp(u, grad3(p[AB + 1], fx, fy - 1.0, fz - 1.0), grad3(p[BB + 1], fx - 1.0, fy - 1.0, fz - 1.0));
                    }
                    const a = lerp(v, l0, l1);
                    const b = lerp(v, l2, l3);
                    out[n++] += lerp(w, a, b) * inv;
                }
            }
        }
    }
}

export class Octaves {
    constructor(rand, octaves) {
        this.gens = [];
        for (let i = 0; i < octaves; i++) this.gens.push(new Perlin(rand));
    }

    // uf.a(double, double)
    value2(x, z) {
        let sum = 0.0;
        let s = 1.0;
        for (const g of this.gens) {
            sum += g.noise2(x * s, z * s) / s;
            s /= 2.0;
        }
        return sum;
    }

    // uf.a(double[], x, y, z, sx, sy, sz, scx, scy, scz)
    generate(out, x, y, z, sx, sy, sz, scx, scy, scz) {
        if (out === null) out = new Float64Array(sx * sy * sz);
        else out.fill(0.0);
        let s = 1.0;
        for (const g of this.gens) {
            g.add(out, x, y, z, sx, sy, sz, scx * s, scy * s, scz * s, s);
            s /= 2.0;
        }
        return out;
    }

    // uf.a(double[], int x, int z, int sx, int sz, double scx, double scz, double unused)
    generate2(out, x, z, sx, sz, scx, scz) {
        return this.generate(out, x, 10.0, z, sx, 1, sz, scx, 1.0, scz);
    }
}

const SIMPLEX_GRAD = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

function sfloor(d) {
    return d > 0.0 ? d | 0 : (d | 0) - 1;
}

export class Simplex {
    constructor(rand) {
        const p = new Int32Array(512);
        this.xo = rand.nextDouble() * 256.0;
        this.yo = rand.nextDouble() * 256.0;
        this.zo = rand.nextDouble() * 256.0;
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 0; i < 256; i++) {
            const j = rand.nextInt(256 - i) + i;
            const t = p[i];
            p[i] = p[j];
            p[j] = t;
            p[i + 256] = p[i];
        }
        this.p = p;
    }

    // cc.a(double[], x, z, sx, sz, scx, scz, amplitude)
    add(out, x, z, sx, sz, scx, scz, amp) {
        const p = this.p;
        let n = 0;
        for (let i = 0; i < sx; i++) {
            const xin = (x + i) * scx + this.xo;
            for (let k = 0; k < sz; k++) {
                const yin = (z + k) * scz + this.yo;
                const s = (xin + yin) * F2;
                const ii = sfloor(xin + s);
                const jj = sfloor(yin + s);
                const t = (ii + jj) * G2;
                const x0 = xin - (ii - t);
                const y0 = yin - (jj - t);
                let i1, j1;
                if (x0 > y0) {
                    i1 = 1;
                    j1 = 0;
                } else {
                    i1 = 0;
                    j1 = 1;
                }
                const x1 = x0 - i1 + G2;
                const y1 = y0 - j1 + G2;
                const x2 = x0 - 1.0 + 2.0 * G2;
                const y2 = y0 - 1.0 + 2.0 * G2;
                const a = ii & 255, b = jj & 255;
                const g0 = p[a + p[b]] % 12;
                const g1 = p[a + i1 + p[b + j1]] % 12;
                const g2 = p[a + 1 + p[b + 1]] % 12;
                let n0, n1, n2;
                let t0 = 0.5 - x0 * x0 - y0 * y0;
                if (t0 < 0.0) n0 = 0.0;
                else {
                    t0 *= t0;
                    const g = SIMPLEX_GRAD[g0];
                    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
                }
                let t1 = 0.5 - x1 * x1 - y1 * y1;
                if (t1 < 0.0) n1 = 0.0;
                else {
                    t1 *= t1;
                    const g = SIMPLEX_GRAD[g1];
                    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
                }
                let t2 = 0.5 - x2 * x2 - y2 * y2;
                if (t2 < 0.0) n2 = 0.0;
                else {
                    t2 *= t2;
                    const g = SIMPLEX_GRAD[g2];
                    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
                }
                out[n++] += 70.0 * (n0 + n1 + n2) * amp;
            }
        }
    }
}

export class Octaves2 {
    constructor(rand, octaves) {
        this.gens = [];
        for (let i = 0; i < octaves; i++) this.gens.push(new Simplex(rand));
    }

    // ug.a(double[], x, z, sx, sz, scx, scz, freqMul[, ampMul = 0.5])
    generate(out, x, z, sx, sz, scx, scz, freqMul, ampMul = 0.5) {
        scx /= 1.5;
        scz /= 1.5;
        if (out === null || out.length < sx * sz) out = new Float64Array(sx * sz);
        else out.fill(0.0);
        let amp = 1.0;
        let freq = 1.0;
        for (const g of this.gens) {
            g.add(out, x, z, sx, sz, scx * freq, scz * freq, 0.55 / amp);
            freq *= freqMul;
            amp *= ampMul;
        }
        return out;
    }
}

