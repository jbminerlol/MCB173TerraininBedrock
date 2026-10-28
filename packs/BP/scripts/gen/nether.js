// ChunkProviderHell (qn), MapGenCavesHell (pk) and the nether features from b1.7.3.
// Like the original, populate never reseeds: it continues the generator's Random from the last chunk made.

import { JavaRandom, lmul } from './random.js';
import { Octaves } from './noise.js';
import { sin, cos, floorD } from './mathhelper.js';
import { B, behaviour } from './behaviour.js';
import { flowers } from './features.js';

const f = Math.fround;
const PI_F = f(3.1415927);
const HALF_PI_F = f(1.5707964);

class HellCaves {
    constructor() {
        this.range = 8;
        this.rand = new JavaRandom(0n);
    }

    generate(seed, cx, cz, blocks) {
        const r = this.rand;
        r.setSeed(seed);
        const a = (r.nextLong() / 2n) * 2n + 1n;
        const b = (r.nextLong() / 2n) * 2n + 1n;
        for (let x = cx - this.range; x <= cx + this.range; x++) {
            for (let z = cz - this.range; z <= cz + this.range; z++) {
                r.setSeed(BigInt.asIntN(64, (lmul(x, a) + lmul(z, b)) ^ seed));
                this.recursiveGenerate(x, z, cx, cz, blocks);
            }
        }
    }

    recursiveGenerate(x, z, cx, cz, blocks) {
        const r = this.rand;
        let n = r.nextInt(r.nextInt(r.nextInt(10) + 1) + 1);
        if (r.nextInt(5) !== 0) n = 0;
        for (let i = 0; i < n; i++) {
            const px = x * 16 + r.nextInt(16);
            const py = r.nextInt(128);
            const pz = z * 16 + r.nextInt(16);
            let tunnels = 1;
            if (r.nextInt(4) === 0) {
                this.tunnel(cx, cz, blocks, px, py, pz, f(1.0 + f(r.nextFloat() * 6.0)), 0.0, 0.0, -1, -1, 0.5);
                tunnels += r.nextInt(4);
            }
            for (let j = 0; j < tunnels; j++) {
                const yaw = f(f(r.nextFloat() * PI_F) * 2.0);
                const pitch = f(f(f(r.nextFloat() - 0.5) * 2.0) / 8.0);
                const width = f(f(r.nextFloat() * 2.0) + r.nextFloat());
                this.tunnel(cx, cz, blocks, px, py, pz, f(width * 2.0), yaw, pitch, 0, 0, 0.5);
            }
        }
    }

