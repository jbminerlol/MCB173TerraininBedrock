// ChunkProviderGenerate (yf) and MapGenCaves (sq) from b1.7.3.

import { JavaRandom, lmul } from './random.js';
import { Octaves } from './noise.js';
import { BIOME, WorldChunkManager } from './biomes.js';
import { sin, cos, floorD } from './mathhelper.js';
import { MAT, MAT_BLOCKS_MOVEMENT } from './blockdata.js';
import { B } from './behaviour.js';
import * as F from './features.js';

const f = Math.fround;
const PI_F = f(3.1415927);
const HALF_PI_F = f(1.5707964);

export class Caves {
    constructor() {
        this.range = 8;
        this.rand = new JavaRandom(0n);
    }

    // fv.a(cl, fd, x, z, blocks)
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

    // sq.a(fd, x, z, cx, cz, blocks)
    recursiveGenerate(x, z, cx, cz, blocks) {
        const r = this.rand;
        let n = r.nextInt(r.nextInt(r.nextInt(40) + 1) + 1);
        if (r.nextInt(15) !== 0) n = 0;
        for (let i = 0; i < n; i++) {
            const px = x * 16 + r.nextInt(16);
            const py = r.nextInt(r.nextInt(120) + 8);
            const pz = z * 16 + r.nextInt(16);
            let tunnels = 1;
            if (r.nextInt(4) === 0) {
                this.room(cx, cz, blocks, px, py, pz);
                tunnels += r.nextInt(4);
            }
            for (let j = 0; j < tunnels; j++) {
                const yaw = f(f(r.nextFloat() * PI_F) * 2.0);
                const pitch = f(f(f(r.nextFloat() - 0.5) * 2.0) / 8.0);
                const width = f(f(r.nextFloat() * 2.0) + r.nextFloat());
                this.tunnel(cx, cz, blocks, px, py, pz, width, yaw, pitch, 0, 0, 1.0);
            }
        }
    }

    // sq.a(int, int, byte[], double, double, double)
    room(cx, cz, blocks, x, y, z) {
        this.tunnel(cx, cz, blocks, x, y, z, f(1.0 + f(this.rand.nextFloat() * 6.0)), 0.0, 0.0, -1, -1, 0.5);
    }

    // sq.a(int, int, byte[], double x, y, z, float width, yaw, pitch, int step, int steps, double vScale)
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
            let water = false;
            for (let bx = x0; !water && bx < x1; bx++) {
                for (let bz = z0; !water && bz < z1; bz++) {
                    for (let by = y1 + 1; !water && by >= y0 - 1; by--) {
                        const i = (bx * 16 + bz) * 128 + by;
                        if (by >= 0 && by < 128) {
                            if (blocks[i] === B.waterFlowing || blocks[i] === B.water) water = true;
                            if (by !== y0 - 1 && bx !== x0 && bx !== x1 - 1 && bz !== z0 && bz !== z1 - 1) by = y0;
                        }
                    }
                }
            }
            if (water) continue;
            for (let bx = x0; bx < x1; bx++) {
                const ex = (bx + cx * 16 + 0.5 - x) / hr;
                for (let bz = z0; bz < z1; bz++) {
                    const ez = (bz + cz * 16 + 0.5 - z) / hr;
                    let i = (bx * 16 + bz) * 128 + y1;
                    let grass = false;
                    if (ex * ex + ez * ez < 1.0) {
                        for (let by = y1 - 1; by >= y0; by--) {
                            const ey = (by + 0.5 - y) / vr;
                            if (ey > -0.7 && ex * ex + ey * ey + ez * ez < 1.0) {
                                const id = blocks[i];
                                if (id === B.grass) grass = true;
                                if (id === B.stone || id === B.dirt || id === B.grass) {
                                    if (by < 10) {
                                        blocks[i] = B.lavaFlowing;
                                    } else {
                                        blocks[i] = 0;
                                        if (grass && blocks[i - 1] === B.dirt) blocks[i - 1] = B.grass;
                                    }
                                }
                            }
                            i--;
                        }
                    }
                }
            }
            if (isRoom) break;
        }
    }
}

const TREE_FEATURES = {
    tree: F.tree,
    birch: F.birch,
    taiga1: F.taiga1,
    taiga2: F.taiga2,
    bigtree: F.bigTree,
};

