// Compares the JS generator (packs/BP/scripts/gen) with the real b1.7.3 generator run by tools/harness.
//
//   node tools/verify.mjs sin                         MathHelper sine table
//   node tools/verify.mjs raw <seed> cx,cz ...        unpopulated chunks
//   node tools/verify.mjs world <seed> <x0> <z0> <x1> <z1> [worldRandSeed] [dimension 0|-1]
//        populated rectangle, loaded in the same order as the harness
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SIN_TABLE_FOR_TEST } from '../packs/BP/scripts/gen/mathhelper.js';
import { Overworld } from '../packs/BP/scripts/gen/overworld.js';
import { Nether } from '../packs/BP/scripts/gen/nether.js';
import { GenWorld } from '../packs/BP/scripts/gen/world.js';
import { NAMES } from '../packs/BP/scripts/gen/blockdata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
const CP = [join(ROOT, 're/classes'), join(ROOT, 're/assets'), join(ROOT, 'tools/harness/build')].join(delimiter);
const TMP = join(tmpdir(), 'b173verify');
mkdirSync(TMP, { recursive: true });

function harness(args) {
    execFileSync(JAVA, ['-Xmx1G', '-cp', CP, 'Harness', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function readChunks(buf, off, count) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const out = [];
    for (let n = 0; n < count; n++) {
        const cx = dv.getInt32(off), cz = dv.getInt32(off + 4);
        const populated = buf[off + 8] === 1;
        off += 9;
        const blocks = buf.subarray(off, off + 32768); off += 32768;
        const meta = buf.subarray(off, off + 16384); off += 16384;
        const sky = buf.subarray(off, off + 16384); off += 16384;
        const height = buf.subarray(off, off + 256); off += 256;
        out.push({ cx, cz, populated, blocks, meta, sky, height });
    }
    return { chunks: out, off };
}

const nib = (arr, i) => (i & 1) === 0 ? arr[i >> 1] & 15 : (arr[i >> 1] >> 4) & 15;

function compareChunk(j, c, opts = {}) {
    const diffs = { blocks: 0, meta: 0, sky: 0, height: 0, samples: [] };
    for (let i = 0; i < 32768; i++) {
        const jb = j.blocks[i], cb = c.blocks[i];
        if (jb !== cb) {
            diffs.blocks++;
            if (diffs.samples.length < 12) {
                const x = i >> 11, z = (i >> 7) & 15, y = i & 127;
                diffs.samples.push(`(${c.cx * 16 + x},${y},${c.cz * 16 + z}) java=${jb}:${NAMES[jb] ?? jb} js=${cb}:${NAMES[cb] ?? cb}`);
            }
        } else if (opts.meta && nib(j.meta, i) !== c.meta[i]) {
            diffs.meta++;
            if (diffs.samples.length < 12) {
                const x = i >> 11, z = (i >> 7) & 15, y = i & 127;
                diffs.samples.push(`meta (${c.cx * 16 + x},${y},${c.cz * 16 + z}) id=${jb} java=${nib(j.meta, i)} js=${c.meta[i]}`);
            }
        }
        if (opts.sky && nib(j.sky, i) !== c.sky[i]) diffs.sky++;
    }
    for (let i = 0; i < 256; i++) if (j.height[i] !== c.height[i]) diffs.height++;
    return diffs;
}

const mode = process.argv[2];
if (mode === 'sin') {
    const p = join(TMP, 'sin.bin');
    harness(['sin', p]);
    const b = readFileSync(p);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let bad = 0;
    for (let i = 0; i < 65536; i++) if (dv.getFloat32(i * 4) !== SIN_TABLE_FOR_TEST[i]) bad++;
    console.log(`sin table mismatches: ${bad} / 65536`);
} else if (mode === 'raw') {
    const seed = BigInt(process.argv[3]);
    const list = process.argv.slice(4);
    const p = join(TMP, 'raw.bin');
    harness(['raw', seed.toString(), p, ...list]);
    const { chunks } = readChunks(readFileSync(p), 0, list.length);
    const gen = new Overworld(seed);
    const world = new GenWorld(seed, gen);
    let total = 0;
    for (const j of chunks) {
        const t0 = performance.now();
        const blocks = gen.provideChunk(world, j.cx, j.cz);
        const t1 = performance.now();
        const c = { cx: j.cx, cz: j.cz, blocks, meta: new Uint8Array(32768), sky: new Uint8Array(32768), height: new Uint8Array(256) };
        const d = compareChunk(j, c);
        total += d.blocks;
        console.log(`chunk ${j.cx},${j.cz}: ${d.blocks} block diffs (${(t1 - t0).toFixed(1)} ms)`);
        for (const s of d.samples) console.log('   ' + s);
    }
    console.log(total === 0 ? 'RAW OK' : `RAW FAIL (${total} diffs)`);
} else if (mode === 'world') {
    const seed = BigInt(process.argv[3]);
    const [x0, z0, x1, z1] = process.argv.slice(4, 8).map(Number);
    const wr = BigInt(process.argv[8] ?? '12345');
    const dim = Number(process.argv[9] ?? '0');
    const p = join(TMP, 'world.bin');
    harness(['world', seed.toString(), wr.toString(), String(x0), String(z0), String(x1), String(z1), p, String(dim)]);
    const buf = readFileSync(p);
    const count = new DataView(buf.buffer, buf.byteOffset).getInt32(0);
    const { chunks, off } = readChunks(buf, 4, count);
    const tlen = new DataView(buf.buffer, buf.byteOffset).getInt32(off);
    const tiles = buf.subarray(off + 4, off + 4 + tlen).toString('utf8').trim().split('\n').filter(Boolean);

    const gen = dim === -1 ? new Nether(seed) : new Overworld(seed);
    const world = new GenWorld(seed, gen, dim === -1 ? { worldRandSeed: wr, hasNoSky: true, isNether: true } : { worldRandSeed: wr });
    const t0 = performance.now();
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) world.getChunk(x, z);
    const t1 = performance.now();
    console.log(`js: ${world.chunks.size} chunks in ${(t1 - t0).toFixed(0)} ms; java: ${chunks.length} chunks`);
    let bad = 0, metaBad = 0, popBad = 0, missing = 0;
    for (const j of chunks) {
        const c = world.chunks.get(j.cx * 67108864 + j.cz);
        if (!c) {
            missing++;
            continue;
        }
        if (c.populated !== j.populated) popBad++;
        const d = compareChunk(j, c, { meta: true });
        bad += d.blocks;
        metaBad += d.meta;
        if (d.blocks || d.meta) {
            console.log(`chunk ${j.cx},${j.cz} (populated ${j.populated}): ${d.blocks} block, ${d.meta} meta, ${d.height} height diffs`);
            for (const s of d.samples) console.log('   ' + s);
        }
    }
    // tile entities
    const jsTiles = [];
    for (const c of world.chunks.values()) {
        for (const [i, t] of c.tiles) {
            const x = c.cx * 16 + (i >> 11), z = c.cz * 16 + ((i >> 7) & 15), y = i & 127;
            jsTiles.push(`${x} ${y} ${z} ${t.type === 'chest' ? t.items.map((s) => (s ? `${s[0]}:${s[1]}:${s[2]}` : '-')).join(' ') : t.mob}`);
        }
    }
    const javaTiles = tiles.map((l) => {
        const p = l.split(' ');
        let rest = p.slice(4).map((v) => (v.startsWith('s=') ? v.slice(2) : v));
        if (rest.length > 1) rest = rest.slice(0, 27); // TileEntityChest allocates 36 slots, uses 27
        return `${p[0]} ${p[1]} ${p[2]} ${rest.join(' ')}`;
    });
    const js = new Set(jsTiles), jv = new Set(javaTiles);
    const tileBad = [...jv].filter((t) => !js.has(t)).length + [...js].filter((t) => !jv.has(t)).length;
    if (tileBad) {
        console.log('tile entity differences:');
        for (const t of jv) if (!js.has(t)) console.log('  java only: ' + t);
        for (const t of js) if (!jv.has(t)) console.log('  js only:   ' + t);
    }
    console.log(`missing chunks ${missing}, populated-flag diffs ${popBad}, block diffs ${bad}, meta diffs ${metaBad}, tile diffs ${tileBad} (${javaTiles.length} tiles)`);
    console.log(bad === 0 && metaBad === 0 && missing === 0 && popBad === 0 && tileBad === 0 ? 'WORLD OK' : 'WORLD FAIL');
}
