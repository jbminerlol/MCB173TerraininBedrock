// Runs the behaviour pack's scripts against tools/mock (node --import ./tools/mock/loader.mjs tools/simtest.mjs)
// and checks that what lands in the mock world is exactly what the generator produced.
import { mock, world } from '@minecraft/server';
import { setMockFormAnswer } from '@minecraft/server-ui';
import { debugState } from '../packs/BP/scripts/bedrock/genmanager.js';
import { bedrockBlock } from '../packs/BP/scripts/bedrock/blockmap.js';
import { BlockPermutation } from '@minecraft/server';
import { GenWorld } from '../packs/BP/scripts/gen/world.js';

// Bedrock's script watchdog shuts the world down on a stack overflow, which it hit at 114 nested calls
// (b1.7.3's springs recurse once per block they flood). Sample the generator's call depth to keep it far below.
const MAX_DEPTH = 60;
let maxDepth = 0, depthCalls = 0;
const getBlockId = GenWorld.prototype.getBlockId;
GenWorld.prototype.getBlockId = function (x, y, z) {
    if ((++depthCalls & 255) === 0) {
        Error.stackTraceLimit = 1000;
        maxDepth = Math.max(maxDepth, new Error().stack.split('\n').length - 1);
        Error.stackTraceLimit = 10;
    }
    return getBlockId.call(this, x, y, z);
};

const seedText = process.argv[2] ?? null;
if (seedText !== null) setMockFormAnswer(seedText);
await import('../packs/BP/scripts/main.js');
world.afterEvents.worldLoad.fire({});
const p = mock.addPlayer('Steve', 'overworld', { x: 0.5, y: 80, z: 0.5 });
world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });

const t0 = performance.now();
let releasedAt = -1;
for (let t = 0; t < 4000; t++) {
    mock.tick(6);
    await Promise.resolve();
    const st = debugState();
    if (releasedAt < 0 && st.ready && !st.holds.has(p.id)) releasedAt = t;
    if (releasedAt >= 0 && t > releasedAt + 600) break;
}
const st = debugState();
console.log(`seed ${st.seed}, spawn ${JSON.stringify(st.spawn)}, released after ${releasedAt} ticks, player at ${JSON.stringify(p.location)}`);
console.log(`messages: ${mock.state.messages.join(' | ')}`);
const ds = st.dims.get('minecraft:overworld');
const dim = world.getDimension('overworld');
console.log(`chunks written ${st.stats.chunks}, structure places ${dim.calls.structures ?? 0}, fills ${dim.calls.fill}, single sets ${dim.calls.set}; wall ${(performance.now() - t0).toFixed(0)} ms`);
let bad = 0, checked = 0;
for (const c of ds.gw.chunks.values()) {
    if (!c.placed || !ds.placed.get(c.cx, c.cz)) continue;
    checked++;
    for (let i = 0; i < 32768; i++) {
        const x = c.cx * 16 + (i >> 11), y = i & 127, z = c.cz * 16 + ((i >> 7) & 15);
        const id = c.blocks[i];
        const want = id === 52 || id === 54 ? null : BlockPermutation.resolve(...bedrockBlock(id, c.meta[i])).key;
        const got = (dim.blocks.get(`${x},${y},${z}`) ?? BlockPermutation.resolve('minecraft:air')).key;
        if (want !== null && want !== got) {
            if (bad < 10) console.log(`  diff at ${x},${y},${z}: want ${want} got ${got}`);
            bad++;
        }
    }
}
console.log(`compared ${checked} written chunks: ${bad} differences; structures placed ${mock.state.structures.length}`);
// nether: arrive by portal into vanilla terrain, which every written Beta chunk must replace (air included)
const neth = world.getDimension('nether');
const basalt = BlockPermutation.resolve('minecraft:basalt');
for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) for (let y = 20; y < 110; y += 3) neth.blocks.set(`${x},${y},${z}`, basalt);
p.dimension = neth;
p.location = { x: 8.5, y: 70, z: 8.5 };
const tp0 = p.teleports;
world.afterEvents.playerDimensionChange.fire({ player: p, fromDimension: dim, toDimension: neth, fromLocation: { x: 0, y: 64, z: 0 }, toLocation: p.location });
for (let t = 0; t < 1500; t++) {
    mock.tick(6);
    await Promise.resolve();
}
const nds = st.dims.get('minecraft:nether');
let nbad = 0, nchecked = 0;
for (const c of nds.gw.chunks.values()) {
    if (!c.placed || !nds.placed.get(c.cx, c.cz)) continue;
    nchecked++;
    for (let i = 0; i < 32768; i++) {
        const x = c.cx * 16 + (i >> 11), y = i & 127, z = c.cz * 16 + ((i >> 7) & 15);
        const want = BlockPermutation.resolve(...bedrockBlock(c.blocks[i], c.meta[i])).key;
        const got = (neth.blocks.get(`${x},${y},${z}`) ?? BlockPermutation.resolve('minecraft:air')).key;
        // the rebuilt arrival portal is the one allowed difference
        if (want !== got && !(Math.abs(x - 8) <= 3 && Math.abs(z - 8) <= 3 && y >= 68 && y <= 74)) {
            if (nbad < 5) console.log(`  nether diff at ${x},${y},${z}: want ${want} got ${got}`);
            nbad++;
        }
    }
}
const portal = [...neth.blocks.values()].filter((b) => b.type === 'minecraft:portal').length;
console.log(`nether: compared ${nchecked} written chunks, ${nbad} differences, portal blocks ${portal}, hold teleports ${p.teleports - tp0}`);
const netherOk = nchecked > 0 && nbad === 0 && portal === 6 && p.teleports === tp0;
console.log(`deepest generator call stack: ${maxDepth} frames (limit ${MAX_DEPTH})`);
console.log(bad === 0 && checked > 0 && netherOk && maxDepth <= MAX_DEPTH ? 'SIM OK' : 'SIM FAIL');
