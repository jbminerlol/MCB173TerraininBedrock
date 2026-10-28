// Runs the b1.7.3 generator inside Bedrock: picks the seed (Beta's rules), finds Beta's spawn, generates chunks
// nearest-first around players and writes them into the world with box fills spread over ticks.
//
// Persistent state (world dynamic properties):
//   b173:seed               the Beta seed (decimal string)
//   b173:spawn              Vector3
//   b173:p:<dim>:<rx>:<rz>  32x32-chunk bitmap of chunks written to the world
//   b173:q:<dim>:<rx>:<rz>  bitmap of chunks whose populate has run
//   b173:clear:<dim>        1 when chunks must be cleared before writing (the dimension had other terrain)

import * as mc from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { GenWorld } from '../gen/world.js';
import { Overworld } from '../gen/overworld.js';
import { Nether } from '../gen/nether.js';
import { JavaRandom } from '../gen/random.js';
import { OPAQUE_CUBE } from '../gen/blockdata.js';
import { findSpawn } from '../gen/spawn.js';
import { planChunk } from './plan.js';
import { permutation, bedrockItem, SPAWNER_STRUCTURE } from './blockmap.js';
import { betaSeed } from './seed.js';

const { world, system, BlockVolume, ItemStack } = mc;

const FILLS_PER_STEP = 40;
const SETS_PER_STEP = 4096;
const CHUNK_STRUCTURE = 'b173:chunk';
const TICKS_BETWEEN_WRITES = 3; // let the game light and send each chunk before the next one lands
const SLOW_TICK_MS = 70; // average real time per tick above which generation slows down (normal is 50)
const SLOW_WAIT_TICKS = 20;

let useStructures = true;
let radius = 5;
let seed = null;
let ready = false;
let spawn = null;
const dims = new Map(); // bedrock dimension id -> DimState
const holds = new Map(); // player id -> {x, y, z, dim}
const arrivedAt = new Map(); // player id -> tick of the last dimension change
let formOpen = false;
let stats = { chunks: 0, genMs: 0, placeMs: 0, fills: 0 };

// ---- small helpers
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    return s;
}
function fromB64(s, len) {
    const out = new Uint8Array(len);
    let o = 0;
    for (let i = 0; i < s.length && o < len; i += 4) {
        const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | (B64.indexOf(s[i + 2]) << 6) | B64.indexOf(s[i + 3]);
        out[o++] = (n >> 16) & 255;
        if (o < len) out[o++] = (n >> 8) & 255;
        if (o < len) out[o++] = n & 255;
    }
    return out;
}

// Per-region chunk bitmaps kept in dynamic properties
class BitStore {
    constructor(prefix) {
        this.prefix = prefix;
        this.regions = new Map();
        this.dirty = new Set();
    }
    region(rx, rz) {
        const k = `${rx}:${rz}`;
        let r = this.regions.get(k);
        if (!r) {
            const v = world.getDynamicProperty(`${this.prefix}:${k}`);
            r = typeof v === 'string' ? fromB64(v, 128) : new Uint8Array(128);
            this.regions.set(k, r);
        }
        return r;
    }
    get(cx, cz) {
        const r = this.region(cx >> 5, cz >> 5);
        const i = ((cx & 31) << 5) | (cz & 31);
        return (r[i >> 3] & (1 << (i & 7))) !== 0;
    }
    set(cx, cz) {
        const r = this.region(cx >> 5, cz >> 5);
        const i = ((cx & 31) << 5) | (cz & 31);
        r[i >> 3] |= 1 << (i & 7);
        this.dirty.add(`${cx >> 5}:${cz >> 5}`);
    }
    flush() {
        for (const k of this.dirty) world.setDynamicProperty(`${this.prefix}:${k}`, toB64(this.regions.get(k)));
        this.dirty.clear();
    }
}

