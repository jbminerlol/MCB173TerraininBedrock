// Block callbacks that b1.7.3 world generation can trigger: onBlockAdded, onBlockRemoval,
// onNeighborBlockChange, scheduled ticks (liquids, sand), canBlockStay checks, and the world.rand draws
// made by dropBlockAsItem (they keep later lava-spring flow in step with the original).
// added / neighborChanged / tick are generators: each world write or nested callback is yielded to GenWorld.run.
// removed and canStay are plain functions (they never set blocks).

import { MAT, MATERIAL, MAT_SOLID, MAT_BLOCKS_MOVEMENT, MAT_REPLACEABLE, OPAQUE_CUBE, IS_OPAQUE_CUBE } from './blockdata.js';

export const B = {
    stone: 1, grass: 2, dirt: 3, cobblestone: 4, sapling: 6, bedrock: 7, waterFlowing: 8, water: 9,
    lavaFlowing: 10, lava: 11, sand: 12, gravel: 13, goldOre: 14, ironOre: 15, coalOre: 16, log: 17, leaves: 18,
    lapisOre: 21, sandstone: 24, tallGrass: 31, deadBush: 32, dandelion: 37, rose: 38, brownMushroom: 39,
    redMushroom: 40, mossyCobblestone: 48, obsidian: 49, fire: 51, spawner: 52, chest: 54, diamondOre: 56,
    farmland: 60, signPost: 63, woodDoor: 64, ladder: 65, wallSign: 68, ironDoor: 71, redstoneOre: 73,
    snowLayer: 78, ice: 79, snow: 80, cactus: 81, clay: 82, reed: 83, pumpkin: 86, netherrack: 87, soulSand: 88,
    glowstone: 89, portal: 90,
};

export const behaviour = new Array(256).fill(null);

const matAt = (w, x, y, z) => w.getMaterial(x, y, z);

// ---- drops (uu.a(fd, x, y, z, meta, 1.0F)): only the world.rand draws matter here
const quantityDropped = new Array(256).fill(null);
const idDropped = new Array(256).fill(null);
quantityDropped[B.leaves] = (r) => (r.nextInt(20) === 0 ? 1 : 0);
quantityDropped[B.snowLayer] = () => 0;
idDropped[B.tallGrass] = (m, r) => (r.nextInt(8) === 0 ? 295 : -1);
idDropped[B.deadBush] = () => -1;
idDropped[B.gravel] = (m, r) => (r.nextInt(10) === 0 ? 318 : B.gravel);

export function dropBlockAsItem(w, id, x, y, z, meta) {
    const r = w.rand;
    const n = quantityDropped[id] ? quantityDropped[id](r) : 1;
    for (let i = 0; i < n; i++) {
        r.nextFloat(); // chance roll against 1.0F
        const d = idDropped[id] ? idDropped[id](meta, r) : id;
        if (d > 0) {
            r.nextFloat();
            r.nextFloat();
            r.nextFloat();
        }
    }
}

