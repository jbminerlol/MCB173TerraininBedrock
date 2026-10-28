// b1.7.3 WorldGenerator subclasses, ported from the bytecode (class names in comments).

import { sin, cos, floorD } from './mathhelper.js';
import { JavaRandom } from './random.js';
import { MAT, MAT_SOLID, MAT_LIQUID, OPAQUE_CUBE } from './blockdata.js';
import { B, behaviour, pumpkinCanPlace } from './behaviour.js';

const f = Math.fround;
const PI_F = f(3.1415927);

// WorldGenMinable (fl)
export function minable(w, r, x, y, z, ore, size) {
    const n = f(size);
    const a = r.nextFloat() * PI_F;
    const ang = f(a);
    const dx = f(f(sin(ang) * n) / 8.0);
    const dz = f(f(cos(ang) * n) / 8.0);
    const x0 = f(f(x + 8) + dx), x1 = f(f(x + 8) - dx);
    const z0 = f(f(z + 8) + dz), z1 = f(f(z + 8) - dz);
    const y0 = y + r.nextInt(3) + 2;
    const y1 = y + r.nextInt(3) + 2;
    for (let i = 0; i <= size; i++) {
        const cx = x0 + ((x1 - x0) * i) / size;
        const cy = y0 + ((y1 - y0) * i) / size;
        const cz = z0 + ((z1 - z0) * i) / size;
        const d26 = (r.nextDouble() * size) / 16.0;
        const s = f(sin(f(f(i * PI_F) / n)) + 1.0);
        const hr = s * d26 + 1.0;
        const vr = s * d26 + 1.0;
        const xa = floorD(cx - hr / 2.0), ya = floorD(cy - vr / 2.0), za = floorD(cz - hr / 2.0);
        const xb = floorD(cx + hr / 2.0), yb = floorD(cy + vr / 2.0), zb = floorD(cz + hr / 2.0);
        for (let bx = xa; bx <= xb; bx++) {
            const ex = (bx + 0.5 - cx) / (hr / 2.0);
            if (!(ex * ex < 1.0)) continue;
            for (let by = ya; by <= yb; by++) {
                const ey = (by + 0.5 - cy) / (vr / 2.0);
                if (!(ex * ex + ey * ey < 1.0)) continue;
                for (let bz = za; bz <= zb; bz++) {
                    const ez = (bz + 0.5 - cz) / (hr / 2.0);
                    if (ex * ex + ey * ey + ez * ez < 1.0 && w.getBlockId(bx, by, bz) === B.stone) w.setBlock(bx, by, bz, ore);
                }
            }
        }
    }
    return true;
}

// WorldGenClay (ms)
export function clay(w, r, x, y, z, size) {
    if (w.getMaterial(x, y, z) !== MAT.water) return false;
    const n = f(size);
    const ang = f(r.nextFloat() * PI_F);
    const dx = f(f(sin(ang) * n) / 8.0);
    const dz = f(f(cos(ang) * n) / 8.0);
    const x0 = f(f(x + 8) + dx), x1 = f(f(x + 8) - dx);
    const z0 = f(f(z + 8) + dz), z1 = f(f(z + 8) - dz);
    const y0 = y + r.nextInt(3) + 2;
    const y1 = y + r.nextInt(3) + 2;
    for (let i = 0; i <= size; i++) {
        const cx = x0 + ((x1 - x0) * i) / size;
        const cy = y0 + ((y1 - y0) * i) / size;
        const cz = z0 + ((z1 - z0) * i) / size;
        const d26 = (r.nextDouble() * size) / 16.0;
        const s = f(sin(f(f(i * PI_F) / n)) + 1.0);
        const hr = s * d26 + 1.0;
        const vr = s * d26 + 1.0;
        const xa = floorD(cx - hr / 2.0), xb = floorD(cx + hr / 2.0);
        const ya = floorD(cy - vr / 2.0), yb = floorD(cy + vr / 2.0);
        const za = floorD(cz - hr / 2.0), zb = floorD(cz + hr / 2.0);
        for (let bx = xa; bx <= xb; bx++)
            for (let by = ya; by <= yb; by++)
                for (let bz = za; bz <= zb; bz++) {
                    const ex = (bx + 0.5 - cx) / (hr / 2.0);
                    const ey = (by + 0.5 - cy) / (vr / 2.0);
                    const ez = (bz + 0.5 - cz) / (hr / 2.0);
                    if (ex * ex + ey * ey + ez * ez < 1.0 && w.getBlockId(bx, by, bz) === B.sand) w.setBlock(bx, by, bz, B.clay);
                }
    }
    return true;
}