class DimState {
    constructor(name, bedrockId, generator, opts) {
        this.name = name;
        this.dim = world.getDimension(bedrockId);
        this.placed = new BitStore(`b173:p:${name}`);
        this.populated = new BitStore(`b173:q:${name}`);
        this.gw = new GenWorld(seed, generator, {
            ...opts,
            worldRandSeed: seed,
            wasPopulated: (cx, cz) => this.populated.get(cx, cz),
            onPopulated: (cx, cz) => this.populated.set(cx, cz),
            onChunkLoaded: (c) => {
                if (this.placed.get(c.cx, c.cz)) c.placed = true;
            },
        });
        const clear = world.getDynamicProperty(`b173:clear:${name}`);
        this.clear = clear === undefined ? null : clear === 1;
        this.defaultClear = opts.defaultClear;
        this.pendingTiles = [];
        this.arrivals = []; // portal arrival points to rebuild after the chunk is written
    }
}

// ---- seed and spawn
function initDims() {
    dims.set('minecraft:overworld', new DimState('o', 'overworld', new Overworld(seed), { defaultClear: false }));
    dims.set('minecraft:nether', new DimState('n', 'nether', new Nether(seed), { hasNoSky: true, isNether: true, defaultClear: true }));
}

function announce(msg) {
    world.sendMessage(`§e[Beta 1.7.3]§r ${msg}`);
}

// GuiCreateWorld: a blank box (or a parsed 0) means new Random().nextLong()
function randomLong() {
    const hi = BigInt(Math.floor(Math.random() * 4294967296));
    const lo = BigInt(Math.floor(Math.random() * 4294967296));
    return BigInt.asIntN(64, (hi << 32n) | lo);
}

function chooseSeed(text) {
    seed = betaSeed(text, randomLong());
    world.setDynamicProperty('b173:seed', seed.toString());
    announce(`seed ${seed}`);
    initDims();
    system.runJob(spawnJob());
}

function* spawnJob() {
    try {
        const ds = dims.get('minecraft:overworld');
        const out = {};
        const t0 = Date.now();
        yield* findSpawn(ds.gw, new JavaRandom(seed), out);
        spawn = { x: out.x, y: out.y, z: out.z };
        world.setDynamicProperty('b173:spawn', spawn);
        console.warn(`[B173] spawn ${spawn.x} ${spawn.y} ${spawn.z} found in ${Date.now() - t0} ms`);
        ready = true;
        world.setDefaultSpawnLocation(spawn);
        for (const p of world.getAllPlayers()) {
            if (p.dimension.id !== 'minecraft:overworld') continue;
            holds.set(p.id, { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5, dim: 'minecraft:overworld' });
            p.teleport({ x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 });
        }
    } catch (e) {
        ready = spawn !== null;
        console.warn(`[B173] spawn setup failed: ${e}\n${e?.stack ?? ''}`);
    }
}

function askSeed(player) {
    if (formOpen) return;
    formOpen = true;
    const form = new ModalFormData()
        .title('Beta 1.7.3 world')
        .textField('Seed for the World Generator (leave blank for a random seed)', 'number or text, as in Beta', {
            defaultValue: '',
        })
        .submitButton('Create New World');
    form.show(player).then((res) => {
        formOpen = false;
        if (seed !== null) return;
        if (res.canceled) {
            if (res.cancelationReason === 'UserBusy') {
                system.runTimeout(() => askSeed(player), 40);
                return;
            }
            chooseSeed('');
            return;
        }
        chooseSeed(String(res.formValues?.[0] ?? ''));
    }, () => {
        formOpen = false;
        if (seed === null) chooseSeed('');
    });
}

// ---- writing a chunk into the world
function chestFacing(gw, x, y, z) {
    const n = OPAQUE_CUBE[gw.getBlockId(x, y, z - 1)], s = OPAQUE_CUBE[gw.getBlockId(x, y, z + 1)];
    const wv = OPAQUE_CUBE[gw.getBlockId(x - 1, y, z)], e = OPAQUE_CUBE[gw.getBlockId(x + 1, y, z)];
    let f = 3;
    if (n && !s) f = 3;
    if (s && !n) f = 2;
    if (wv && !e) f = 5;
    if (e && !wv) f = 4;
    return f;
}