// ---- liquids: BlockFluid (rp), BlockFlowing (om), BlockStationary (nx)
function fluid(flowingId, stationaryId, material) {
    const isLava = material === MAT.lava;
    const tickRate = isLava ? 30 : 5;

    // rp.h
    const flowDecay = (w, x, y, z) => (matAt(w, x, y, z) === material ? w.getBlockMetadata(x, y, z) : -1);

    // rp.i: the fizz sound pitch draws two floats from world.rand
    const mixEffects = (w) => {
        w.rand.nextFloat();
        w.rand.nextFloat();
    };

    // rp.j: lava touching water hardens
    const checkForHarden = function* (w, x, y, z, selfId) {
        if (w.getBlockId(x, y, z) !== selfId) return;
        if (!isLava) return;
        const touching = matAt(w, x, y, z - 1) === MAT.water || matAt(w, x, y, z + 1) === MAT.water ||
            matAt(w, x - 1, y, z) === MAT.water || matAt(w, x + 1, y, z) === MAT.water ||
            matAt(w, x, y + 1, z) === MAT.water;
        if (!touching) return;
        const m = w.getBlockMetadata(x, y, z);
        if (m === 0) yield w.gSetBlockWithNotify(x, y, z, B.obsidian);
        else if (m <= 4) yield w.gSetBlockWithNotify(x, y, z, B.cobblestone);
        mixEffects(w);
    };

    // BlockFlowing keeps these on the Block instance, so re-entrant ticks share them (as in the original)
    const st = { adjacentSources: 0, optimal: [false, false, false, false], cost: [0, 0, 0, 0] };

    // om.l
    const blocksFlow = (w, x, y, z) => {
        const id = w.getBlockId(x, y, z);
        if (id === B.woodDoor || id === B.ironDoor || id === B.signPost || id === B.ladder || id === B.reed) return true;
        if (id === 0) return false;
        return MAT_BLOCKS_MOVEMENT[MATERIAL[id]] === 1;
    };

    // om.m
    const canDisplace = (w, x, y, z) => {
        const m = matAt(w, x, y, z);
        if (m === material) return false;
        if (m === MAT.lava) return false;
        return !blocksFlow(w, x, y, z);
    };

    // om.f
    const smallestFlowDecay = (w, x, y, z, cur) => {
        let d = flowDecay(w, x, y, z);
        if (d < 0) return cur;
        if (d === 0) st.adjacentSources++;
        if (d >= 8) d = 0;
        return cur >= 0 && d >= cur ? cur : d;
    };

    // om.b
    const flowCost = (w, x, y, z, dist, from) => {
        let best = 1000;
        for (let dir = 0; dir < 4; dir++) {
            if ((dir === 0 && from === 1) || (dir === 1 && from === 0) || (dir === 2 && from === 3) || (dir === 3 && from === 2)) continue;
            let nx = x, nz = z;
            if (dir === 0) nx--;
            if (dir === 1) nx++;
            if (dir === 2) nz--;
            if (dir === 3) nz++;
            if (blocksFlow(w, nx, y, nz)) continue;
            if (matAt(w, nx, y, nz) === material && w.getBlockMetadata(nx, y, nz) === 0) continue;
            if (!blocksFlow(w, nx, y - 1, nz)) return dist;
            if (dist < 4) {
                const c = flowCost(w, nx, y, nz, dist + 1, dir);
                if (c < best) best = c;
            }
        }
        return best;
    };

    // om.k
    const optimalDirections = (w, x, y, z) => {
        for (let dir = 0; dir < 4; dir++) {
            st.cost[dir] = 1000;
            let nx = x, nz = z;
            if (dir === 0) nx--;
            if (dir === 1) nx++;
            if (dir === 2) nz--;
            if (dir === 3) nz++;
            if (blocksFlow(w, nx, y, nz)) continue;
            if (matAt(w, nx, y, nz) === material && w.getBlockMetadata(nx, y, nz) === 0) continue;
            if (!blocksFlow(w, nx, y - 1, nz)) st.cost[dir] = 0;
            else st.cost[dir] = flowCost(w, nx, y, nz, 1, dir);
        }
        let min = st.cost[0];
        for (let dir = 1; dir < 4; dir++) if (st.cost[dir] < min) min = st.cost[dir];
        for (let dir = 0; dir < 4; dir++) st.optimal[dir] = st.cost[dir] === min;
        return st.optimal;
    };

    // om.h
    const flowInto = function* (w, x, y, z, decay) {
        if (!canDisplace(w, x, y, z)) return;
        const id = w.getBlockId(x, y, z);
        if (id > 0) {
            if (isLava) mixEffects(w);
            else dropBlockAsItem(w, id, x, y, z, w.getBlockMetadata(x, y, z));
        }
        yield w.gSetBlockAndMetadataWithNotify(x, y, z, flowingId, decay);
    };

    // om.j: become stationary
    const updateFlow = function* (w, x, y, z) {
        const m = w.getBlockMetadata(x, y, z);
        yield w.gSetBlockAndMetadata(x, y, z, stationaryId, m);
    };

    // om.a
    const tick = function* (w, x, y, z, rand) {
        let decay = flowDecay(w, x, y, z);
        const step = isLava && !w.isNether ? 2 : 1;
        let settle = true;
        if (decay > 0) {
            let smallest = -100;
            st.adjacentSources = 0;
            smallest = smallestFlowDecay(w, x - 1, y, z, smallest);
            smallest = smallestFlowDecay(w, x + 1, y, z, smallest);
            smallest = smallestFlowDecay(w, x, y, z - 1, smallest);
            smallest = smallestFlowDecay(w, x, y, z + 1, smallest);
            let nd = smallest + step;
            if (nd >= 8 || smallest < 0) nd = -1;
            if (flowDecay(w, x, y + 1, z) >= 0) {
                const above = flowDecay(w, x, y + 1, z);
                nd = above >= 8 ? above : above + 8;
            }
            if (st.adjacentSources >= 2 && material === MAT.water) {
                if (MAT_SOLID[matAt(w, x, y - 1, z)]) nd = 0;
                else if (matAt(w, x, y - 1, z) === material && w.getBlockMetadata(x, y - 1, z) === 0) nd = 0;
            }
            if (isLava && decay < 8 && nd < 8 && nd > decay && rand.nextInt(4) !== 0) {
                nd = decay;
                settle = false;
            }
            if (nd !== decay) {
                decay = nd;
                if (decay < 0) {
                    yield w.gSetBlockWithNotify(x, y, z, 0);
                } else {
                    yield w.gSetBlockMetadataWithNotify(x, y, z, decay);
                    yield w.gScheduleBlockUpdate(x, y, z, flowingId, tickRate);
                    yield w.gNotifyBlocksOfNeighborChange(x, y, z, flowingId);
                }
            } else if (settle) {
                yield updateFlow(w, x, y, z);
            }
        } else {
            yield updateFlow(w, x, y, z);
        }
        if (canDisplace(w, x, y - 1, z)) {
            if (decay >= 8) yield w.gSetBlockAndMetadataWithNotify(x, y - 1, z, flowingId, decay);
            else yield w.gSetBlockAndMetadataWithNotify(x, y - 1, z, flowingId, decay + 8);
        } else if (decay >= 0 && (decay === 0 || blocksFlow(w, x, y - 1, z))) {
            const dirs = optimalDirections(w, x, y, z);
            let nd = decay + step;
            if (decay >= 8) nd = 1;
            if (nd >= 8) return;
            // dirs is the shared array: a nested tick can change the later entries, as in the original
            if (dirs[0]) yield flowInto(w, x - 1, y, z, nd);
            if (dirs[1]) yield flowInto(w, x + 1, y, z, nd);
            if (dirs[2]) yield flowInto(w, x, y, z - 1, nd);
            if (dirs[3]) yield flowInto(w, x, y, z + 1, nd);
        }
    };

    behaviour[flowingId] = {
        *added(w, x, y, z) {
            yield checkForHarden(w, x, y, z, flowingId);
            if (w.getBlockId(x, y, z) === flowingId) yield w.gScheduleBlockUpdate(x, y, z, flowingId, tickRate);
        },
        *neighborChanged(w, x, y, z) {
            yield checkForHarden(w, x, y, z, flowingId);
        },
        tick,
    };
    behaviour[stationaryId] = {
        *added(w, x, y, z) {
            yield checkForHarden(w, x, y, z, stationaryId);
        },
        *neighborChanged(w, x, y, z) {
            yield checkForHarden(w, x, y, z, stationaryId);
            if (w.getBlockId(x, y, z) !== stationaryId) return;
            // nx.j: set not stationary
            const m = w.getBlockMetadata(x, y, z);
            w.editing = true;
            yield w.gSetBlockAndMetadata(x, y, z, flowingId, m);
            yield w.gScheduleBlockUpdate(x, y, z, flowingId, tickRate);
            w.editing = false;
        },
    };
}
fluid(B.waterFlowing, B.water, MAT.water);
fluid(B.lavaFlowing, B.lava, MAT.lava);