    tunnel(cx, cz, blocks, x, y, z, width, yaw, pitch, step, steps, vScale) {
        const midX = cx * 16 + 8;
        const midZ = cz * 16 + 8;
        let dYaw = 0.0;
        let dPitch = 0.0;
        const r = new JavaRandom(this.rand.nextLong());
        if (steps <= 0) {
            const max = this.range * 16 - 16;
            steps = max - r.nextInt((max / 4) | 0);
        }
        let isRoom = false;
        if (step === -1) {
            step = (steps / 2) | 0;
            isRoom = true;
        }
        const branchAt = r.nextInt((steps / 2) | 0) + ((steps / 4) | 0);
        const steep = r.nextInt(6) === 0;
        for (; step < steps; step++) {
            const hr = 1.5 + f(f(sin(f(f(step * PI_F) / steps)) * width) * 1.0);
            const vr = hr * vScale;
            const cp = cos(pitch);
            const sp = sin(pitch);
            x += f(cos(yaw) * cp);
            y += sp;
            z += f(sin(yaw) * cp);
            if (steep) pitch = f(pitch * f(0.92));
            else pitch = f(pitch * f(0.7));
            pitch = f(pitch + f(dPitch * f(0.1)));
            yaw = f(yaw + f(dYaw * f(0.1)));
            dPitch = f(dPitch * f(0.9));
            dYaw = f(dYaw * f(0.75));
            dPitch = f(dPitch + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 2.0));
            dYaw = f(dYaw + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 4.0));
            if (!isRoom && step === branchAt && width > 1.0) {
                this.tunnel(cx, cz, blocks, x, y, z, f(f(r.nextFloat() * 0.5) + 0.5), f(yaw - HALF_PI_F), f(pitch / 3.0), step, steps, 1.0);
                this.tunnel(cx, cz, blocks, x, y, z, f(f(r.nextFloat() * 0.5) + 0.5), f(yaw + HALF_PI_F), f(pitch / 3.0), step, steps, 1.0);
                return;
            }
            if (!isRoom && r.nextInt(4) === 0) continue;
            const ddx = x - midX;
            const ddz = z - midZ;
            const left = steps - step;
            const reach = f(f(width + 2.0) + 16.0);
            if (ddx * ddx + ddz * ddz - left * left > reach * reach) return;
            if (x < midX - 16.0 - hr * 2.0 || z < midZ - 16.0 - hr * 2.0 || x > midX + 16.0 + hr * 2.0 || z > midZ + 16.0 + hr * 2.0)
                continue;
            let x0 = floorD(x - hr) - cx * 16 - 1;
            let x1 = floorD(x + hr) - cx * 16 + 1;
            let y0 = floorD(y - vr) - 1;
            let y1 = floorD(y + vr) + 1;
            let z0 = floorD(z - hr) - cz * 16 - 1;
            let z1 = floorD(z + hr) - cz * 16 + 1;
            if (x0 < 0) x0 = 0;
            if (x1 > 16) x1 = 16;
            if (y0 < 1) y0 = 1;
            if (y1 > 120) y1 = 120;
            if (z0 < 0) z0 = 0;
            if (z1 > 16) z1 = 16;
            let lava = false;
            for (let bx = x0; !lava && bx < x1; bx++) {
                for (let bz = z0; !lava && bz < z1; bz++) {
                    for (let by = y1 + 1; !lava && by >= y0 - 1; by--) {
                        const i = (bx * 16 + bz) * 128 + by;
                        if (by >= 0 && by < 128) {
                            if (blocks[i] === B.lavaFlowing || blocks[i] === B.lava) lava = true;
                            if (by !== y0 - 1 && bx !== x0 && bx !== x1 - 1 && bz !== z0 && bz !== z1 - 1) by = y0;
                        }
                    }
                }
            }
            if (lava) continue;
            for (let bx = x0; bx < x1; bx++) {
                const ex = (bx + cx * 16 + 0.5 - x) / hr;
                for (let bz = z0; bz < z1; bz++) {
                    const ez = (bz + cz * 16 + 0.5 - z) / hr;
                    let i = (bx * 16 + bz) * 128 + y1;
                    for (let by = y1 - 1; by >= y0; by--) {
                        const ey = (by + 0.5 - y) / vr;
                        if (ey > -0.7 && ex * ex + ey * ey + ez * ez < 1.0) {
                            const id = blocks[i];
                            if (id === B.netherrack || id === B.dirt || id === B.grass) blocks[i] = 0;
                        }
                        i--;
                    }
                }
            }
            if (isRoom) break;
        }
    }
}

// yq: fire, as far as generation goes (it is placed on netherrack, never next to obsidian here)
const FLAMMABLE = new Uint8Array(256);
for (const id of [5, 85, 53, 17, 18, 47, 46, 31, 35]) FLAMMABLE[id] = 1;
function fireCanStay(w, x, y, z) {
    if (w.isBlockNormalCube(x, y - 1, z)) return true;
    return FLAMMABLE[w.getBlockId(x + 1, y, z)] || FLAMMABLE[w.getBlockId(x - 1, y, z)] ||
        FLAMMABLE[w.getBlockId(x, y - 1, z)] || FLAMMABLE[w.getBlockId(x, y + 1, z)] ||
        FLAMMABLE[w.getBlockId(x, y, z - 1)] || FLAMMABLE[w.getBlockId(x, y, z + 1)];
}
behaviour[B.fire] = {
    *added(w, x, y, z) {
        if (!fireCanStay(w, x, y, z)) yield w.gSetBlockWithNotify(x, y, z, 0);
        else yield w.gScheduleBlockUpdate(x, y, z, B.fire, 40);
    },
    *neighborChanged(w, x, y, z) {
        if (!fireCanStay(w, x, y, z)) yield w.gSetBlockWithNotify(x, y, z, 0);
    },
};

