// Chunk (lm) from b1.7.3: 16x16x128 block ids, metadata, sky light and the height map, with the same
// update rules as the original (height map/sky light relight on opacity change, block add/remove callbacks).
// Block light is never set during generation (light updates are queued in the original and never run here).

import { LIGHT_OPACITY } from './blockdata.js';

export const idx = (x, y, z) => (x << 11) | (z << 7) | y;

export class Chunk {
    constructor(world, cx, cz, blocks) {
        this.world = world;
        this.cx = cx;
        this.cz = cz;
        this.blocks = blocks;                   // lm.b
        this.meta = new Uint8Array(32768);      // lm.e (one nibble per byte here)
        this.sky = new Uint8Array(32768);       // lm.f
        this.height = new Uint8Array(256);      // lm.h, index (z << 4) | x
        this.lowest = 0;                        // lm.i
        this.populated = false;                 // lm.n
        this.tiles = new Map();                 // lm.l, key idx(x, y, z)
        this.placed = false;                    // already written into the Bedrock world
    }

    getBlockId(x, y, z) {
        return this.blocks[(x << 11) | (z << 7) | y];
    }

    getMeta(x, y, z) {
        return this.meta[(x << 11) | (z << 7) | y];
    }

    setMeta(x, y, z, m) {
        if (this.placed && this.world.writeToPlaced(this, x, y, z)) return;
        this.meta[(x << 11) | (z << 7) | y] = m & 15;
    }

    getHeight(x, z) {
        return this.height[(z << 4) | x];
    }

    // lm.c(x, y, z): can see the sky
    canSeeSky(x, y, z) {
        return y >= this.height[(z << 4) | x];
    }

    // lm.a(eb.a, x, y, z)
    getSky(x, y, z) {
        return this.sky[(x << 11) | (z << 7) | y];
    }

    // lm.c(x, y, z, subtracted): block light is always 0 during generation
    getLight(x, y, z, sub) {
        const s = this.sky[(x << 11) | (z << 7) | y] - sub;
        return s > 0 ? s : 0;
    }

    // lm.c(): height map + initial sky light
    generateSkylightMap() {
        const b = this.blocks;
        const noSky = this.world.hasNoSky;
        let lowest = 127;
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                let y = 127;
                const base = (x << 11) | (z << 7);
                while (y > 0 && LIGHT_OPACITY[b[base + y - 1]] === 0) y--;
                this.height[(z << 4) | x] = y;
                if (y < lowest) lowest = y;
                if (!noSky) {
                    let light = 15;
                    let yy = 127;
                    do {
                        light -= LIGHT_OPACITY[b[base + yy]];
                        if (light > 0) this.sky[base + yy] = light;
                        yy--;
                    } while (yy > 0 && light > 0);
                }
            }
        }
        this.lowest = lowest;
    }

    // lm.g(x, y, z): relight a column after its top changed
    relight(x, y, z) {
        const b = this.blocks;
        const old = this.height[(z << 4) | x];
        let h = old;
        if (y > old) h = y;
        const base = (x << 11) | (z << 7);
        while (h > 0 && LIGHT_OPACITY[b[base + h - 1]] === 0) h--;
        if (h === old) return;
        this.height[(z << 4) | x] = h;
        if (h < this.lowest) {
            this.lowest = h;
        } else {
            let low = 127;
            for (let i = 0; i < 256; i++) if (this.height[i] < low) low = this.height[i];
            this.lowest = low;
        }
        if (h < old) {
            for (let yy = h; yy < old; yy++) this.sky[base + yy] = 15;
        } else {
            for (let yy = old; yy < h; yy++) this.sky[base + yy] = 0;
        }
        let light = 15;
        let yy = h;
        while (yy > 0 && light > 0) {
            yy--;
            let op = LIGHT_OPACITY[b[base + yy]];
            if (op === 0) op = 1;
            light -= op;
            if (light < 0) light = 0;
            this.sky[base + yy] = light;
        }
    }

    // lm.a(x, y, z, id): set id, metadata 0
    // The world runs the new block's onBlockAdded afterwards (GenWorld.setBlock / gSetBlock).
    putBlock(x, y, z, id) {
        const i = (x << 11) | (z << 7) | y;
        const h = this.height[(z << 4) | x];
        const old = this.blocks[i];
        if (old === id) return false;
        if (this.placed && this.world.writeToPlaced(this, x, y, z)) return false;
        const wx = this.cx * 16 + x, wz = this.cz * 16 + z;
        this.blocks[i] = id;
        const w = this.world;
        if (old !== 0) w.onBlockRemoval(old, wx, y, wz);
        this.meta[i] = 0;
        if (LIGHT_OPACITY[id] !== 0) {
            if (y >= h) this.relight(x, y + 1, z);
        } else if (y === h - 1) {
            this.relight(x, y, z);
        }
        return true;
    }

    // lm.a(x, y, z, id, meta), up to onBlockAdded like putBlock
    putBlockMeta(x, y, z, id, m) {
        const i = (x << 11) | (z << 7) | y;
        const h = this.height[(z << 4) | x];
        const old = this.blocks[i];
        if (old === id && this.meta[i] === m) return false;
        if (this.placed && this.world.writeToPlaced(this, x, y, z)) return false;
        const wx = this.cx * 16 + x, wz = this.cz * 16 + z;
        this.blocks[i] = id;
        const w = this.world;
        if (old !== 0) w.onBlockRemoval(old, wx, y, wz);
        this.meta[i] = m & 15;
        if (!w.hasNoSky) {
            if (LIGHT_OPACITY[id] !== 0) {
                if (y >= h) this.relight(x, y + 1, z);
            } else if (y === h - 1) {
                this.relight(x, y, z);
            }
        }
        this.meta[i] = m & 15;
        return true;
    }
}