// ---- falling blocks: BlockSand (gk) / BlockGravel (ne)
// gk.c_: can fall into
export function canFallBelow(w, x, y, z) {
    const id = w.getBlockId(x, y, z);
    if (id === 0 || id === B.fire) return true;
    const m = MATERIAL[id];
    return m === MAT.water || m === MAT.lava;
}

function sand(id) {
    behaviour[id] = {
        *added(w, x, y, z) {
            yield w.gScheduleBlockUpdate(x, y, z, id, 3);
        },
        *neighborChanged(w, x, y, z) {
            yield w.gScheduleBlockUpdate(x, y, z, id, 3);
        },
        *tick(w, x, y, z) {
            if (!canFallBelow(w, x, y - 1, z) || y < 0) return;
            if (!w.fallInstantly && w.checkChunksExist(x - 32, y - 32, z - 32, x + 32, y + 32, z + 32)) {
                w.fallingBlocks?.push([x, y, z, id]); // an EntityFallingSand in the original
                return;
            }
            yield w.gSetBlockWithNotify(x, y, z, 0);
            while (canFallBelow(w, x, y - 1, z) && y > 0) y--;
            if (y > 0) yield w.gSetBlockWithNotify(x, y, z, id);
        },
    };
}
sand(B.sand);
sand(B.gravel);

// ---- leaves (bk.b): flag neighbouring leaves for a decay check
behaviour[B.leaves] = {
    removed(w, x, y, z) {
        if (!w.checkChunksExist(x - 2, y - 2, z - 2, x + 2, y + 2, z + 2)) return;
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dz = -1; dz <= 1; dz++) {
                    if (w.getBlockId(x + dx, y + dy, z + dz) === B.leaves) {
                        const m = w.getBlockMetadata(x + dx, y + dy, z + dz);
                        w.setBlockMetadata(x + dx, y + dy, z + dz, m | 8);
                    }
                }
    },
};