// isChunkLoaded, or (if it says no) whether the chunk hands out a block at all
function bedrockChunkLoaded(ds, cx, cz) {
    const at = { x: cx * 16 + 8, y: 64, z: cz * 16 + 8 };
    try {
        if (ds.dim.isChunkLoaded(at)) return true;
    } catch {}
    try {
        return ds.dim.getBlock(at) !== undefined;
    } catch {
        return false;
    }
}

// decide once per dimension whether existing terrain has to be cleared first
function detectClear(ds, cx, cz) {
    if (ds.clear !== null) return;
    let clear = ds.defaultClear;
    if (!clear) {
        try {
            for (const y of [-60, 0, 32, 62, 100]) {
                const b = ds.dim.getBlock({ x: cx * 16 + 8, y, z: cz * 16 + 8 });
                if (b && !b.isAir) clear = true;
            }
        } catch {
            clear = false;
        }
    }
    ds.clear = clear;
    world.setDynamicProperty(`b173:clear:${ds.name}`, clear ? 1 : 0);
    console.warn(`[B173] ${ds.name}: ${clear ? 'replacing existing terrain' : 'empty world, writing directly'}`);
}

function* writeChunk(ds, cx, cz) {
    const gw = ds.gw;
    const t0 = Date.now();
    for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
            if (!gw.chunkExists(cx + dx, cz + dz)) {
                gw.getChunk(cx + dx, cz + dz);
                yield;
            }
    for (const [px, pz] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
        if (!gw.getChunk(px, pz).populated) {
            gw.populate(px, pz);
            yield;
        }
    }
    const c = gw.getChunk(cx, cz);
    const genMs = Date.now() - t0;
    if (!bedrockChunkLoaded(ds, cx, cz)) return false;
    detectClear(ds, cx, cz);
    const t1 = Date.now();
    const meta = c.meta.slice();
    for (const [i, tile] of c.tiles) {
        if (tile.type === 'chest') meta[i] = chestFacing(gw, cx * 16 + (i >> 11), i & 127, cz * 16 + ((i >> 7) & 15));
    }
    const x0 = cx * 16, z0 = cz * 16;
    const dim = ds.dim;
    if (ds.clear) {
        // Beta's 0..127 is written in full (air included) below; only a taller dimension needs the rest emptied
        if (ds.name !== 'n') {
            const air = permutation(0, 0);
            for (const [y0, y1] of [[-64, -1], [128, 255], [256, 319]]) {
                dim.fillBlocks(new BlockVolume({ x: x0, y: y0, z: z0 }, { x: x0 + 15, y: y1, z: z0 + 15 }), air);
                yield;
            }
        }
        for (const e of dim.getEntities({ location: { x: x0, y: 0, z: z0 }, volume: { x: 16, y: 128, z: 16 }, excludeTypes: ['minecraft:player'] })) {
            try {
                e.remove();
            } catch {}
        }
        yield;
    }
    let writes = 0;
    if (useStructures) {
        try {
            writes = yield* writeByStructure(ds, c, meta, x0, z0, ds.clear);
        } catch (e) {
            useStructures = false;
            console.warn(`[B173] structure writes unavailable (${e}); falling back to fills`);
        }
    }
    if (!useStructures) writes = yield* writeByFills(ds, c, meta, x0, z0, ds.clear);
    if (writes === false) return false;
    for (const [i, tile] of c.tiles) ds.pendingTiles.push([cx * 16 + (i >> 11), i & 127, cz * 16 + ((i >> 7) & 15), tile]);
    c.placed = true;
    ds.placed.set(cx, cz);
    stats.chunks++;
    stats.genMs += genMs;
    stats.placeMs += Date.now() - t1;
    stats.fills += writes;
    return true;
}

