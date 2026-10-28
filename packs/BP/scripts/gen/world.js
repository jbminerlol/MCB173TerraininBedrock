// The slice of World (fd) + ChunkProvider (ok) that b1.7.3 world generation touches: chunk loading with the
// neighbour-triggered populate rule, block get/set with the original notify semantics, the height map queries,
// sky light, tile entities and the "scheduled updates are immediate" mode used by liquid springs.

import { Chunk } from './chunk.js';
import { JavaRandom } from './random.js';
import { MATERIAL, MAT, MAT_SOLID, MAT_BLOCKS_MOVEMENT, MAT_LIQUID, MAT_OPAQUE, RENDER_NORMAL } from './blockdata.js';
import { behaviour } from './behaviour.js';

export const key = (cx, cz) => cx * 67108864 + cz;

// fd.i's notify order: -x, +x, -y, +y, -z, +z
const NEIGHBOURS = [-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1];

export class GenWorld {
    // generator: { provideChunk(world, cx, cz) -> Uint8Array blocks, populate(world, cx, cz) }
    constructor(seed, generator, opts = {}) {
        this.seed = BigInt.asIntN(64, BigInt(seed));
        this.generator = generator;
        this.hasNoSky = !!opts.hasNoSky;          // xa.e
        this.isNether = !!opts.isNether;          // xa.d
        this.chunks = new Map();                  // ok.e
        this.rand = new JavaRandom(opts.worldRandSeed ?? 0n); // fd.r
        this.immediate = false;                   // fd.a
        this.editing = false;                     // fd.o
        this.skylightSubtracted = 0;              // fd.f
        this.onChunkLoaded = opts.onChunkLoaded ?? null;
        this.loading = 0;
        // Hooks used by the Bedrock side: wasPopulated(cx, cz) says a populate already ran in an earlier session
        // (its writes into placed chunks are then dropped); writes into placed chunks otherwise go to lateWrites.
        this.wasPopulated = opts.wasPopulated ?? null;
        this.onPopulated = opts.onPopulated ?? null;
        this.rerun = false;
        this.lateWrites = [];
        generator.init?.(this);
    }

    // true: drop the write (a re-run populate); false: apply it and remember it for the Bedrock world
    writeToPlaced(chunk, x, y, z) {
        if (this.rerun) return true;
        this.lateWrites.push(chunk, (x << 11) | (z << 7) | y);
        return false;
    }

    chunkExists(cx, cz) {
        return this.chunks.has(key(cx, cz));
    }

    // ok.b: existing chunk, else load (generate) it
    getChunk(cx, cz) {
        const c = this.chunks.get(key(cx, cz));
        return c !== undefined ? c : this.loadChunk(cx, cz);
    }

    // ok.c
    loadChunk(cx, cz) {
        const k = key(cx, cz);
        let c = this.chunks.get(k);
        if (c !== undefined) return c;
        c = new Chunk(this, cx, cz, this.generator.provideChunk(this, cx, cz));
        if (this.generator.skylightOnLoad !== false) c.generateSkylightMap(); // qn.b never builds it
        this.chunks.set(k, c);
        this.loading++;
        if (this.onChunkLoaded) this.onChunkLoaded(c);
        if (!c.populated && this.chunkExists(cx + 1, cz + 1) && this.chunkExists(cx, cz + 1) && this.chunkExists(cx + 1, cz))
            this.populate(cx, cz);
        if (this.chunkExists(cx - 1, cz) && !this.getChunk(cx - 1, cz).populated && this.chunkExists(cx - 1, cz + 1) &&
            this.chunkExists(cx, cz + 1) && this.chunkExists(cx - 1, cz))
            this.populate(cx - 1, cz);
        if (this.chunkExists(cx, cz - 1) && !this.getChunk(cx, cz - 1).populated && this.chunkExists(cx + 1, cz - 1) &&
            this.chunkExists(cx, cz - 1) && this.chunkExists(cx + 1, cz))
            this.populate(cx, cz - 1);
        if (this.chunkExists(cx - 1, cz - 1) && !this.getChunk(cx - 1, cz - 1).populated &&
            this.chunkExists(cx - 1, cz - 1) && this.chunkExists(cx, cz - 1) && this.chunkExists(cx - 1, cz))
            this.populate(cx - 1, cz - 1);
        this.loading--;
        return c;
    }

    // ok.a(cl, x, z)
    populate(cx, cz) {
        const c = this.getChunk(cx, cz);
        if (c.populated) return;
        c.populated = true;
        const prev = this.rerun;
        this.rerun = this.wasPopulated ? this.wasPopulated(cx, cz) : false;
        try {
            this.generator.populate(this, cx, cz);
        } finally {
            this.rerun = prev;
        }
        if (this.onPopulated) this.onPopulated(cx, cz);
    }

    inRange(x, z) {
        return x >= -32000000 && z >= -32000000 && x < 32000000 && z <= 32000000;
    }

