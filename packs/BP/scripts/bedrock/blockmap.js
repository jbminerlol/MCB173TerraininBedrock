// Beta block id + metadata -> Bedrock block permutation (identifiers as of Bedrock 1.26.50).

import { BlockPermutation } from '@minecraft/server';

const WOOL = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
    'purple', 'blue', 'brown', 'green', 'red', 'black'];
const WOOD = ['oak', 'spruce', 'birch', 'oak'];
// Beta facings: pumpkins 0 S, 1 W, 2 N, 3 E; chests/furnaces/ladders 2 N, 3 S, 4 W, 5 E
const PUMPKIN_DIR = ['south', 'west', 'north', 'east'];
const SIDE_DIR = { 2: 'north', 3: 'south', 4: 'west', 5: 'east' };

// [name, states] for (id, meta)
export function bedrockBlock(id, m) {
    switch (id) {
        case 0: return ['minecraft:air'];
        case 1: return ['minecraft:stone'];
        case 2: return ['minecraft:grass_block'];
        case 3: return ['minecraft:dirt'];
        case 4: return ['minecraft:cobblestone'];
        case 5: return ['minecraft:oak_planks'];
        case 6: return [`minecraft:${WOOD[m & 3]}_sapling`];
        case 7: return ['minecraft:bedrock'];
        case 8: return ['minecraft:flowing_water', { liquid_depth: m & 15 }];
        case 9: return ['minecraft:water', { liquid_depth: m & 15 }];
        case 10: return ['minecraft:flowing_lava', { liquid_depth: m & 15 }];
        case 11: return ['minecraft:lava', { liquid_depth: m & 15 }];
        case 12: return ['minecraft:sand'];
        case 13: return ['minecraft:gravel'];
        case 14: return ['minecraft:gold_ore'];
        case 15: return ['minecraft:iron_ore'];
        case 16: return ['minecraft:coal_ore'];
        case 17: return [`minecraft:${WOOD[m & 3]}_log`, { pillar_axis: 'y' }];
        case 18: return [`minecraft:${WOOD[m & 3]}_leaves`, { persistent_bit: false, update_bit: (m & 8) !== 0 }];
        case 19: return ['minecraft:sponge'];
        case 20: return ['minecraft:glass'];
        case 21: return ['minecraft:lapis_ore'];
        case 22: return ['minecraft:lapis_block'];
        case 23: return ['minecraft:dispenser', { facing_direction: m & 7 }];
        case 24: return ['minecraft:sandstone'];
        case 25: return ['minecraft:noteblock'];
        case 30: return ['minecraft:web'];
        case 31: return [m === 1 ? 'minecraft:short_grass' : m === 2 ? 'minecraft:fern' : 'minecraft:deadbush'];
        case 32: return ['minecraft:deadbush'];
        case 35: return [`minecraft:${WOOL[m & 15]}_wool`];
        case 37: return ['minecraft:dandelion'];
        case 38: return ['minecraft:poppy'];
        case 39: return ['minecraft:brown_mushroom'];
        case 40: return ['minecraft:red_mushroom'];
        case 41: return ['minecraft:gold_block'];
        case 42: return ['minecraft:iron_block'];
        case 43: return ['minecraft:smooth_stone_double_slab'];
        case 44: return ['minecraft:smooth_stone_slab'];
        case 45: return ['minecraft:brick_block'];
        case 46: return ['minecraft:tnt'];
        case 47: return ['minecraft:bookshelf'];
        case 48: return ['minecraft:mossy_cobblestone'];
        case 49: return ['minecraft:obsidian'];
        case 50: return ['minecraft:torch'];
        case 51: return ['minecraft:fire', { age: m & 15 }];
        case 52: return ['minecraft:mob_spawner'];
        case 53: return ['minecraft:oak_stairs'];
        case 54: return ['minecraft:chest', { 'minecraft:cardinal_direction': SIDE_DIR[m] ?? 'north' }];
        case 55: return ['minecraft:redstone_wire'];
        case 56: return ['minecraft:diamond_ore'];
        case 57: return ['minecraft:diamond_block'];
        case 58: return ['minecraft:crafting_table'];
        case 59: return ['minecraft:wheat', { growth: m & 7 }];
        case 60: return ['minecraft:farmland'];
        case 61: return ['minecraft:furnace', { 'minecraft:cardinal_direction': SIDE_DIR[m] ?? 'north' }];
        case 62: return ['minecraft:lit_furnace', { 'minecraft:cardinal_direction': SIDE_DIR[m] ?? 'north' }];
        case 65: return ['minecraft:ladder', { facing_direction: m & 7 }];
        case 66: return ['minecraft:rail'];
        case 67: return ['minecraft:stone_stairs'];
        case 73: return ['minecraft:redstone_ore'];
        case 74: return ['minecraft:lit_redstone_ore'];
        case 78: return ['minecraft:snow_layer', { height: m & 7, covered_bit: false }];
        case 79: return ['minecraft:ice'];
        case 80: return ['minecraft:snow'];
        case 81: return ['minecraft:cactus', { age: m & 15 }];
        case 82: return ['minecraft:clay'];
        case 83: return ['minecraft:reeds', { age: m & 15 }];
        case 84: return ['minecraft:jukebox'];
        case 85: return ['minecraft:oak_fence'];
        case 86: return ['minecraft:pumpkin', { 'minecraft:cardinal_direction': PUMPKIN_DIR[m & 3] }];
        case 87: return ['minecraft:netherrack'];
        case 88: return ['minecraft:soul_sand'];
        case 89: return ['minecraft:glowstone'];
        case 90: return ['minecraft:portal', { portal_axis: 'x' }];
        case 91: return ['minecraft:lit_pumpkin', { 'minecraft:cardinal_direction': PUMPKIN_DIR[m & 3] }];
        default: return ['minecraft:stone'];
    }
}