// The chunk is built in an in-memory structure (no world updates per block) and placed with one call.
// withAir: also write Beta's air (over terrain the dimension made itself), so the whole 0..127 is replaced.
function* writeByStructure(ds, c, meta, x0, z0, withAir) {
    const sm = world.structureManager;
    try {
        sm.delete(CHUNK_STRUCTURE);
    } catch {}
    let top = withAir ? 127 : 0;
    if (!withAir) for (let i = 0; i < 32768; i++) if (c.blocks[i] !== 0 && (i & 127) > top) top = i & 127;
    const st = sm.createEmpty(CHUNK_STRUCTURE, { x: 16, y: top + 1, z: 16 }, mc.StructureSaveMode?.Memory ?? 'Memory');
    let n = 0;
    try {
        for (let x = 0; x < 16; x++)
            for (let z = 0; z < 16; z++) {
                const base = (x << 11) | (z << 7);
                for (let y = 0; y <= top; y++) {
                    const id = c.blocks[base | y];
                    if (id === 0 && !withAir) continue;
                    st.setBlockPermutation({ x, y, z }, permutation(id, meta[base | y]));
                    if (++n % SETS_PER_STEP === 0) yield;
                }
            }
        if (!bedrockChunkLoaded(ds, c.cx, c.cz)) return false;
        sm.place(st, ds.dim, { x: x0, y: 0, z: z0 }, { includeEntities: false });
    } finally {
        try {
            sm.delete(st);
        } catch {}
    }
    return 1;
}

// Fallback: box fills planned in painter's order.
function* writeByFills(ds, c, meta, x0, z0, clearFirst) {
    if (clearFirst) {
        ds.dim.fillBlocks(new BlockVolume({ x: x0, y: 0, z: z0 }, { x: x0 + 15, y: 127, z: z0 + 15 }), permutation(0, 0));
        yield;
    }
    const plan = planChunk(c.blocks, meta);
    yield;
    const ops = plan.ops;
    let n = 0;
    for (let i = 0; i < ops.length; i += 7) {
        const k = plan.keys[ops[i]];
        const perm = permutation(k >> 4, k & 15);
        const ax = x0 + ops[i + 1], ay = ops[i + 2], az = z0 + ops[i + 3];
        const bx = x0 + ops[i + 4], by = ops[i + 5], bz = z0 + ops[i + 6];
        try {
            if (ax === bx && ay === by && az === bz) ds.dim.setBlockPermutation({ x: ax, y: ay, z: az }, perm);
            else ds.dim.fillBlocks(new BlockVolume({ x: ax, y: ay, z: az }, { x: bx, y: by, z: bz }), perm);
        } catch (e) {
            // the chunk unloaded under us: give up, it is retried when it loads again
            console.warn(`[B173] write ${c.cx},${c.cz} interrupted: ${e}`);
            return false;
        }
        if (++n % FILLS_PER_STEP === 0) yield;
    }
    return ops.length / 7;
}

function finishTiles(ds) {
    const keep = [];
    for (const t of ds.pendingTiles) {
        const [x, y, z, tile] = t;
        try {
            if (!ds.dim.isChunkLoaded({ x, y, z })) {
                keep.push(t);
                continue;
            }
            if (tile.type === 'chest') {
                const inv = ds.dim.getBlock({ x, y, z })?.getComponent('minecraft:inventory')?.container;
                if (!inv) continue;
                tile.items.forEach((it, slot) => {
                    if (!it) return;
                    const name = bedrockItem(it[0], it[2]);
                    if (name) inv.setItem(slot, new ItemStack(name, it[1]));
                });
            } else if (tile.type === 'spawner') {
                const id = SPAWNER_STRUCTURE[tile.mob] ?? SPAWNER_STRUCTURE.Pig;
                world.structureManager.place(id, ds.dim, { x, y, z });
            }
        } catch (e) {
            console.warn(`[B173] tile at ${x} ${y} ${z}: ${e}`);
        }
    }
    ds.pendingTiles = keep;
}

// populates that ran after a neighbour was already written reach into it: copy those blocks over
function flushLateWrites(ds) {
    const lw = ds.gw.lateWrites;
    if (lw.length === 0) return;
    const keep = [];
    const seen = new Set();
    for (let i = lw.length - 2; i >= 0; i -= 2) {
        const c = lw[i], idx = lw[i + 1];
        const x = c.cx * 16 + (idx >> 11), y = idx & 127, z = c.cz * 16 + ((idx >> 7) & 15);
        const k = `${x},${y},${z}`;
        if (seen.has(k)) continue;
        seen.add(k);
        try {
            if (!ds.dim.isChunkLoaded({ x, y, z })) {
                keep.push(c, idx);
                continue;
            }
            ds.dim.setBlockPermutation({ x, y, z }, permutation(c.blocks[idx], c.meta[idx]));
        } catch {
            keep.push(c, idx);
        }
    }
    ds.gw.lateWrites = keep;
}