// Space check shared by the small trees: every block of the column (radius 0 at the base, 1 in the
// trunk, 2 near the top) must be air or leaves inside 0..127.
function treeSpaceFree(w, x, y, z, height) {
    for (let yy = y; yy <= y + 1 + height; yy++) {
        let rad = 1;
        if (yy === y) rad = 0;
        if (yy >= y + 1 + height - 2) rad = 2;
        for (let xx = x - rad; xx <= x + rad; xx++)
            for (let zz = z - rad; zz <= z + rad; zz++) {
                if (yy >= 0 && yy < 128) {
                    const id = w.getBlockId(xx, yy, zz);
                    if (id !== 0 && id !== B.leaves) return false;
                } else {
                    return false;
                }
            }
    }
    return true;
}

// WorldGenTrees (yh) and WorldGenForest (k, birch)
function smallTree(w, r, x, y, z, height, meta) {
    if (y < 1 || y + height + 1 > 128) return false;
    if (!treeSpaceFree(w, x, y, z, height)) return false;
    const below = w.getBlockId(x, y - 1, z);
    if ((below !== B.grass && below !== B.dirt) || y >= 128 - height - 1) return false;
    w.setBlock(x, y - 1, z, B.dirt);
    for (let yy = y - 3 + height; yy <= y + height; yy++) {
        const dy = yy - (y + height);
        const rad = 1 - ((dy / 2) | 0);
        for (let xx = x - rad; xx <= x + rad; xx++) {
            const ddx = xx - x;
            for (let zz = z - rad; zz <= z + rad; zz++) {
                const ddz = zz - z;
                if (Math.abs(ddx) === rad && Math.abs(ddz) === rad) {
                    if (r.nextInt(2) === 0) continue;
                    if (dy === 0) continue;
                }
                if (!OPAQUE_CUBE[w.getBlockId(xx, yy, zz)]) {
                    if (meta < 0) w.setBlock(xx, yy, zz, B.leaves);
                    else w.setBlockAndMetadata(xx, yy, zz, B.leaves, meta);
                }
            }
        }
    }
    for (let i = 0; i < height; i++) {
        const id = w.getBlockId(x, y + i, z);
        if (id === 0 || id === B.leaves) {
            if (meta < 0) w.setBlock(x, y + i, z, B.log);
            else w.setBlockAndMetadata(x, y + i, z, B.log, meta);
        }
    }
    return true;
}

export function tree(w, r, x, y, z) {
    return smallTree(w, r, x, y, z, r.nextInt(3) + 4, -1);
}

export function birch(w, r, x, y, z) {
    return smallTree(w, r, x, y, z, r.nextInt(3) + 5, 2);
}