// ---- plants: BlockFlower (wb) and subclasses
function plant(id, canGrowOn, canStay) {
    const stay = canStay ?? ((w, x, y, z) =>
        (w.getFullBlockLightValue(x, y, z) >= 8 || w.canBlockSeeTheSky(x, y, z)) && canGrowOn(w.getBlockId(x, y - 1, z)));
    behaviour[id] = {
        canStay: stay,
        *neighborChanged(w, x, y, z) {
            if (!stay(w, x, y, z)) {
                dropBlockAsItem(w, id, x, y, z, w.getBlockMetadata(x, y, z));
                yield w.gSetBlockWithNotify(x, y, z, 0);
            }
        },
    };
}
const flowerSoil = (b) => b === B.grass || b === B.dirt || b === B.farmland;
plant(B.dandelion, flowerSoil);
plant(B.rose, flowerSoil);
plant(B.tallGrass, flowerSoil);
plant(B.deadBush, (b) => b === B.sand);
for (const id of [B.brownMushroom, B.redMushroom]) {
    plant(id, null, (w, x, y, z) =>
        y >= 0 && y < 128 && w.getFullBlockLightValue(x, y, z) < 13 && OPAQUE_CUBE[w.getBlockId(x, y - 1, z)] === 1);
}

// ri: sugar cane
function reedCanStay(w, x, y, z) {
    const below = w.getBlockId(x, y - 1, z);
    if (below === B.reed) return true;
    if (below !== B.grass && below !== B.dirt) return false;
    return matAt(w, x - 1, y - 1, z) === MAT.water || matAt(w, x + 1, y - 1, z) === MAT.water ||
        matAt(w, x, y - 1, z - 1) === MAT.water || matAt(w, x, y - 1, z + 1) === MAT.water;
}
behaviour[B.reed] = {
    canStay: reedCanStay,
    *neighborChanged(w, x, y, z) {
        if (!reedCanStay(w, x, y, z)) {
            dropBlockAsItem(w, B.reed, x, y, z, w.getBlockMetadata(x, y, z));
            yield w.gSetBlockWithNotify(x, y, z, 0);
        }
    },
};

// or: cactus
function cactusCanStay(w, x, y, z) {
    if (MAT_SOLID[matAt(w, x - 1, y, z)]) return false;
    if (MAT_SOLID[matAt(w, x + 1, y, z)]) return false;
    if (MAT_SOLID[matAt(w, x, y, z - 1)]) return false;
    if (MAT_SOLID[matAt(w, x, y, z + 1)]) return false;
    const below = w.getBlockId(x, y - 1, z);
    return below === B.cactus || below === B.sand;
}
behaviour[B.cactus] = {
    canStay: cactusCanStay,
    *neighborChanged(w, x, y, z) {
        if (!cactusCanStay(w, x, y, z)) {
            dropBlockAsItem(w, B.cactus, x, y, z, w.getBlockMetadata(x, y, z));
            yield w.gSetBlockWithNotify(x, y, z, 0);
        }
    },
};

// jr: snow layer
behaviour[B.snowLayer] = {
    *neighborChanged(w, x, y, z) {
        const below = w.getBlockId(x, y - 1, z);
        const ok = below !== 0 && IS_OPAQUE_CUBE[below] === 1 && MAT_BLOCKS_MOVEMENT[matAt(w, x, y - 1, z)] === 1;
        if (!ok) {
            dropBlockAsItem(w, B.snowLayer, x, y, z, w.getBlockMetadata(x, y, z));
            yield w.gSetBlockWithNotify(x, y, z, 0);
        }
    },
};

// fc.a: pumpkin placement
export function pumpkinCanPlace(w, x, y, z) {
    const id = w.getBlockId(x, y, z);
    return (id === 0 || MAT_REPLACEABLE[MATERIAL[id]] === 1) && w.isBlockNormalCube(x, y - 1, z);
}

// containers (rw): tile entity created on add, removed on removal
function container(id, make) {
    behaviour[id] = {
        *added(w, x, y, z) {
            w.setTile(x, y, z, make());
        },
        removed(w, x, y, z) {
            w.removeTile(x, y, z);
        },
    };
}
container(B.chest, () => ({ type: 'chest', items: new Array(27).fill(null) }));
container(B.spawner, () => ({ type: 'spawner', mob: 'Pig' }));