// Every (id, meta) the generator can emit resolves once; a state the game rejects falls back to the plain block.
const cache = new Map();
const failed = new Set();

export function permutation(id, meta) {
    const k = (id << 4) | (meta & 15);
    let p = cache.get(k);
    if (p !== undefined) return p;
    const [name, states] = bedrockBlock(id, meta);
    try {
        p = BlockPermutation.resolve(name, states);
    } catch (e) {
        if (!failed.has(name)) {
            failed.add(name);
            console.warn(`[B173] block ${name} ${JSON.stringify(states ?? {})} rejected (${e}); using defaults`);
        }
        try {
            p = BlockPermutation.resolve(name);
        } catch {
            p = BlockPermutation.resolve('minecraft:stone');
        }
    }
    cache.set(k, p);
    return p;
}

// Bedrock identifiers for the dungeon loot items (Beta item id -> name, with damage where it matters)
export function bedrockItem(id, damage) {
    switch (id) {
        case 329: return 'minecraft:saddle';
        case 265: return 'minecraft:iron_ingot';
        case 297: return 'minecraft:bread';
        case 296: return 'minecraft:wheat';
        case 289: return 'minecraft:gunpowder';
        case 287: return 'minecraft:string';
        case 325: return 'minecraft:bucket';
        case 322: return 'minecraft:golden_apple';
        case 331: return 'minecraft:redstone';
        case 2256: return 'minecraft:music_disc_13';
        case 2257: return 'minecraft:music_disc_cat';
        case 351: return damage === 3 ? 'minecraft:cocoa_beans' : 'minecraft:ink_sac';
        default: return null;
    }
}

export const SPAWNER_STRUCTURE = {
    Skeleton: 'b173:spawner_skeleton',
    Zombie: 'b173:spawner_zombie',
    Spider: 'b173:spawner_spider',
    Pig: 'b173:spawner_pig',
};
