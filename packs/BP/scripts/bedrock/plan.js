// Turns a finished 16x128x16 chunk into a short list of box fills ("painter's order"): block types are placed
// most common first, and a box may run through voxels of types placed later (they get overwritten), but never
// through air or through types already placed. Pure JS so it can be measured outside the game.

// blocks/meta: Uint8Array(32768), index (x << 11) | (z << 7) | y.
// Returns { keys: number[] (id << 4 | meta per palette entry), ops: Int32Array [k, x0, y0, z0, x1, y1, z1]... }
export function planChunk(blocks, meta, maxY = 128) {
    const K = new Uint16Array(32768);
    const keyIndex = new Map();
    const keys = [0];
    const counts = [0];
    for (let i = 0; i < 32768; i++) {
        const id = blocks[i];
        if (id === 0) continue;
        const k = (id << 4) | meta[i];
        let p = keyIndex.get(k);
        if (p === undefined) {
            p = keys.length;
            keyIndex.set(k, p);
            keys.push(k);
            counts.push(0);
        }
        K[i] = p;
        counts[p]++;
    }
    const order = [];
    for (let p = 1; p < keys.length; p++) order.push(p);
    order.sort((a, b) => counts[b] - counts[a]);
    const rank = new Uint16Array(keys.length);
    order.forEach((p, r) => (rank[p] = r + 1));

    const covered = new Uint8Array(32768);
    const ops = [];
    for (const p of order) {
        const r = rank[p];
        const can = (i) => {
            const q = K[i];
            return q !== 0 && rank[q] >= r;
        };
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 0; y < maxY; y++) {
                    const i = (x << 11) | (z << 7) | y;
                    if (K[i] !== p || covered[i]) continue;
                    // grow along y, then z, then x
                    let y1 = y;
                    while (y1 + 1 < maxY && can(i + y1 + 1 - y)) y1++;
                    let z1 = z;
                    growZ: while (z1 + 1 < 16) {
                        const base = (x << 11) | ((z1 + 1) << 7);
                        for (let yy = y; yy <= y1; yy++) if (!can(base | yy)) break growZ;
                        z1++;
                    }
                    let x1 = x;
                    growX: while (x1 + 1 < 16) {
                        for (let zz = z; zz <= z1; zz++) {
                            const base = ((x1 + 1) << 11) | (zz << 7);
                            for (let yy = y; yy <= y1; yy++) if (!can(base | yy)) break growX;
                        }
                        x1++;
                    }
                    for (let xx = x; xx <= x1; xx++)
                        for (let zz = z; zz <= z1; zz++) {
                            const base = (xx << 11) | (zz << 7);
                            for (let yy = y; yy <= y1; yy++) if (K[base | yy] === p) covered[base | yy] = 1;
                        }
                    ops.push(p, x, y, z, x1, y1, z1);
                }
            }
        }
    }
    return { keys, ops: Int32Array.from(ops) };
}