// WorldGenTaiga1 (pw): the tall thin spruce
export function taiga1(w, r, x, y, z) {
    const height = r.nextInt(5) + 7;
    const bare = height - r.nextInt(2) - 3;
    const leafy = height - bare;
    const maxRad = 1 + r.nextInt(leafy + 1);
    let ok = true;
    if (y < 1 || y + height + 1 > 128) return false;
    for (let yy = y; yy <= y + 1 + height && ok; yy++) {
        const rad = yy - y < bare ? 0 : maxRad;
        for (let xx = x - rad; xx <= x + rad && ok; xx++)
            for (let zz = z - rad; zz <= z + rad && ok; zz++) {
                if (yy >= 0 && yy < 128) {
                    const id = w.getBlockId(xx, yy, zz);
                    if (id !== 0 && id !== B.leaves) ok = false;
                } else {
                    ok = false;
                }
            }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if ((below !== B.grass && below !== B.dirt) || y >= 128 - height - 1) return false;
    w.setBlock(x, y - 1, z, B.dirt);
    let rad = 0;
    for (let yy = y + height; yy >= y + bare; yy--) {
        for (let xx = x - rad; xx <= x + rad; xx++) {
            const ddx = xx - x;
            for (let zz = z - rad; zz <= z + rad; zz++) {
                const ddz = zz - z;
                if (Math.abs(ddx) === rad && Math.abs(ddz) === rad && rad > 0) continue;
                if (!OPAQUE_CUBE[w.getBlockId(xx, yy, zz)]) w.setBlockAndMetadata(xx, yy, zz, B.leaves, 1);
            }
        }
        if (rad >= 1 && yy === y + bare + 1) rad--;
        else if (rad < maxRad) rad++;
    }
    for (let i = 0; i < height - 1; i++) {
        const id = w.getBlockId(x, y + i, z);
        if (id === 0 || id === B.leaves) w.setBlockAndMetadata(x, y + i, z, B.log, 1);
    }
    return true;
}

// WorldGenTaiga2 (ws): the layered spruce
export function taiga2(w, r, x, y, z) {
    const height = r.nextInt(4) + 6;
    const bare = 1 + r.nextInt(2);
    const leafy = height - bare;
    const maxRad = 2 + r.nextInt(2);
    let ok = true;
    if (y < 1 || y + height + 1 > 128) return false;
    for (let yy = y; yy <= y + 1 + height && ok; yy++) {
        const rad = yy - y < bare ? 0 : maxRad;
        for (let xx = x - rad; xx <= x + rad && ok; xx++)
            for (let zz = z - rad; zz <= z + rad && ok; zz++) {
                if (yy >= 0 && yy < 128) {
                    const id = w.getBlockId(xx, yy, zz);
                    if (id !== 0 && id !== B.leaves) ok = false;
                } else {
                    ok = false;
                }
            }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if ((below !== B.grass && below !== B.dirt) || y >= 128 - height - 1) return false;
    w.setBlock(x, y - 1, z, B.dirt);
    let rad = r.nextInt(2);
    let step = 1;
    let start = 0;
    for (let i = 0; i <= leafy; i++) {
        const yy = y + height - i;
        for (let xx = x - rad; xx <= x + rad; xx++) {
            const ddx = xx - x;
            for (let zz = z - rad; zz <= z + rad; zz++) {
                const ddz = zz - z;
                if (Math.abs(ddx) === rad && Math.abs(ddz) === rad && rad > 0) continue;
                if (!OPAQUE_CUBE[w.getBlockId(xx, yy, zz)]) w.setBlockAndMetadata(xx, yy, zz, B.leaves, 1);
            }
        }
        if (rad >= step) {
            rad = start;
            start = 1;
            step++;
            if (step > maxRad) step = maxRad;
        } else {
            rad++;
        }
    }
    const top = r.nextInt(3);
    for (let i = 0; i < height - top; i++) {
        const id = w.getBlockId(x, y + i, z);
        if (id === 0 || id === B.leaves) w.setBlockAndMetadata(x, y + i, z, B.log, 1);
    }
    return true;
}

// WorldGenBigTree (ih)
const OTHER = [2, 0, 0, 1, 2, 1];

export class BigTree {
    constructor() {
        this.rand = new JavaRandom(0n);
        this.base = [0, 0, 0];
        this.heightLimit = 0;
        this.height = 0;
        this.heightAttenuation = 0.618;
        this.branchSlope = 0.381;
        this.scaleWidth = 1.0;
        this.leafDensity = 1.0;
        this.trunkSize = 1;
        this.heightLimitLimit = 12;
        this.leafDistanceLimit = 4;
        this.leafNodes = null;
    }

    // ih.a(double, double, double)
    setScale(a, b, c) {
        this.heightLimitLimit = (a * 12.0) | 0;
        if (a > 0.5) this.leafDistanceLimit = 5;
        this.scaleWidth = b;
        this.leafDensity = c;
    }

    generate(w, r, x, y, z) {
        this.w = w;
        this.rand.setSeed(r.nextLong());
        this.base[0] = x;
        this.base[1] = y;
        this.base[2] = z;
        if (this.heightLimit === 0) this.heightLimit = 5 + this.rand.nextInt(this.heightLimitLimit);
        if (!this.validTreeLocation()) return false;
        this.generateLeafNodeList();
        this.generateLeaves();
        this.generateTrunk();
        this.generateLeafNodeBases();
        return true;
    }

    generateLeafNodeList() {
        const d = this.base;
        this.height = (this.heightLimit * this.heightAttenuation) | 0;
        if (this.height >= this.heightLimit) this.height = this.heightLimit - 1;
        const t = (this.leafDensity * this.heightLimit) / 13.0;
        let perLayer = (1.382 + t * t) | 0;
        if (perLayer < 1) perLayer = 1;
        const nodes = [];
        let y = d[1] + this.heightLimit - this.leafDistanceLimit;
        const trunkTop = d[1] + this.height;
        let rel = y - d[1];
        nodes.push([d[0], y, d[2], trunkTop]);
        y--;
        while (rel >= 0) {
            const size = this.layerSize(rel);
            if (size < 0.0) {
                y--;
                rel--;
                continue;
            }
            for (let i = 0; i < perLayer; i++) {
                const len = this.scaleWidth * (size * (this.rand.nextFloat() + 0.328));
                const ang = this.rand.nextFloat() * 2.0 * 3.14159;
                const nx = floorD(len * Math.sin(ang) + d[0] + 0.5);
                const nz = floorD(len * Math.cos(ang) + d[2] + 0.5);
                const a17 = [nx, y, nz];
                const a18 = [nx, y + this.leafDistanceLimit, nz];
                if (this.checkBlockLine(a17, a18) === -1) {
                    const a19 = [d[0], d[1], d[2]];
                    const ddx = Math.abs(d[0] - a17[0]), ddz = Math.abs(d[2] - a17[2]);
                    const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                    const drop = dist * this.branchSlope;
                    if (a17[1] - drop > trunkTop) a19[1] = trunkTop;
                    else a19[1] = (a17[1] - drop) | 0;
                    if (this.checkBlockLine(a19, a17) === -1) nodes.push([nx, y, nz, a19[1]]);
                }
            }
            y--;
            rel--;
        }
        this.leafNodes = nodes;
    }

    // ih.a(int x, int y, int z, float radius, byte axis, int block)
    genTreeLayer(x, y, z, radius, axis, block) {
        const r = (radius + 0.618) | 0;
        const i8 = OTHER[axis], i9 = OTHER[axis + 3];
        const c = [x, y, z];
        const p = [0, 0, 0];
        p[axis] = c[axis];
        for (let a = -r; a <= r; a++) {
            p[i8] = c[i8] + a;
            for (let b = -r; b <= r; b++) {
                const da = Math.abs(a) + 0.5, db = Math.abs(b) + 0.5;
                if (Math.sqrt(da * da + db * db) > radius) continue;
                p[i9] = c[i9] + b;
                const id = this.w.getBlockId(p[0], p[1], p[2]);
                if (id !== 0 && id !== B.leaves) continue;
                this.w.setBlock(p[0], p[1], p[2], block);
            }
        }
    }

    // ih.a(int): float
    layerSize(y) {
        if (y < this.heightLimit * 0.3) return -1.618;
        const half = f(f(this.heightLimit) / 2.0);
        const off = f(half - y);
        let v;
        if (off === 0.0) v = half;
        else if (Math.abs(off) >= half) v = 0.0;
        else v = f(Math.sqrt(half * half - off * off));
        return f(v * 0.5);
    }

    // ih.b(int): float
    leafSize(y) {
        if (y < 0 || y >= this.leafDistanceLimit) return -1.0;
        return y === 0 || y === this.leafDistanceLimit - 1 ? 2.0 : 3.0;
    }

    generateLeafNode(x, y, z) {
        for (let yy = y; yy < y + this.leafDistanceLimit; yy++) this.genTreeLayer(x, yy, z, this.leafSize(yy - y), 1, B.leaves);
    }

    generateLeaves() {
        for (const n of this.leafNodes) this.generateLeafNode(n[0], n[1], n[2]);
    }

    // ih.a(int[], int[], int)
    placeBlockLine(a, b, block) {
        const delta = [0, 0, 0];
        let major = 0;
        for (let i = 0; i < 3; i++) {
            delta[i] = b[i] - a[i];
            if (Math.abs(delta[i]) > Math.abs(delta[major])) major = i;
        }
        if (delta[major] === 0) return;
        const i7 = OTHER[major], i8 = OTHER[major + 3];
        const dir = delta[major] > 0 ? 1 : -1;
        const r1 = delta[i7] / delta[major];
        const r2 = delta[i8] / delta[major];
        const p = [0, 0, 0];
        const end = delta[major] + dir;
        for (let i = 0; i !== end; i += dir) {
            p[major] = floorD(a[major] + i + 0.5);
            p[i7] = floorD(a[i7] + i * r1 + 0.5);
            p[i8] = floorD(a[i8] + i * r2 + 0.5);
            this.w.setBlock(p[0], p[1], p[2], block);
        }
    }

    generateTrunk() {
        const d = this.base;
        const a5 = [d[0], d[1], d[2]];
        const a6 = [d[0], d[1] + this.height, d[2]];
        this.placeBlockLine(a5, a6, B.log);
        if (this.trunkSize === 2) {
            a5[0]++;
            a6[0]++;
            this.placeBlockLine(a5, a6, B.log);
            a5[2]++;
            a6[2]++;
            this.placeBlockLine(a5, a6, B.log);
            a5[0]--;
            a6[0]--;
            this.placeBlockLine(a5, a6, B.log);
        }
    }

    generateLeafNodeBases() {
        const d = this.base;
        const a3 = [d[0], d[1], d[2]];
        for (const n of this.leafNodes) {
            const a5 = [n[0], n[1], n[2]];
            a3[1] = n[3];
            const rel = a3[1] - d[1];
            if (rel >= this.heightLimit * 0.2) this.placeBlockLine(a3, a5, B.log);
        }
    }

    // ih.a(int[], int[]): -1 when clear, else the distance to the first obstruction
    checkBlockLine(a, b) {
        const delta = [0, 0, 0];
        let major = 0;
        for (let i = 0; i < 3; i++) {
            delta[i] = b[i] - a[i];
            if (Math.abs(delta[i]) > Math.abs(delta[major])) major = i;
        }
        if (delta[major] === 0) return -1;
        const i6 = OTHER[major], i7 = OTHER[major + 3];
        const dir = delta[major] > 0 ? 1 : -1;
        const r1 = delta[i6] / delta[major];
        const r2 = delta[i7] / delta[major];
        const p = [0, 0, 0];
        let i = 0;
        const end = delta[major] + dir;
        for (; i !== end; i += dir) {
            p[major] = a[major] + i;
            p[i6] = floorD(a[i6] + i * r1);
            p[i7] = floorD(a[i7] + i * r2);
            const id = this.w.getBlockId(p[0], p[1], p[2]);
            if (id !== 0 && id !== B.leaves) break;
        }
        return i === end ? -1 : Math.abs(i);
    }

    validTreeLocation() {
        const d = this.base;
        const top = [d[0], d[1] + this.heightLimit - 1, d[2]];
        const below = this.w.getBlockId(d[0], d[1] - 1, d[2]);
        if (below !== B.grass && below !== B.dirt) return false;
        const n = this.checkBlockLine([d[0], d[1], d[2]], top);
        if (n === -1) return true;
        if (n < 6) return false;
        this.heightLimit = n;
        return true;
    }
}

export function bigTree(w, r, x, y, z) {
    const t = new BigTree();
    t.setScale(1.0, 1.0, 1.0);
    return t.generate(w, r, x, y, z);
}

export const TREES = { tree, birch, taiga1, taiga2 };

// WorldGenLakes (dj)
export function lake(w, r, x, y, z, liquid) {
    x -= 8;
    z -= 8;
    while (y > 0 && w.isAirBlock(x, y, z)) y--;
    y -= 4;
    const shape = new Uint8Array(2048);
    const blobs = r.nextInt(4) + 4;
    for (let i = 0; i < blobs; i++) {
        const sx = r.nextDouble() * 6.0 + 3.0;
        const sy = r.nextDouble() * 4.0 + 2.0;
        const sz = r.nextDouble() * 6.0 + 3.0;
        const px = r.nextDouble() * (16.0 - sx - 2.0) + 1.0 + sx / 2.0;
        const py = r.nextDouble() * (8.0 - sy - 4.0) + 2.0 + sy / 2.0;
        const pz = r.nextDouble() * (16.0 - sz - 2.0) + 1.0 + sz / 2.0;
        for (let a = 1; a < 15; a++)
            for (let c = 1; c < 15; c++)
                for (let b = 1; b < 7; b++) {
                    const dx = (a - px) / (sx / 2.0);
                    const dy = (b - py) / (sy / 2.0);
                    const dz = (c - pz) / (sz / 2.0);
                    if (dx * dx + dy * dy + dz * dz < 1.0) shape[(a * 16 + c) * 8 + b] = 1;
                }
    }
    const at = (a, c, b) => shape[(a * 16 + c) * 8 + b] === 1;
    const border = (a, c, b) => !at(a, c, b) && ((a < 15 && at(a + 1, c, b)) || (a > 0 && at(a - 1, c, b)) ||
        (c < 15 && at(a, c + 1, b)) || (c > 0 && at(a, c - 1, b)) || (b < 7 && at(a, c, b + 1)) || (b > 0 && at(a, c, b - 1)));
    for (let a = 0; a < 16; a++)
        for (let c = 0; c < 16; c++)
            for (let b = 0; b < 8; b++) {
                if (!border(a, c, b)) continue;
                const m = w.getMaterial(x + a, y + b, z + c);
                if (b >= 4 && MAT_LIQUID[m]) return false;
                if (b < 4 && !MAT_SOLID[m] && w.getBlockId(x + a, y + b, z + c) !== liquid) return false;
            }
    for (let a = 0; a < 16; a++)
        for (let c = 0; c < 16; c++)
            for (let b = 0; b < 8; b++) if (at(a, c, b)) w.setBlock(x + a, y + b, z + c, b >= 4 ? 0 : liquid);
    for (let a = 0; a < 16; a++)
        for (let c = 0; c < 16; c++)
            for (let b = 4; b < 8; b++) {
                if (at(a, c, b) && w.getBlockId(x + a, y + b - 1, z + c) === B.dirt && w.getSkyLight(x + a, y + b, z + c) > 0)
                    w.setBlock(x + a, y + b - 1, z + c, B.grass);
            }
    if (liquid === B.lava || liquid === B.lavaFlowing) {
        for (let a = 0; a < 16; a++)
            for (let c = 0; c < 16; c++)
                for (let b = 0; b < 8; b++) {
                    if (!border(a, c, b)) continue;
                    if (b >= 4 && r.nextInt(2) === 0) continue;
                    if (MAT_SOLID[w.getMaterial(x + a, y + b, z + c)]) w.setBlock(x + a, y + b, z + c, B.stone);
                }
    }
    return true;
}

// WorldGenDungeons (er)
const ITEM = { saddle: 329, ironIngot: 265, bread: 297, wheat: 296, gunpowder: 289, string: 287, bucket: 325,
    goldenApple: 322, redstone: 331, record13: 2256, dye: 351 };

function dungeonItem(r) {
    const i = r.nextInt(11);
    if (i === 0) return [ITEM.saddle, 1, 0];
    if (i === 1) return [ITEM.ironIngot, r.nextInt(4) + 1, 0];
    if (i === 2) return [ITEM.bread, 1, 0];
    if (i === 3) return [ITEM.wheat, r.nextInt(4) + 1, 0];
    if (i === 4) return [ITEM.gunpowder, r.nextInt(4) + 1, 0];
    if (i === 5) return [ITEM.string, r.nextInt(4) + 1, 0];
    if (i === 6) return [ITEM.bucket, 1, 0];
    if (i === 7 && r.nextInt(100) === 0) return [ITEM.goldenApple, 1, 0];
    if (i === 8 && r.nextInt(2) === 0) return [ITEM.redstone, r.nextInt(4) + 1, 0];
    if (i === 9 && r.nextInt(10) === 0) return [ITEM.record13 + r.nextInt(2), 1, 0];
    if (i === 10) return [ITEM.dye, 1, 3];
    return null;
}

function dungeonMob(r) {
    const i = r.nextInt(4);
    if (i === 0) return 'Skeleton';
    if (i === 1 || i === 2) return 'Zombie';
    if (i === 3) return 'Spider';
    return '';
}

export function dungeon(w, r, x, y, z) {
    const h = 3;
    const rx = r.nextInt(2) + 2;
    const rz = r.nextInt(2) + 2;
    let holes = 0;
    for (let a = x - rx - 1; a <= x + rx + 1; a++)
        for (let b = y - 1; b <= y + h + 1; b++)
            for (let c = z - rz - 1; c <= z + rz + 1; c++) {
                const m = w.getMaterial(a, b, c);
                if (b === y - 1 && !MAT_SOLID[m]) return false;
                if (b === y + h + 1 && !MAT_SOLID[m]) return false;
                if ((a === x - rx - 1 || a === x + rx + 1 || c === z - rz - 1 || c === z + rz + 1) && b === y &&
                    w.isAirBlock(a, b, c) && w.isAirBlock(a, b + 1, c)) holes++;
            }
    if (holes < 1 || holes > 5) return false;
    for (let a = x - rx - 1; a <= x + rx + 1; a++)
        for (let b = y + h; b >= y - 1; b--)
            for (let c = z - rz - 1; c <= z + rz + 1; c++) {
                if (a !== x - rx - 1 && b !== y - 1 && c !== z - rz - 1 && a !== x + rx + 1 && b !== y + h + 1 && c !== z + rz + 1) {
                    w.setBlockWithNotify(a, b, c, 0);
                } else if (b >= 0 && !MAT_SOLID[w.getMaterial(a, b - 1, c)]) {
                    w.setBlockWithNotify(a, b, c, 0);
                } else if (MAT_SOLID[w.getMaterial(a, b, c)]) {
                    if (b === y - 1 && r.nextInt(4) !== 0) w.setBlockWithNotify(a, b, c, B.mossyCobblestone);
                    else w.setBlockWithNotify(a, b, c, B.cobblestone);
                }
            }
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) {
            const a = x + r.nextInt(rx * 2 + 1) - rx;
            const c = z + r.nextInt(rz * 2 + 1) - rz;
            if (!w.isAirBlock(a, y, c)) continue;
            let walls = 0;
            if (MAT_SOLID[w.getMaterial(a - 1, y, c)]) walls++;
            if (MAT_SOLID[w.getMaterial(a + 1, y, c)]) walls++;
            if (MAT_SOLID[w.getMaterial(a, y, c - 1)]) walls++;
            if (MAT_SOLID[w.getMaterial(a, y, c + 1)]) walls++;
            if (walls !== 1) continue;
            w.setBlockWithNotify(a, y, c, B.chest);
            const chest = w.getTile(a, y, c);
            for (let k = 0; k < 8; k++) {
                const item = dungeonItem(r);
                if (item) chest.items[r.nextInt(27)] = item;
            }
            break;
        }
    }
    w.setBlockWithNotify(x, y, z, B.spawner);
    w.getTile(x, y, z).mob = dungeonMob(r);
    return true;
}