// A portal trip lands where Bedrock put (or found) a portal; writing the Beta chunk over it destroys it, so a
// portal like Beta's Teleporter makes (4x5 obsidian frame on a platform, air around) is built there afterwards.
function rebuildPortals(ds) {
    const keep = [];
    for (const a of ds.arrivals) {
        const cx = a.x >> 4, cz = a.z >> 4;
        if (!ds.placed.get(cx, cz) || !bedrockChunkLoaded(ds, cx, cz)) {
            keep.push(a);
            continue;
        }
        try {
            const dim = ds.dim;
            let found = false;
            for (let dx = -3; dx <= 3 && !found; dx++)
                for (let dy = -3; dy <= 3 && !found; dy++)
                    for (let dz = -3; dz <= 3 && !found; dz++)
                        if (dim.getBlock({ x: a.x + dx, y: a.y + dy, z: a.z + dz })?.typeId === 'minecraft:portal') found = true;
            if (found) continue;
            const y = Math.max(a.y, 2);
            const air = permutation(0, 0), obs = permutation(49, 0);
            dim.fillBlocks(new BlockVolume({ x: a.x - 1, y, z: a.z - 1 }, { x: a.x + 2, y: y + 3, z: a.z + 1 }), air);
            dim.fillBlocks(new BlockVolume({ x: a.x - 1, y: y - 1, z: a.z - 1 }, { x: a.x + 2, y: y - 1, z: a.z + 1 }), obs);
            for (let i = -1; i <= 2; i++) {
                dim.setBlockPermutation({ x: a.x + i, y: y - 1, z: a.z }, obs);
                dim.setBlockPermutation({ x: a.x + i, y: y + 3, z: a.z }, obs);
            }
            for (let j = 0; j < 3; j++) {
                dim.setBlockPermutation({ x: a.x - 1, y: y + j, z: a.z }, obs);
                dim.setBlockPermutation({ x: a.x + 2, y: y + j, z: a.z }, obs);
            }
            const portal = permutation(90, 0);
            for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) dim.setBlockPermutation({ x: a.x + i, y: y + j, z: a.z }, portal);
        } catch (e) {
            console.warn(`[B173] portal at ${a.x} ${a.y} ${a.z}: ${e}`);
        }
    }
    ds.arrivals = keep;
}

// ---- scheduling
function nextTask() {
    let best = null;
    let bestD = Infinity;
    for (const p of world.getAllPlayers()) {
        const ds = dims.get(p.dimension.id);
        if (!ds) continue;
        const pcx = Math.floor(p.location.x) >> 4, pcz = Math.floor(p.location.z) >> 4;
        for (let r = 0; r <= radius && r * r < bestD; r++) {
            for (let dx = -r; dx <= r; dx++)
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const d = dx * dx + dz * dz;
                    if (d >= bestD) continue;
                    const cx = pcx + dx, cz = pcz + dz;
                    if (ds.placed.get(cx, cz)) continue;
                    if (!bedrockChunkLoaded(ds, cx, cz)) continue;
                    best = [ds, cx, cz];
                    bestD = d;
                }
        }
    }
    return best;
}

// average real milliseconds per server tick, sampled every tick
let tickMs = 50;
let lastTickAt = 0;
function sampleTick() {
    const now = Date.now();
    if (lastTickAt) tickMs = tickMs * 0.9 + Math.min(now - lastTickAt, 1000) * 0.1;
    lastTickAt = now;
}

function* waitTicks(n) {
    const until = system.currentTick + n;
    do yield;
    while (system.currentTick < until);
}