    // fd.a(x, y, z)
    getBlockId(x, y, z) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return 0;
        return this.getChunk(x >> 4, z >> 4).blocks[((x & 15) << 11) | ((z & 15) << 7) | y];
    }

    // fd.e(x, y, z)
    getBlockMetadata(x, y, z) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return 0;
        return this.getChunk(x >> 4, z >> 4).meta[((x & 15) << 11) | ((z & 15) << 7) | y];
    }

    // fd.f(x, y, z): material index (MAT.air for air)
    getMaterial(x, y, z) {
        const id = this.getBlockId(x, y, z);
        return id === 0 ? MAT.air : MATERIAL[id];
    }

    isAirBlock(x, y, z) {
        return this.getBlockId(x, y, z) === 0;
    }

    // Block callbacks (added, neighborChanged, tick) are generators. A callback calls a world write or another
    // callback with `yield <generator>` and run() executes it on an explicit stack, so the nesting lives in memory
    // rather than on the JS stack: a spring flooding a cave ticks each block it fills inside the tick of the block
    // before it (hundreds deep), and Bedrock's script stack overflows after about a hundred calls.
    // The plain methods are for feature code; the g-prefixed generators are the same writes for callbacks.
    run(g) {
        const stack = [g];
        let v;
        for (;;) {
            const r = stack[stack.length - 1].next(v);
            if (r.done) {
                stack.pop();
                if (stack.length === 0) return r.value;
                v = r.value;
            } else {
                stack.push(r.value);
                v = undefined;
            }
        }
    }

    // fd.c(x, y, z, id)
    setBlock(x, y, z, id) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return false;
        if (!this.getChunk(x >> 4, z >> 4).putBlock(x & 15, y, z & 15, id)) return false;
        if (id !== 0 && behaviour[id]?.added) this.run(behaviour[id].added(this, x, y, z));
        return true;
    }

    *gSetBlock(x, y, z, id) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return false;
        if (!this.getChunk(x >> 4, z >> 4).putBlock(x & 15, y, z & 15, id)) return false;
        if (id !== 0 && behaviour[id]?.added) yield behaviour[id].added(this, x, y, z);
        return true;
    }

    // fd.a(x, y, z, id, meta)
    setBlockAndMetadata(x, y, z, id, meta) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return false;
        if (!this.getChunk(x >> 4, z >> 4).putBlockMeta(x & 15, y, z & 15, id, meta)) return false;
        if (id !== 0 && behaviour[id]?.added) this.run(behaviour[id].added(this, x, y, z));
        return true;
    }

    *gSetBlockAndMetadata(x, y, z, id, meta) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return false;
        if (!this.getChunk(x >> 4, z >> 4).putBlockMeta(x & 15, y, z & 15, id, meta)) return false;
        if (id !== 0 && behaviour[id]?.added) yield behaviour[id].added(this, x, y, z);
        return true;
    }

    // fd.e(x, y, z, meta)
    setBlockMetadata(x, y, z, meta) {
        if (!this.inRange(x, z) || y < 0 || y >= 128) return false;
        this.getChunk(x >> 4, z >> 4).setMeta(x & 15, y, z & 15, meta);
        return true;
    }

    // fd.f(x, y, z, id)
    setBlockWithNotify(x, y, z, id) {
        if (this.setBlock(x, y, z, id)) {
            this.notifyBlocksOfNeighborChange(x, y, z, id);
            return true;
        }
        return false;
    }

    *gSetBlockWithNotify(x, y, z, id) {
        if (yield this.gSetBlock(x, y, z, id)) {
            yield this.gNotifyBlocksOfNeighborChange(x, y, z, id);
            return true;
        }
        return false;
    }

    // fd.b(x, y, z, id, meta)
    *gSetBlockAndMetadataWithNotify(x, y, z, id, meta) {
        if (yield this.gSetBlockAndMetadata(x, y, z, id, meta)) {
            yield this.gNotifyBlocksOfNeighborChange(x, y, z, id);
            return true;
        }
        return false;
    }

    // fd.d(x, y, z, meta): the requires-self-notify flag (uu.t) only changes who gets notified
    *gSetBlockMetadataWithNotify(x, y, z, meta) {
        if (this.setBlockMetadata(x, y, z, meta)) yield this.gNotifyBlocksOfNeighborChange(x, y, z, this.getBlockId(x, y, z));
    }

    // fd.g / fd.i: fd.l on the six neighbours; fd.l does nothing while a stationary liquid is being made flowing
    notifyBlocksOfNeighborChange(x, y, z, id) {
        for (let i = 0; i < 18; i += 3) {
            if (this.editing) continue;
            const nx = x + NEIGHBOURS[i], ny = y + NEIGHBOURS[i + 1], nz = z + NEIGHBOURS[i + 2];
            const b = behaviour[this.getBlockId(nx, ny, nz)];
            if (b && b.neighborChanged) this.run(b.neighborChanged(this, nx, ny, nz, id));
        }
    }

    *gNotifyBlocksOfNeighborChange(x, y, z, id) {
        for (let i = 0; i < 18; i += 3) {
            if (this.editing) continue;
            const nx = x + NEIGHBOURS[i], ny = y + NEIGHBOURS[i + 1], nz = z + NEIGHBOURS[i + 2];
            const b = behaviour[this.getBlockId(nx, ny, nz)];
            if (b && b.neighborChanged) yield b.neighborChanged(this, nx, ny, nz, id);
        }
    }

    onBlockRemoval(id, x, y, z) {
        const b = behaviour[id];
        if (b && b.removed) b.removed(this, x, y, z);
    }

    // fd.c(x, y, z, id, delay): queued ticks (fd.E) only run once the world ticks, and Bedrock ticks the written
    // blocks itself; only springs switch on immediate mode, where the tick runs at once.
    *gScheduleBlockUpdate(x, y, z, id, delay) {
        const r = 8;
        if (!this.immediate || !this.checkChunksExist(x - r, y - r, z - r, x + r, y + r, z + r)) return;
        const cur = this.getBlockId(x, y, z);
        if (cur === id && cur > 0 && behaviour[cur]?.tick) yield behaviour[cur].tick(this, x, y, z, this.rand);
    }

    // fd.a(x0, y0, z0, x1, y1, z1), with the original's (y1 < 0 || y0 >= 128) test
    checkChunksExist(x0, y0, z0, x1, y1, z1) {
        if (y1 < 0 || y0 >= 128) return false;
        x0 >>= 4;
        z0 >>= 4;
        x1 >>= 4;
        z1 >>= 4;
        for (let cx = x0; cx <= x1; cx++)
            for (let cz = z0; cz <= z1; cz++) if (!this.chunkExists(cx, cz)) return false;
        return true;
    }

    // fd.d(x, z): height map value of a loaded chunk (0 when not loaded)
    getHeightValue(x, z) {
        if (!this.inRange(x, z)) return 0;
        if (!this.chunkExists(x >> 4, z >> 4)) return 0;
        return this.getChunk(x >> 4, z >> 4).height[((z & 15) << 4) | (x & 15)];
    }

    // fd.e(x, z): first block from the top that blocks movement or is liquid, plus one
    findTopSolidBlock(x, z) {
        const c = this.getChunk(x >> 4, z >> 4);
        const lx = x & 15, lz = z & 15;
        for (let y = 127; y > 0; y--) {
            const id = c.blocks[(lx << 11) | (lz << 7) | y];
            const m = id === 0 ? MAT.air : MATERIAL[id];
            if (MAT_BLOCKS_MOVEMENT[m] || MAT_LIQUID[m]) return y + 1;
        }
        return -1;
    }

    // fd.h(x, y, z)
    isBlockNormalCube(x, y, z) {
        const id = this.getBlockId(x, y, z);
        return id !== 0 && MAT_OPAQUE[MATERIAL[id]] === 1 && RENDER_NORMAL[id] === 1;
    }

    // fd.l(x, y, z)
    canBlockSeeTheSky(x, y, z) {
        return this.getChunk(x >> 4, z >> 4).canSeeSky(x & 15, y, z & 15);
    }

    // fd.m(x, y, z): full light value, block light is always 0 here
    getFullBlockLightValue(x, y, z) {
        if (y < 0) return 0;
        if (y >= 128) y = 127;
        return this.getChunk(x >> 4, z >> 4).getLight(x & 15, y, z & 15, 0);
    }

    // fd.a(eb.a, x, y, z)
    getSkyLight(x, y, z) {
        if (y < 0) y = 0;
        if (y >= 128) y = 127;
        if (!this.inRange(x, z)) return 15;
        if (!this.chunkExists(x >> 4, z >> 4)) return 0;
        return this.getChunk(x >> 4, z >> 4).getSky(x & 15, y, z & 15);
    }

    isSolid(x, y, z) {
        return MAT_SOLID[this.getMaterial(x, y, z)] === 1;
    }

    blocksMovement(x, y, z) {
        return MAT_BLOCKS_MOVEMENT[this.getMaterial(x, y, z)] === 1;
    }

    // tile entities (fd.a(x, y, z, ow) / fd.b(x, y, z))
    setTile(x, y, z, tile) {
        const c = this.getChunk(x >> 4, z >> 4);
        c.tiles.set(((x & 15) << 11) | ((z & 15) << 7) | y, tile);
    }

    getTile(x, y, z) {
        const c = this.getChunk(x >> 4, z >> 4);
        return c.tiles.get(((x & 15) << 11) | ((z & 15) << 7) | y) ?? null;
    }

    removeTile(x, y, z) {
        const c = this.getChunk(x >> 4, z >> 4);
        c.tiles.delete(((x & 15) << 11) | ((z & 15) << 7) | y);
    }
}
