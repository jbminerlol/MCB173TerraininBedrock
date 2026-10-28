// Beta 1.7.3 gameplay on top of Bedrock:
//  - no hunger: the bar is hidden (resource pack) and held at 6, which also disables sprinting; no natural regen
//  - food is eaten instantly on use and heals like ItemFood (half-hearts), cake slices heal 3
//  - no experience orbs; no baby zombies, wandering traders, phantoms or bats
//  - hitting a sheep knocks 1-3 wool off it (EntitySheep.attackEntityFrom)
//  - the bow fires at once on click, like ItemBow
//  - animals are not bred
//  - wolves spawn in Beta forests / taigas and slimes in Beta slime chunks below y 16 (the void-flat world has a
//    single Bedrock biome, so these two are placed by script using the Beta biome and slime-chunk rules)

import { world, system, ItemStack, EntityComponentTypes, GameMode } from '@minecraft/server';
import { JavaRandom, lmul } from '../gen/random.js';
import { BIOME } from '../gen/biomes.js';

const FOOD = {
    'minecraft:apple': 4,
    'minecraft:bread': 5,
    'minecraft:porkchop': 3,
    'minecraft:cooked_porkchop': 8,
    'minecraft:cod': 2,
    'minecraft:cooked_cod': 5,
    'minecraft:golden_apple': 42,
    'minecraft:mushroom_stew': 10,
    'minecraft:cookie': 1,
};
const BREEDING = {
    'minecraft:cow': ['minecraft:wheat'],
    'minecraft:sheep': ['minecraft:wheat'],
    'minecraft:pig': ['minecraft:carrot', 'minecraft:potato', 'minecraft:beetroot'],
    'minecraft:chicken': ['minecraft:wheat_seeds', 'minecraft:pumpkin_seeds', 'minecraft:melon_seeds', 'minecraft:beetroot_seeds'],
};
const WOOL = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
    'purple', 'blue', 'brown', 'green', 'red', 'black'];
const REMOVE_ON_SPAWN = new Set(['minecraft:xp_orb', 'minecraft:wandering_trader', 'minecraft:trader_llama',
    'minecraft:phantom', 'minecraft:bat']);

const rand = Math.random;
let getState = () => null;

function survival(p) {
    try {
        const m = p.getGameMode();
        return m === GameMode.Survival || m === GameMode.Adventure || m === 'Survival' || m === 'Adventure';
    } catch {
        return true;
    }
}

function heal(p, amount) {
    const h = p.getComponent(EntityComponentTypes?.Health ?? 'minecraft:health');
    if (!h) return;
    h.setCurrentValue(Math.min(h.effectiveMax ?? h.defaultValue ?? 20, h.currentValue + amount));
}

function useUpHeldItem(p, replaceWith) {
    const inv = p.getComponent('minecraft:inventory')?.container;
    if (!inv) return;
    const slot = p.selectedSlotIndex;
    const it = inv.getItem(slot);
    if (!it) return;
    if (it.amount > 1) {
        it.amount -= 1;
        inv.setItem(slot, it);
    } else {
        inv.setItem(slot, replaceWith ? new ItemStack(replaceWith, 1) : undefined);
    }
}

function takeArrow(p) {
    const inv = p.getComponent('minecraft:inventory')?.container;
    if (!inv) return false;
    for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        if (it?.typeId === 'minecraft:arrow') {
            if (it.amount > 1) {
                it.amount -= 1;
                inv.setItem(i, it);
            } else {
                inv.setItem(i, undefined);
            }
            return true;
        }
    }
    return false;
}