export class Overworld {
    constructor(seed) {
        this.seed = BigInt.asIntN(64, BigInt(seed));
        const r = new JavaRandom(this.seed);
        this.rand = r;                          // yf.j
        this.minLimit = new Octaves(r, 16);     // k
        this.maxLimit = new Octaves(r, 16);     // l
        this.main = new Octaves(r, 8);          // m
        this.surface = new Octaves(r, 4);       // n (sand / gravel)
        this.stoneDepth = new Octaves(r, 4);    // o
        this.scale = new Octaves(r, 10);        // a
        this.depth = new Octaves(r, 16);        // b
        this.treeNoise = new Octaves(r, 8);     // c
        this.caves = new Caves();
        this.biomeSource = new WorldChunkManager(this.seed);
        this.field = null;                      // q
        this.sandNoise = new Float64Array(256); // r
        this.gravelNoise = new Float64Array(256); // s
        this.depthNoise = new Float64Array(256);  // t
        this.biomes = null;                       // v
        this.mainN = null;                        // d
        this.minN = null;                         // e
        this.maxN = null;                         // f
        this.scaleN = null;                       // g
        this.depthN = null;                       // h
        this.temps = null;                        // w
    }

    // yf.b(x, z): raw terrain, surface and caves
    provideChunk(world, cx, cz) {
        this.rand.setSeed(lmul(cx, 341873128712n) + lmul(cz, 132897987541n));
        const blocks = new Uint8Array(32768);
        this.biomes = this.biomeSource.loadBlockGeneratorData(this.biomes, cx * 16, cz * 16, 16, 16);
        const temps = this.biomeSource.temperature;
        this.generateTerrain(cx, cz, blocks, temps);
        this.replaceBlocksForBiome(cx, cz, blocks, this.biomes);
        this.caves.generate(this.seed, cx, cz, blocks);
        return blocks;
    }