// WorldGenHellLava (qc)
function hellLava(w, r, x, y, z, id) {
    if (w.getBlockId(x, y + 1, z) !== B.netherrack) return false;
    if (w.getBlockId(x, y, z) !== 0 && w.getBlockId(x, y, z) !== B.netherrack) return false;
    let rock = 0;
    if (w.getBlockId(x - 1, y, z) === B.netherrack) rock++;
    if (w.getBlockId(x + 1, y, z) === B.netherrack) rock++;
    if (w.getBlockId(x, y, z - 1) === B.netherrack) rock++;
    if (w.getBlockId(x, y, z + 1) === B.netherrack) rock++;
    if (w.getBlockId(x, y - 1, z) === B.netherrack) rock++;
    let air = 0;
    if (w.isAirBlock(x - 1, y, z)) air++;
    if (w.isAirBlock(x + 1, y, z)) air++;
    if (w.isAirBlock(x, y, z - 1)) air++;
    if (w.isAirBlock(x, y, z + 1)) air++;
    if (w.isAirBlock(x, y - 1, z)) air++;
    if (rock === 4 && air === 1) {
        w.setBlockWithNotify(x, y, z, id);
        w.immediate = true;
        w.run(behaviour[id].tick(w, x, y, z, r));
        w.immediate = false;
    }
    return true;
}

// WorldGenFire (xs)
function fire(w, r, x, y, z) {
    for (let i = 0; i < 64; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (!w.isAirBlock(a, b, c)) continue;
        if (w.getBlockId(a, b - 1, c) !== B.netherrack) continue;
        w.setBlockWithNotify(a, b, c, B.fire);
    }
    return true;
}

// WorldGenGlowStone1 (gd) and WorldGenGlowStone2 (sf) are identical in b1.7.3
function glowstone(w, r, x, y, z) {
    if (!w.isAirBlock(x, y, z)) return false;
    if (w.getBlockId(x, y + 1, z) !== B.netherrack) return false;
    w.setBlockWithNotify(x, y, z, B.glowstone);
    for (let i = 0; i < 1500; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y - r.nextInt(12);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (w.getBlockId(a, b, c) !== 0) continue;
        let n = 0;
        for (let k = 0; k < 6; k++) {
            let id = 0;
            if (k === 0) id = w.getBlockId(a - 1, b, c);
            if (k === 1) id = w.getBlockId(a + 1, b, c);
            if (k === 2) id = w.getBlockId(a, b - 1, c);
            if (k === 3) id = w.getBlockId(a, b + 1, c);
            if (k === 4) id = w.getBlockId(a, b, c - 1);
            if (k === 5) id = w.getBlockId(a, b, c + 1);
            if (id === B.glowstone) n++;
        }
        if (n === 1) w.setBlockWithNotify(a, b, c, B.glowstone);
    }
    return true;
}

export class Nether {
    constructor(seed) {
        this.seed = BigInt.asIntN(64, BigInt(seed));
        this.skylightOnLoad = false;
        const r = new JavaRandom(this.seed);
        this.rand = r;                          // qn.h
        this.minLimit = new Octaves(r, 16);     // i
        this.maxLimit = new Octaves(r, 16);     // j
        this.main = new Octaves(r, 8);          // k
        this.surface = new Octaves(r, 4);       // l
        this.stoneDepth = new Octaves(r, 4);    // m
        this.scale = new Octaves(r, 10);        // a
        this.depth = new Octaves(r, 16);        // b
        this.caves = new HellCaves();
        this.field = null;
        this.sandNoise = new Float64Array(256);
        this.gravelNoise = new Float64Array(256);
        this.depthNoise = new Float64Array(256);
        this.mainN = this.minN = this.maxN = this.scaleN = this.depthN = null;
    }

    // qn.b(x, z)
    provideChunk(world, cx, cz) {
        this.rand.setSeed(lmul(cx, 341873128712n) + lmul(cz, 132897987541n));
        const blocks = new Uint8Array(32768);
        this.generateTerrain(cx, cz, blocks);
        this.replaceBlocks(cx, cz, blocks);
        this.caves.generate(this.seed, cx, cz, blocks);
        return blocks;
    }