// ItemBow (b1.7.3): EntityArrow(world, player) with setArrowHeading(..., 1.5F, 1.0F)
function shootArrow(p) {
    if (survival(p) && !takeArrow(p)) return;
    const head = p.getHeadLocation();
    const d = p.getViewDirection();
    const arrow = p.dimension.spawnEntity('minecraft:arrow', { x: head.x + d.x * 0.5, y: head.y - 0.1 + d.y * 0.5, z: head.z + d.z * 0.5 });
    const proj = arrow.getComponent('minecraft:projectile');
    if (proj) {
        proj.owner = p;
        const s = 1.5;
        const spread = 0.0075;
        const g = () => (rand() + rand() + rand() - 1.5) * spread * 1.0;
        const len = Math.hypot(d.x, d.y, d.z) || 1;
        proj.shoot({ x: (d.x / len + g()) * s, y: (d.y / len + g()) * s, z: (d.z / len + g()) * s });
    }
    p.dimension.playSound('random.bow', head, { pitch: 1 / (rand() * 0.4 + 0.8), volume: 1 });
}

// EntitySlime.getCanSpawnHere: the chunk's Random(987234911) says 1 in 10 chunks
export function isSlimeChunk(seed, cx, cz) {
    const s = BigInt(seed) + BigInt(Math.imul(Math.imul(cx, cx), 4987142)) + BigInt(Math.imul(cx, 5947611)) +
        lmul(Math.imul(cz, cz), 4392871n) + BigInt(Math.imul(cz, 389711));
    return new JavaRandom(BigInt.asIntN(64, s) ^ 987234911n).nextInt(10) === 0;
}

function topSolid(dim, x, z) {
    for (let y = 127; y > 0; y--) {
        const b = dim.getBlock({ x, y, z });
        if (b && !b.isAir && !b.isLiquid) return { block: b, y };
    }
    return null;
}

function countNear(dim, type, loc, r) {
    return dim.getEntities({ type, location: loc, maxDistance: r }).length;
}

// Beta's creature list for forests and taigas includes wolves (weight 2 of 42); packs of up to 4
function spawnWolves(p, state) {
    const ow = state.dims.get('minecraft:overworld');
    if (!ow || p.dimension.id !== 'minecraft:overworld') return;
    if (countNear(p.dimension, 'minecraft:wolf', p.location, 64) >= 4) return;
    if (rand() > 0.35) return;
    const ang = rand() * Math.PI * 2, dist = 24 + rand() * 24;
    const x = Math.floor(p.location.x + Math.cos(ang) * dist), z = Math.floor(p.location.z + Math.sin(ang) * dist);
    const bio = ow.gw.generator.biomeSource.getBiomeGenAt(x, z);
    if (bio !== BIOME.forest && bio !== BIOME.taiga) return;
    if (!p.dimension.isChunkLoaded({ x, y: 64, z })) return;
    const top = topSolid(p.dimension, x, z);
    if (!top || top.block.typeId !== 'minecraft:grass_block') return;
    const n = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
        const wx = x + Math.floor(rand() * 6) - Math.floor(rand() * 6), wz = z + Math.floor(rand() * 6) - Math.floor(rand() * 6);
        const t = topSolid(p.dimension, wx, wz);
        if (t && t.block.typeId === 'minecraft:grass_block') p.dimension.spawnEntity('minecraft:wolf', { x: wx + 0.5, y: t.y + 1, z: wz + 0.5 });
    }
}

// slimes: the monster list's slime entry, which only succeeds in slime chunks below y 16
function spawnSlimes(p, state) {
    if (p.dimension.id !== 'minecraft:overworld' || state.seed === null) return;
    if (world.getDifficulty?.() === 'Peaceful') return;
    if (countNear(p.dimension, 'minecraft:slime', p.location, 64) >= 4) return;
    const ang = rand() * Math.PI * 2, dist = 24 + rand() * 40;
    const x = Math.floor(p.location.x + Math.cos(ang) * dist), z = Math.floor(p.location.z + Math.sin(ang) * dist);
    if (!isSlimeChunk(state.seed, x >> 4, z >> 4)) return;
    if (rand() > 0.1) return;
    const y = 1 + Math.floor(rand() * 15);
    if (!p.dimension.isChunkLoaded({ x, y, z })) return;
    const at = p.dimension.getBlock({ x, y, z }), up = p.dimension.getBlock({ x, y: y + 1, z }), below = p.dimension.getBlock({ x, y: y - 1, z });
    if (!at?.isAir || !up?.isAir || !below || below.isAir || below.isLiquid) return;
    if (p.dimension.getLightLevel?.({ x, y, z }) > 7) return;
    p.dimension.spawnEntity('minecraft:slime', { x: x + 0.5, y, z: z + 0.5 });
}