// A slow server only spaces the writes out (it is never a reason to stop: the player would stay in the void).
function* worker() {
    for (;;) {
        if (!ready) {
            yield;
            continue;
        }
        let t = null;
        try {
            t = nextTask();
        } catch (e) {
            console.warn(`[B173] picking a chunk failed: ${e}\n${e?.stack ?? ''}`);
        }
        if (!t) {
            yield;
            continue;
        }
        const [ds, cx, cz] = t;
        try {
            yield* writeChunk(ds, cx, cz);
        } catch (e) {
            console.warn(`[B173] chunk ${cx},${cz} failed: ${e}\n${e?.stack ?? ''}`);
            ds.placed.set(cx, cz); // do not loop on a broken chunk
        }
        yield* waitTicks(tickMs > SLOW_TICK_MS ? SLOW_WAIT_TICKS : TICKS_BETWEEN_WRITES);
    }
}

// Every 10 s while a player stands in an unwritten chunk: everything that decides whether it gets written.
let lastChunks = -1;
function diagnose() {
    if (stats.chunks !== lastChunks) {
        lastChunks = stats.chunks;
        return;
    }
    for (const p of world.getAllPlayers()) {
        const ds = dims.get(p.dimension.id);
        if (!ds) continue;
        const cx = Math.floor(p.location.x) >> 4, cz = Math.floor(p.location.z) >> 4;
        if (ready && ds.placed.get(cx, cz)) continue;
        const at = { x: cx * 16 + 8, y: 64, z: cz * 16 + 8 };
        let loaded, block;
        try {
            loaded = ds.dim.isChunkLoaded(at);
        } catch (e) {
            loaded = `error ${e}`;
        }
        try {
            block = ds.dim.getBlock(at)?.typeId;
        } catch (e) {
            block = `error ${e}`;
        }
        let task;
        try {
            task = nextTask()?.slice(1).join(',') ?? 'none';
        } catch (e) {
            task = `error ${e}`;
        }
        console.warn(`[B173] waiting: ready ${ready}, seed ${seed}, ${p.dimension.id} at ${p.location.x.toFixed(1)} ${p.location.y.toFixed(1)} ` +
            `${p.location.z.toFixed(1)} (chunk ${cx},${cz}), isChunkLoaded ${loaded}, block ${block}, next ${task}, ` +
            `tick ${tickMs.toFixed(0)} ms, ${stats.chunks} chunks written`);
    }
}

// keep players out of chunks that are not written yet (they would fall into the void)
// Only the empty (void) overworld needs this: the nether and replaced terrain always have ground under the player.
// Players are left alone for a few seconds after changing dimension while the game moves them over.
function holdPlayers() {
    for (const p of world.getAllPlayers()) {
        if (p.dimension.id !== 'minecraft:overworld') continue;
        if (system.currentTick - (arrivedAt.get(p.id) ?? -1000) < 60) continue;
        const ds = dims.get(p.dimension.id);
        if (ds && ds.clear === true) continue;
        const cx = Math.floor(p.location.x) >> 4, cz = Math.floor(p.location.z) >> 4;
        const h = holds.get(p.id);
        if (!ready || !ds.placed.get(cx, cz)) {
            if (!h || h.dim !== p.dimension.id) holds.set(p.id, { ...p.location, dim: p.dimension.id });
            const at = holds.get(p.id);
            const l = p.location;
            if (Math.abs(l.x - at.x) + Math.abs(l.y - at.y) + Math.abs(l.z - at.z) > 0.3) p.teleport({ x: at.x, y: at.y, z: at.z });
            p.onScreenDisplay.setActionBar(seed === null ? 'Waiting for the Beta seed...' : 'Generating terrain...');
        } else if (h) {
            holds.delete(p.id);
            // released: make sure the player is not inside the new terrain
            let y = Math.floor(p.location.y);
            const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
            try {
                while (y < 127 && (!p.dimension.getBlock({ x, y, z })?.isAir || !p.dimension.getBlock({ x, y: y + 1, z })?.isAir)) y++;
                if (y !== Math.floor(p.location.y)) p.teleport({ x: p.location.x, y, z: p.location.z });
            } catch {}
        }
    }
}