    // qn.a(int, int, byte[])
    generateTerrain(cx, cz, blocks) {
        const n = 4, lavaLevel = 32, sx = n + 1, sy = 17, sz = n + 1;
        const q = (this.field = this.densityField(this.field, cx * n, 0, cz * n, sx, sy, sz));
        for (let i = 0; i < n; i++) {
            for (let k = 0; k < n; k++) {
                for (let j = 0; j < 16; j++) {
                    const step = 0.125;
                    let a = q[((i + 0) * sz + (k + 0)) * sy + (j + 0)];
                    let b = q[((i + 0) * sz + (k + 1)) * sy + (j + 0)];
                    let c = q[((i + 1) * sz + (k + 0)) * sy + (j + 0)];
                    let d = q[((i + 1) * sz + (k + 1)) * sy + (j + 0)];
                    const da = (q[((i + 0) * sz + (k + 0)) * sy + (j + 1)] - a) * step;
                    const db = (q[((i + 0) * sz + (k + 1)) * sy + (j + 1)] - b) * step;
                    const dc = (q[((i + 1) * sz + (k + 0)) * sy + (j + 1)] - c) * step;
                    const dd = (q[((i + 1) * sz + (k + 1)) * sy + (j + 1)] - d) * step;
                    for (let l = 0; l < 8; l++) {
                        let e = a, g = b;
                        const de = (c - a) * 0.25;
                        const dg = (d - b) * 0.25;
                        for (let m = 0; m < 4; m++) {
                            let idx = ((m + i * 4) << 11) | ((0 + k * 4) << 7) | (j * 8 + l);
                            let v = e;
                            const dv = (g - e) * 0.25;
                            for (let o = 0; o < 4; o++) {
                                let id = 0;
                                if (j * 8 + l < lavaLevel) id = B.lava;
                                if (v > 0.0) id = B.netherrack;
                                blocks[idx] = id;
                                idx += 128;
                                v += dv;
                            }
                            e += de;
                            g += dg;
                        }
                        a += da;
                        b += db;
                        c += dc;
                        d += dd;
                    }
                }
            }
        }
    }

    // qn.a(double[], int, int, int, int, int, int)
    densityField(out, x, y, z, sx, sy, sz) {
        if (out === null) out = new Float64Array(sx * sy * sz);
        const d8 = 684.412, d10 = 2053.236;
        this.scaleN = this.scale.generate(this.scaleN, x, y, z, sx, 1, sz, 1.0, 0.0, 1.0);
        this.depthN = this.depth.generate(this.depthN, x, y, z, sx, 1, sz, 100.0, 0.0, 100.0);
        this.mainN = this.main.generate(this.mainN, x, y, z, sx, sy, sz, d8 / 80.0, d10 / 60.0, d8 / 80.0);
        this.minN = this.minLimit.generate(this.minN, x, y, z, sx, sy, sz, d8, d10, d8);
        this.maxN = this.maxLimit.generate(this.maxN, x, y, z, sx, sy, sz, d8, d10, d8);
        let i12 = 0, i13 = 0;
        const shape = new Float64Array(sy);
        for (let j = 0; j < sy; j++) {
            shape[j] = Math.cos((j * 3.141592653589793 * 6.0) / sy) * 2.0;
            let d = j;
            if (j > ((sy / 2) | 0)) d = sy - 1 - j;
            if (d < 4.0) {
                d = 4.0 - d;
                shape[j] -= d * d * d * 10.0;
            }
        }
        for (let i = 0; i < sx; i++) {
            for (let k = 0; k < sz; k++) {
                let sc = (this.scaleN[i13] + 256.0) / 512.0;
                if (sc > 1.0) sc = 1.0;
                const d19 = 0.0;
                let dp = this.depthN[i13] / 8000.0;
                if (dp < 0.0) dp = -dp;
                dp = dp * 3.0 - 3.0;
                if (dp < 0.0) {
                    dp /= 2.0;
                    if (dp < -1.0) dp = -1.0;
                    dp /= 1.4;
                    dp /= 2.0;
                    sc = 0.0;
                } else {
                    if (dp > 1.0) dp = 1.0;
                    dp /= 6.0;
                }
                sc += 0.5;
                dp = (dp * sy) / 16.0;
                i13++;
                for (let j = 0; j < sy; j++) {
                    let val = 0.0;
                    const off = shape[j];
                    const lo = this.minN[i12] / 512.0;
                    const hi = this.maxN[i12] / 512.0;
                    const mix = (this.mainN[i12] / 10.0 + 1.0) / 2.0;
                    if (mix < 0.0) val = lo;
                    else if (mix > 1.0) val = hi;
                    else val = lo + (hi - lo) * mix;
                    val -= off;
                    if (j > sy - 4) {
                        const fade = f((j - (sy - 4)) / 3.0);
                        val = val * (1.0 - fade) + -10.0 * fade;
                    }
                    if (j < d19) {
                        let fade = (d19 - j) / 4.0;
                        if (fade < 0.0) fade = 0.0;
                        if (fade > 1.0) fade = 1.0;
                        val = val * (1.0 - fade) + -10.0 * fade;
                    }
                    out[i12] = val;
                    i12++;
                }
            }
        }
        return out;
    }