// WorldGenFlowers (be): also mushrooms
export function flowers(w, r, x, y, z, id) {
    const stay = behaviour[id].canStay;
    for (let i = 0; i < 64; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (w.isAirBlock(a, b, c) && stay(w, a, b, c)) w.setBlock(a, b, c, id);
    }
    return true;
}

function descend(w, x, y, z) {
    for (;;) {
        const id = w.getBlockId(x, y, z);
        if ((id === 0 || id === B.leaves) && y > 0) y--;
        else return y;
    }
}

// WorldGenTallGrass (ap)
export function tallGrass(w, r, x, y, z, id, meta) {
    y = descend(w, x, y, z);
    const stay = behaviour[id].canStay;
    for (let i = 0; i < 128; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (w.isAirBlock(a, b, c) && stay(w, a, b, c)) w.setBlockAndMetadata(a, b, c, id, meta);
    }
    return true;
}

// WorldGenDeadBush (kt)
export function deadBush(w, r, x, y, z, id) {
    y = descend(w, x, y, z);
    const stay = behaviour[id].canStay;
    for (let i = 0; i < 4; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (w.isAirBlock(a, b, c) && stay(w, a, b, c)) w.setBlock(a, b, c, id);
    }
    return true;
}

// WorldGenReed (ir)
export function reeds(w, r, x, y, z) {
    const stay = behaviour[B.reed].canStay;
    for (let i = 0; i < 20; i++) {
        const a = x + r.nextInt(4) - r.nextInt(4);
        const b = y;
        const c = z + r.nextInt(4) - r.nextInt(4);
        if (!w.isAirBlock(a, b, c)) continue;
        if (w.getMaterial(a - 1, b - 1, c) === MAT.water || w.getMaterial(a + 1, b - 1, c) === MAT.water ||
            w.getMaterial(a, b - 1, c - 1) === MAT.water || w.getMaterial(a, b - 1, c + 1) === MAT.water) {
            const n = 2 + r.nextInt(r.nextInt(3) + 1);
            for (let k = 0; k < n; k++) if (stay(w, a, b + k, c)) w.setBlock(a, b + k, c, B.reed);
        }
    }
    return true;
}

