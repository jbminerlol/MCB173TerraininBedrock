// BiomeGenBase (kd) and WorldChunkManager (xv) from b1.7.3.

import { JavaRandom, lmul } from './random.js';
import { Octaves2 } from './noise.js';

const f = Math.fround;

// Tree pickers return a feature name; features.js builds the generator.
const defaultTrees = (r) => (r.nextInt(10) === 0 ? 'bigtree' : 'tree');

function biome(id, name, color, opts = {}) {
    return {
        id,
        name,
        color,
        top: opts.top ?? 2,      // grass
        filler: opts.filler ?? 3, // dirt
        trees: opts.trees ?? defaultTrees,
        snow: opts.snow ?? false,  // kd.v: enableSnow
        rain: opts.rain ?? true,   // kd.w
    };
}

export const BIOME = {
    rainforest: biome(0, 'Rainforest', 588342, { trees: (r) => (r.nextInt(3) === 0 ? 'bigtree' : 'tree') }),
    swampland: biome(1, 'Swampland', 522674),
    seasonalForest: biome(2, 'Seasonal Forest', 10215459),
    forest: biome(3, 'Forest', 353825, {
        trees: (r) => (r.nextInt(5) === 0 ? 'birch' : r.nextInt(3) === 0 ? 'bigtree' : 'tree'),
    }),
    savanna: biome(4, 'Savanna', 14278691),
    shrubland: biome(5, 'Shrubland', 10595616),
    taiga: biome(6, 'Taiga', 3060051, { snow: true, trees: (r) => (r.nextInt(3) === 0 ? 'taiga1' : 'taiga2') }),
    desert: biome(7, 'Desert', 16421912, { top: 12, filler: 12, rain: false }),
    plains: biome(8, 'Plains', 16767248),
    iceDesert: biome(9, 'Ice Desert', 16772499, { top: 12, filler: 12, snow: true, rain: false }),
    tundra: biome(10, 'Tundra', 5762041, { snow: true }),
    hell: biome(11, 'Hell', 16711680, { rain: false }),
    sky: biome(12, 'Sky', 8421631, { rain: false }),
};
export const BIOMES = Object.values(BIOME);

// kd.a(float temperature, float humidity)
function lookup(t, h) {
    h = f(h * t);
    if (t < f(0.1)) return BIOME.tundra;
    if (h < f(0.2)) {
        if (t < f(0.5)) return BIOME.tundra;
        if (t < f(0.95)) return BIOME.savanna;
        return BIOME.desert;
    }
    if (h > f(0.5) && t < f(0.7)) return BIOME.swampland;
    if (t < f(0.5)) return BIOME.taiga;
    if (t < f(0.97)) return h < f(0.35) ? BIOME.shrubland : BIOME.forest;
    if (h < f(0.45)) return BIOME.plains;
    if (h < f(0.9)) return BIOME.seasonalForest;
    return BIOME.rainforest;
}

const TABLE = new Array(4096);
for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 64; j++) TABLE[i + j * 64] = lookup(f(i / 63), f(j / 63));
}

// kd.a(double, double)
export function biomeFor(t, h) {
    return TABLE[((t * 63.0) | 0) + ((h * 63.0) | 0) * 64];
}

const F025 = 0.02500000037252903; // (double)0.025F
const F05 = 0.05000000074505806;  // (double)0.05F

export class WorldChunkManager {
    constructor(seed) {
        this.tempGen = new Octaves2(new JavaRandom(lmul(seed, 9871n)), 4);
        this.humGen = new Octaves2(new JavaRandom(lmul(seed, 39811n)), 4);
        this.noiseGen = new Octaves2(new JavaRandom(lmul(seed, 543321n)), 2);
        this.temperature = null; // xv.a
        this.humidity = null;    // xv.b
        this.noise = null;       // xv.c
        this.biomes = null;      // xv.d
    }

    // xv.a(int, int)
    getBiomeGenAt(x, z) {
        return this.getBiomes(x, z, 1, 1)[0];
    }

    // xv.b(int, int)
    getTemperature(x, z) {
        this.temperature = this.tempGen.generate(this.temperature, x, z, 1, 1, F025, F025, 0.5);
        return this.temperature[0];
    }

    // xv.a(int, int, int, int)
    getBiomes(x, z, w, h) {
        this.biomes = this.loadBlockGeneratorData(this.biomes, x, z, w, h);
        return this.biomes;
    }

    // xv.a(double[], int, int, int, int)
    getTemperatures(out, x, z, w, h) {
        if (out === null || out.length < w * h) out = new Float64Array(w * h);
        out = this.tempGen.generate(out, x, z, w, h, F025, F025, 0.25);
        this.noise = this.noiseGen.generate(this.noise, x, z, w, h, 0.25, 0.25, 0.5882352941176471);
        let n = 0;
        for (let i = 0; i < w; i++) {
            for (let k = 0; k < h; k++) {
                const d9 = this.noise[n] * 1.1 + 0.5;
                const d11 = 0.01;
                const d13 = 1.0 - d11;
                let t = (out[n] * 0.15 + 0.7) * d13 + d9 * d11;
                t = 1.0 - (1.0 - t) * (1.0 - t);
                if (t < 0.0) t = 0.0;
                if (t > 1.0) t = 1.0;
                out[n++] = t;
            }
        }
        return out;
    }

    // xv.a(kd[], int, int, int, int): note the noise is sampled w x w, as in the original
    loadBlockGeneratorData(out, x, z, w, h) {
        if (out === null || out.length < w * h) out = new Array(w * h);
        this.temperature = this.tempGen.generate(this.temperature, x, z, w, w, F025, F025, 0.25);
        this.humidity = this.humGen.generate(this.humidity, x, z, w, w, F05, F05, 0.3333333333333333);
        this.noise = this.noiseGen.generate(this.noise, x, z, w, w, 0.25, 0.25, 0.5882352941176471);
        let n = 0;
        for (let i = 0; i < w; i++) {
            for (let k = 0; k < h; k++) {
                const d9 = this.noise[n] * 1.1 + 0.5;
                let d11 = 0.01;
                let d13 = 1.0 - d11;
                let t = (this.temperature[n] * 0.15 + 0.7) * d13 + d9 * d11;
                d11 = 0.002;
                d13 = 1.0 - d11;
                let hum = (this.humidity[n] * 0.15 + 0.5) * d13 + d9 * d11;
                t = 1.0 - (1.0 - t) * (1.0 - t);
                if (t < 0.0) t = 0.0;
                if (hum < 0.0) hum = 0.0;
                if (t > 1.0) t = 1.0;
                if (hum > 1.0) hum = 1.0;
                this.temperature[n] = t;
                this.humidity[n] = hum;
                out[n++] = biomeFor(t, hum);
            }
        }
        return out;
    }
}