    // qn.b(int, int, byte[])
    replaceBlocks(cx, cz, blocks) {
        const sea = 64;
        const d5 = 0.03125;
        const r = this.rand;
        this.sandNoise = this.surface.generate(this.sandNoise, cx * 16, cz * 16, 0.0, 16, 16, 1, d5, d5, 1.0);
        this.gravelNoise = this.surface.generate(this.gravelNoise, cx * 16, 109.0134, cz * 16, 16, 1, 16, d5, 1.0, d5);
        this.depthNoise = this.stoneDepth.generate(this.depthNoise, cx * 16, cz * 16, 0.0, 16, 16, 1, d5 * 2.0, d5 * 2.0, d5 * 2.0);
        for (let a = 0; a < 16; a++) {
            for (let b = 0; b < 16; b++) {
                const soul = this.sandNoise[a + b * 16] + r.nextDouble() * 0.2 > 0.0;
                const gravel = this.gravelNoise[a + b * 16] + r.nextDouble() * 0.2 > 0.0;
                const depth = (this.depthNoise[a + b * 16] / 3.0 + 3.0 + r.nextDouble() * 0.25) | 0;
                let run = -1;
                let top = B.netherrack;
                let filler = B.netherrack;
                for (let y = 127; y >= 0; y--) {
                    const i = (b * 16 + a) * 128 + y;
                    if (y >= 127 - r.nextInt(5)) {
                        blocks[i] = B.bedrock;
                        continue;
                    }
                    if (y <= 0 + r.nextInt(5)) {
                        blocks[i] = B.bedrock;
                        continue;
                    }
                    const id = blocks[i];
                    if (id === 0) {
                        run = -1;
                        continue;
                    }
                    if (id !== B.netherrack) continue;
                    if (run === -1) {
                        if (depth <= 0) {
                            top = 0;
                            filler = B.netherrack;
                        } else if (y >= sea - 4 && y <= sea + 1) {
                            top = B.netherrack;
                            filler = B.netherrack;
                            if (gravel) top = B.gravel;
                            if (gravel) filler = B.netherrack;
                            if (soul) top = B.soulSand;
                            if (soul) filler = B.soulSand;
                        }
                        if (y < sea && top === 0) top = B.lava;
                        run = depth;
                        if (y >= sea - 1) blocks[i] = top;
                        else blocks[i] = filler;
                    } else if (run > 0) {
                        run--;
                        blocks[i] = filler;
                    }
                }
            }
        }
    }

    // qn.a(cl, x, z)
    populate(w, cx, cz) {
        w.fallInstantly = true;
        const r = this.rand;
        const x = cx * 16, z = cz * 16;
        for (let i = 0; i < 8; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(120) + 4, pz = z + r.nextInt(16) + 8;
            hellLava(w, r, px, py, pz, B.lavaFlowing);
        }
        let n = r.nextInt(r.nextInt(10) + 1) + 1;
        for (let i = 0; i < n; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(120) + 4, pz = z + r.nextInt(16) + 8;
            fire(w, r, px, py, pz);
        }
        n = r.nextInt(r.nextInt(10) + 1);
        for (let i = 0; i < n; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(120) + 4, pz = z + r.nextInt(16) + 8;
            glowstone(w, r, px, py, pz);
        }
        for (let i = 0; i < 10; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            glowstone(w, r, px, py, pz);
        }
        if (r.nextInt(1) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            flowers(w, r, px, py, pz, B.brownMushroom);
        }
        if (r.nextInt(1) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            flowers(w, r, px, py, pz, B.redMushroom);
        }
        w.fallInstantly = false;
    }
}