    // yf.a(int, int, byte[], kd[], double[])
    generateTerrain(cx, cz, blocks, temps) {
        const n = 4, sea = 64, sx = n + 1, sy = 17, sz = n + 1;
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
                        const s2 = 0.25;
                        let e = a, g = b;
                        const de = (c - a) * s2;
                        const dg = (d - b) * s2;
                        for (let m = 0; m < 4; m++) {
                            let idx = ((m + i * 4) << 11) | ((0 + k * 4) << 7) | (j * 8 + l);
                            const stride = 128;
                            const s3 = 0.25;
                            let v = e;
                            const dv = (g - e) * s3;
                            for (let o = 0; o < 4; o++) {
                                const t = temps[(i * 4 + m) * 16 + (k * 4 + o)];
                                let id = 0;
                                const y = j * 8 + l;
                                if (y < sea) {
                                    if (t < 0.5 && y >= sea - 1) id = B.ice;
                                    else id = B.water;
                                }
                                if (v > 0.0) id = B.stone;
                                blocks[idx] = id;
                                idx += stride;
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

    // yf.a(double[], int, int, int, int, int, int)
    densityField(out, x, y, z, sx, sy, sz) {
        if (out === null) out = new Float64Array(sx * sy * sz);
        const d8 = 684.412, d10 = 684.412;
        const temp = this.biomeSource.temperature;
        const hum = this.biomeSource.humidity;
        this.scaleN = this.scale.generate2(this.scaleN, x, z, sx, sz, 1.121, 1.121);
        this.depthN = this.depth.generate2(this.depthN, x, z, sx, sz, 200.0, 200.0);
        this.mainN = this.main.generate(this.mainN, x, y, z, sx, sy, sz, d8 / 80.0, d10 / 160.0, d8 / 80.0);
        this.minN = this.minLimit.generate(this.minN, x, y, z, sx, sy, sz, d8, d10, d8);
        this.maxN = this.maxLimit.generate(this.maxN, x, y, z, sx, sy, sz, d8, d10, d8);
        let i14 = 0, i15 = 0;
        const step = (16 / sx) | 0;
        for (let i = 0; i < sx; i++) {
            const bx = i * step + ((step / 2) | 0);
            for (let k = 0; k < sz; k++) {
                const bz = k * step + ((step / 2) | 0);
                const t = temp[bx * 16 + bz];
                const h = hum[bx * 16 + bz] * t;
                let v = 1.0 - h;
                v *= v;
                v *= v;
                v = 1.0 - v;
                let sc = (this.scaleN[i15] + 256.0) / 512.0;
                sc *= v;
                if (sc > 1.0) sc = 1.0;
                let dp = this.depthN[i15] / 8000.0;
                if (dp < 0.0) dp = -dp * 0.3;
                dp = dp * 3.0 - 2.0;
                if (dp < 0.0) {
                    dp /= 2.0;
                    if (dp < -1.0) dp = -1.0;
                    dp /= 1.4;
                    dp /= 2.0;
                    sc = 0.0;
                } else {
                    if (dp > 1.0) dp = 1.0;
                    dp /= 8.0;
                }
                if (sc < 0.0) sc = 0.0;
                sc += 0.5;
                dp = (dp * sy) / 16.0;
                const centre = sy / 2.0 + dp * 4.0;
                i15++;
                for (let j = 0; j < sy; j++) {
                    let val = 0.0;
                    let off = ((j - centre) * 12.0) / sc;
                    if (off < 0.0) off *= 4.0;
                    const lo = this.minN[i14] / 512.0;
                    const hi = this.maxN[i14] / 512.0;
                    const mix = (this.mainN[i14] / 10.0 + 1.0) / 2.0;
                    if (mix < 0.0) val = lo;
                    else if (mix > 1.0) val = hi;
                    else val = lo + (hi - lo) * mix;
                    val -= off;
                    if (j > sy - 4) {
                        const fade = f((j - (sy - 4)) / 3.0);
                        val = val * (1.0 - fade) + -10.0 * fade;
                    }
                    out[i14] = val;
                    i14++;
                }
            }
        }
        return out;
    }

    // yf.a(int, int, byte[], kd[])
    replaceBlocksForBiome(cx, cz, blocks, biomes) {
        const sea = 64;
        const d6 = 0.03125;
        const r = this.rand;
        this.sandNoise = this.surface.generate(this.sandNoise, cx * 16, cz * 16, 0.0, 16, 16, 1, d6, d6, 1.0);
        this.gravelNoise = this.surface.generate(this.gravelNoise, cx * 16, 109.0134, cz * 16, 16, 1, 16, d6, 1.0, d6);
        this.depthNoise = this.stoneDepth.generate(this.depthNoise, cx * 16, cz * 16, 0.0, 16, 16, 1, d6 * 2.0, d6 * 2.0, d6 * 2.0);
        for (let a = 0; a < 16; a++) {
            for (let b = 0; b < 16; b++) {
                const bio = biomes[a + b * 16];
                const sand = this.sandNoise[a + b * 16] + r.nextDouble() * 0.2 > 0.0;
                const gravel = this.gravelNoise[a + b * 16] + r.nextDouble() * 0.2 > 3.0;
                const depth = (this.depthNoise[a + b * 16] / 3.0 + 3.0 + r.nextDouble() * 0.25) | 0;
                let run = -1;
                let top = bio.top;
                let filler = bio.filler;
                for (let y = 127; y >= 0; y--) {
                    const i = (b * 16 + a) * 128 + y;
                    if (y <= 0 + r.nextInt(5)) {
                        blocks[i] = B.bedrock;
                        continue;
                    }
                    const id = blocks[i];
                    if (id === 0) {
                        run = -1;
                        continue;
                    }
                    if (id !== B.stone) continue;
                    if (run === -1) {
                        if (depth <= 0) {
                            top = 0;
                            filler = B.stone;
                        } else if (y >= sea - 4 && y <= sea + 1) {
                            top = bio.top;
                            filler = bio.filler;
                            if (gravel) top = 0;
                            if (gravel) filler = B.gravel;
                            if (sand) top = B.sand;
                            if (sand) filler = B.sand;
                        }
                        if (y < sea && top === 0) top = B.water;
                        run = depth;
                        if (y >= sea - 1) blocks[i] = top;
                        else blocks[i] = filler;
                    } else if (run > 0) {
                        run--;
                        blocks[i] = filler;
                        if (run === 0 && filler === B.sand) {
                            run = r.nextInt(4);
                            filler = B.sandstone;
                        }
                    }
                }
            }
        }
    }

    // yf.a(cl, x, z)
    populate(w, cx, cz) {
        w.fallInstantly = true;
        const r = this.rand;
        const x = cx * 16, z = cz * 16;
        const bio = this.biomeSource.getBiomeGenAt(x + 16, z + 16);
        r.setSeed(this.seed);
        const a = (r.nextLong() / 2n) * 2n + 1n;
        const b = (r.nextLong() / 2n) * 2n + 1n;
        r.setSeed(BigInt.asIntN(64, (lmul(cx, a) + lmul(cz, b)) ^ this.seed));
        if (r.nextInt(4) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.lake(w, r, px, py, pz, B.water);
        }
        if (r.nextInt(8) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(r.nextInt(120) + 8), pz = z + r.nextInt(16) + 8;
            if (py < 64 || r.nextInt(10) === 0) F.lake(w, r, px, py, pz, B.lava);
        }
        for (let i = 0; i < 8; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.dungeon(w, r, px, py, pz);
        }
        for (let i = 0; i < 10; i++) {
            const px = x + r.nextInt(16), py = r.nextInt(128), pz = z + r.nextInt(16);
            F.clay(w, r, px, py, pz, 32);
        }
        const ore = (count, id, size, yRange) => {
            for (let i = 0; i < count; i++) {
                const px = x + r.nextInt(16), py = r.nextInt(yRange), pz = z + r.nextInt(16);
                F.minable(w, r, px, py, pz, id, size);
            }
        };
        ore(20, B.dirt, 32, 128);
        ore(10, B.gravel, 32, 128);
        ore(20, B.coalOre, 16, 128);
        ore(20, B.ironOre, 8, 64);
        ore(2, B.goldOre, 8, 32);
        ore(8, B.redstoneOre, 7, 16);
        ore(1, B.diamondOre, 7, 16);
        for (let i = 0; i < 1; i++) {
            const px = x + r.nextInt(16), py = r.nextInt(16) + r.nextInt(16), pz = z + r.nextInt(16);
            F.minable(w, r, px, py, pz, B.lapisOre, 6);
        }
        const d11 = 0.5;
        const base = ((this.treeNoise.value2(x * d11, z * d11) / 8.0 + r.nextDouble() * 4.0 + 4.0) / 3.0) | 0;
        let trees = 0;
        if (r.nextInt(10) === 0) trees++;
        if (bio === BIOME.forest) trees += base + 5;
        if (bio === BIOME.rainforest) trees += base + 5;
        if (bio === BIOME.seasonalForest) trees += base + 2;
        if (bio === BIOME.taiga) trees += base + 5;
        if (bio === BIOME.desert) trees -= 20;
        if (bio === BIOME.tundra) trees -= 20;
        if (bio === BIOME.plains) trees -= 20;
        for (let i = 0; i < trees; i++) {
            const px = x + r.nextInt(16) + 8, pz = z + r.nextInt(16) + 8;
            const kind = bio.trees(r);
            TREE_FEATURES[kind](w, r, px, w.getHeightValue(px, pz), pz);
        }
        let yellow = 0;
        if (bio === BIOME.forest) yellow = 2;
        if (bio === BIOME.seasonalForest) yellow = 4;
        if (bio === BIOME.taiga) yellow = 2;
        if (bio === BIOME.plains) yellow = 3;
        for (let i = 0; i < yellow; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.flowers(w, r, px, py, pz, B.dandelion);
        }
        let grass = 0;
        if (bio === BIOME.forest) grass = 2;
        if (bio === BIOME.rainforest) grass = 10;
        if (bio === BIOME.seasonalForest) grass = 2;
        if (bio === BIOME.taiga) grass = 1;
        if (bio === BIOME.plains) grass = 10;
        for (let i = 0; i < grass; i++) {
            let meta = 1;
            if (bio === BIOME.rainforest && r.nextInt(3) !== 0) meta = 2;
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.tallGrass(w, r, px, py, pz, B.tallGrass, meta);
        }
        const bushes = bio === BIOME.desert ? 2 : 0;
        for (let i = 0; i < bushes; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.deadBush(w, r, px, py, pz, B.deadBush);
        }
        if (r.nextInt(2) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.flowers(w, r, px, py, pz, B.rose);
        }
        if (r.nextInt(4) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.flowers(w, r, px, py, pz, B.brownMushroom);
        }
        if (r.nextInt(8) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.flowers(w, r, px, py, pz, B.redMushroom);
        }
        for (let i = 0; i < 10; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.reeds(w, r, px, py, pz);
        }
        if (r.nextInt(32) === 0) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.pumpkins(w, r, px, py, pz);
        }
        const cacti = bio === BIOME.desert ? 10 : 0;
        for (let i = 0; i < cacti; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(128), pz = z + r.nextInt(16) + 8;
            F.cactus(w, r, px, py, pz);
        }
        for (let i = 0; i < 50; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(r.nextInt(120) + 8), pz = z + r.nextInt(16) + 8;
            F.spring(w, r, px, py, pz, B.waterFlowing);
        }
        for (let i = 0; i < 20; i++) {
            const px = x + r.nextInt(16) + 8, py = r.nextInt(r.nextInt(r.nextInt(112) + 8) + 8), pz = z + r.nextInt(16) + 8;
            F.spring(w, r, px, py, pz, B.lavaFlowing);
        }
        this.temps = this.biomeSource.getTemperatures(this.temps, x + 8, z + 8, 16, 16);
        for (let bx = x + 8; bx < x + 8 + 16; bx++) {
            for (let bz = z + 8; bz < z + 8 + 16; bz++) {
                const lx = bx - (x + 8), lz = bz - (z + 8);
                const top = w.findTopSolidBlock(bx, bz);
                const t = this.temps[lx * 16 + lz] - ((top - 64) / 64.0) * 0.3;
                if (t < 0.5 && top > 0 && top < 128 && w.isAirBlock(bx, top, bz) &&
                    MAT_BLOCKS_MOVEMENT[w.getMaterial(bx, top - 1, bz)] && w.getMaterial(bx, top - 1, bz) !== MAT.ice)
                    w.setBlockWithNotify(bx, top, bz, B.snowLayer);
            }
        }
        w.fallInstantly = false;
    }
}