// WorldGenPumpkin (wx)
export function pumpkins(w, r, x, y, z) {
    for (let i = 0; i < 64; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (w.isAirBlock(a, b, c) && w.getBlockId(a, b - 1, c) === B.grass && pumpkinCanPlace(w, a, b, c))
            w.setBlockAndMetadata(a, b, c, B.pumpkin, r.nextInt(4));
    }
    return true;
}

// WorldGenCactus (fx)
export function cactus(w, r, x, y, z) {
    const stay = behaviour[B.cactus].canStay;
    for (let i = 0; i < 10; i++) {
        const a = x + r.nextInt(8) - r.nextInt(8);
        const b = y + r.nextInt(4) - r.nextInt(4);
        const c = z + r.nextInt(8) - r.nextInt(8);
        if (!w.isAirBlock(a, b, c)) continue;
        const n = 1 + r.nextInt(r.nextInt(3) + 1);
        for (let k = 0; k < n; k++) if (stay(w, a, b + k, c)) w.setBlock(a, b + k, c, B.cactus);
    }
    return true;
}

// WorldGenLiquids (xo): a spring in a cave wall, flowed out at once
export function spring(w, r, x, y, z, id) {
    if (w.getBlockId(x, y + 1, z) !== B.stone) return false;
    if (w.getBlockId(x, y - 1, z) !== B.stone) return false;
    if (w.getBlockId(x, y, z) !== 0 && w.getBlockId(x, y, z) !== B.stone) return false;
    let stone = 0;
    if (w.getBlockId(x - 1, y, z) === B.stone) stone++;
    if (w.getBlockId(x + 1, y, z) === B.stone) stone++;
    if (w.getBlockId(x, y, z - 1) === B.stone) stone++;
    if (w.getBlockId(x, y, z + 1) === B.stone) stone++;
    let air = 0;
    if (w.isAirBlock(x - 1, y, z)) air++;
    if (w.isAirBlock(x + 1, y, z)) air++;
    if (w.isAirBlock(x, y, z - 1)) air++;
    if (w.isAirBlock(x, y, z + 1)) air++;
    if (stone === 3 && air === 1) {
        w.setBlockWithNotify(x, y, z, id);
        w.immediate = true;
        w.run(behaviour[id].tick(w, x, y, z, r));
        w.immediate = false;
    }
    return true;
}