function evict() {
    for (const ds of dims.values()) {
        const players = world.getAllPlayers().filter((p) => p.dimension.id === ds.dim.id);
        const keepR = radius + 6;
        for (const [k, c] of ds.gw.chunks) {
            let near = false;
            for (const p of players) {
                const pcx = Math.floor(p.location.x) >> 4, pcz = Math.floor(p.location.z) >> 4;
                if (Math.abs(c.cx - pcx) <= keepR && Math.abs(c.cz - pcz) <= keepR) {
                    near = true;
                    break;
                }
            }
            if (near) continue;
            ds.gw.chunks.delete(k);
            if (!c.placed) {
                // their populates wrote into this chunk; let them run again when it comes back
                for (const [px, pz] of [[c.cx - 1, c.cz - 1], [c.cx, c.cz - 1], [c.cx - 1, c.cz], [c.cx, c.cz]]) {
                    const o = ds.gw.chunks.get(px * 67108864 + pz);
                    if (o) o.populated = false;
                }
            }
        }
    }
}

// /b173:seed, /b173:radius, /b173:status (also as /scriptevent b173:<name>)
export function commandSeed(text) {
    if (seed === null && text) chooseSeed(text);
    else announce(`seed ${seed}`);
}

export function commandRadius(v) {
    if (v >= 2 && v <= 16) {
        radius = v;
        world.setDynamicProperty('b173:radius', v);
    }
    announce(`generation radius ${radius} chunks`);
}

export function commandStatus() {
    const avg = stats.chunks ? `${(stats.genMs / stats.chunks).toFixed(0)} ms gen, ${(stats.placeMs / stats.chunks).toFixed(0)} ms write` : 'no chunks yet';
    announce(`${stats.chunks} chunks written (${avg} per chunk, ${useStructures ? 'structures' : 'fills'}); ` +
        `tick ${tickMs.toFixed(0)} ms; radius ${radius}; spawn ${spawn ? `${spawn.x} ${spawn.y} ${spawn.z}` : '?'}`);
}

// for tools/simtest.mjs
export function debugState() {
    return { dims, seed, spawn, ready, holds, stats };
}

export function startGeneration() {
    const r = world.getDynamicProperty('b173:radius');
    if (typeof r === 'number') radius = r;
    const s = world.getDynamicProperty('b173:seed');
    if (typeof s === 'string') {
        seed = BigInt(s);
        initDims();
        const sp = world.getDynamicProperty('b173:spawn');
        if (sp && typeof sp === 'object') {
            spawn = sp;
            ready = true;
        } else {
            system.runJob(spawnJob());
        }
    }
    world.afterEvents.playerSpawn.subscribe((ev) => {
        if (seed === null) system.runTimeout(() => askSeed(ev.player), 20);
    });
    world.afterEvents.playerDimensionChange.subscribe((ev) => {
        holds.delete(ev.player.id);
        arrivedAt.set(ev.player.id, system.currentTick);
        const ds = dims.get(ev.toDimension.id);
        if (ds) {
            const l = ev.toLocation;
            ds.arrivals.push({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) });
        }
    });
    system.afterEvents.scriptEventReceive.subscribe((ev) => {
        if (ev.id === 'b173:seed') commandSeed(ev.message);
        else if (ev.id === 'b173:radius') commandRadius(parseInt(ev.message, 10));
        else if (ev.id === 'b173:status') commandStatus();
    });
    system.runInterval(holdPlayers, 2);
    system.runInterval(sampleTick, 1);
    system.runInterval(() => {
        for (const ds of dims.values()) {
            finishTiles(ds);
            flushLateWrites(ds);
            rebuildPortals(ds);
        }
    }, 10);
    system.runInterval(() => {
        for (const ds of dims.values()) {
            ds.placed.flush();
            ds.populated.flush();
        }
        evict();
        if (stats.chunks > 0 && stats.chunks % 50 === 0)
            console.warn(`[B173] ${stats.chunks} chunks: ${(stats.genMs / stats.chunks).toFixed(1)} ms gen, ${(stats.placeMs / stats.chunks).toFixed(1)} ms write per chunk, tick ${tickMs.toFixed(0)} ms`);
    }, 100);
    system.runInterval(() => {
        try {
            diagnose();
        } catch (e) {
            console.warn(`[B173] status failed: ${e}`);
        }
    }, 200);
    system.runJob(worker());
}