export function startMechanics(stateGetter) {
    getState = stateGetter;
    try {
        world.gameRules.naturalRegeneration = false;
        world.gameRules.doInsomnia = false;
    } catch {}

    // food and the bow act on the click, like Beta's onItemRightClick
    world.beforeEvents.itemUse.subscribe((ev) => {
        const id = ev.itemStack?.typeId;
        const p = ev.source;
        if (FOOD[id] !== undefined) {
            ev.cancel = true;
            system.run(() => {
                heal(p, FOOD[id]);
                if (survival(p)) useUpHeldItem(p, id === 'minecraft:mushroom_stew' ? 'minecraft:bowl' : null);
            });
        } else if (id === 'minecraft:bow') {
            ev.cancel = true;
            system.run(() => shootArrow(p));
        }
    });

    world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
        if (ev.block.typeId !== 'minecraft:cake' || !ev.isFirstEvent) return;
        ev.cancel = true;
        const b = ev.block, p = ev.player;
        system.run(() => {
            heal(p, 3);
            const bites = (b.permutation.getState('bite_counter') ?? 0) + 1;
            if (bites >= 6) b.setType('minecraft:air');
            else b.setPermutation(b.permutation.withState('bite_counter', bites));
        });
    });

    world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
        const feed = BREEDING[ev.target.typeId];
        if (feed && feed.includes(ev.itemStack?.typeId)) ev.cancel = true;
        if (ev.target.typeId === 'minecraft:wolf' && ev.itemStack && /porkchop|beef|chicken|mutton|rabbit|rotten_flesh/.test(ev.itemStack.typeId)) {
            const h = ev.target.getComponent('minecraft:health');
            if (h && h.currentValue >= h.effectiveMax) ev.cancel = true; // Beta wolves only heal on meat
        }
    });

    world.afterEvents.entitySpawn.subscribe((ev) => {
        const e = ev.entity;
        if (!e?.isValid) return;
        if (REMOVE_ON_SPAWN.has(e.typeId)) {
            e.remove();
            return;
        }
        if (e.typeId === 'minecraft:zombie' || e.typeId === 'minecraft:zombie_pigman' || e.typeId === 'minecraft:zombified_piglin') {
            if (e.getComponent('minecraft:is_baby')) e.remove();
        }
    });

    world.afterEvents.entityHurt.subscribe((ev) => {
        const s = ev.hurtEntity;
        if (s?.typeId !== 'minecraft:sheep' || !s.isValid) return;
        const by = ev.damageSource.damagingEntity;
        if (!by) return;
        if (s.getComponent('minecraft:is_sheared') || s.getComponent('minecraft:is_baby')) return;
        const colour = WOOL[s.getComponent('minecraft:color')?.value ?? 0] ?? 'white';
        const n = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) s.dimension.spawnItem(new ItemStack(`minecraft:${colour}_wool`, 1), { x: s.location.x, y: s.location.y + 1, z: s.location.z });
        s.triggerEvent('minecraft:on_sheared');
    });

    // hunger held at 6: no sprinting, no regeneration, never starving
    system.runInterval(() => {
        for (const p of world.getAllPlayers()) {
            const h = p.getComponent('minecraft:player.hunger');
            if (h && h.currentValue !== 6) h.setCurrentValue(6);
            const s = p.getComponent('minecraft:player.saturation');
            if (s && s.currentValue !== 0) s.setCurrentValue(0);
        }
    }, 10);

    system.runInterval(() => {
        const state = getState();
        if (!state?.ready) return;
        for (const p of world.getAllPlayers()) {
            try {
                spawnWolves(p, state);
                spawnSlimes(p, state);
            } catch (e) {
                console.warn(`[B173] spawner: ${e}`);
            }
        }
    }, 200);
}
