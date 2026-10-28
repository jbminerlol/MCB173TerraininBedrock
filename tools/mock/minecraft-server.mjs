// A small in-memory stand-in for @minecraft/server (2.x), enough to run the add-on's scripts under Node:
// blocks per dimension, dynamic properties, players, events, runInterval/runTimeout/runJob driven by tick().

export class BlockPermutation {
    constructor(type, states) {
        this.type = type;
        this.states = states ?? {};
        this.key = type + (states && Object.keys(states).length ? JSON.stringify(states) : '');
    }
    static resolve(type, states) {
        if (!type.startsWith('minecraft:')) throw new Error(`unknown block ${type}`);
        return new BlockPermutation(type, states);
    }
}

export class BlockVolume {
    constructor(from, to) {
        this.from = from;
        this.to = to;
    }
}

export class ItemStack {
    constructor(typeId, amount = 1) {
        this.typeId = typeId;
        this.amount = amount;
    }
}

const AIR = BlockPermutation.resolve('minecraft:air');

class MockBlock {
    constructor(dim, loc) {
        this.dim = dim;
        this.location = loc;
    }
    get permutation() {
        return this.dim.blocks.get(this.dim.k(this.location)) ?? AIR;
    }
    get typeId() {
        return this.permutation.type;
    }
    get isAir() {
        return this.typeId === 'minecraft:air';
    }
    getComponent(id) {
        if (id !== 'minecraft:inventory' || this.typeId !== 'minecraft:chest') return undefined;
        const k = this.dim.k(this.location);
        if (!this.dim.inventories.has(k)) this.dim.inventories.set(k, new Array(27).fill(undefined));
        const inv = this.dim.inventories.get(k);
        return { container: { size: 27, setItem: (slot, item) => (inv[slot] = item), getItem: (slot) => inv[slot] } };
    }
}

export class MockDimension {
    constructor(id) {
        this.id = id;
        this.blocks = new Map();
        this.inventories = new Map();
        this.calls = { fill: 0, set: 0, filled: 0 };
        this.loadedRadius = 12; // chunks around any player in this dimension count as loaded
    }
    k(l) {
        return `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`;
    }
    checkLoaded(l) {
        if (!this.isChunkLoaded(l)) throw new Error(`LocationInUnloadedChunkError ${l.x} ${l.y} ${l.z}`);
    }
    isChunkLoaded(l) {
        const cx = Math.floor(l.x) >> 4, cz = Math.floor(l.z) >> 4;
        return state.players.some((p) => p.dimension === this &&
            Math.abs((Math.floor(p.location.x) >> 4) - cx) <= this.loadedRadius &&
            Math.abs((Math.floor(p.location.z) >> 4) - cz) <= this.loadedRadius);
    }
    fillBlocks(vol, perm) {
        const a = vol.from, b = vol.to;
        const n = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1) * (Math.abs(b.z - a.z) + 1);
        if (n > 32768) throw new Error(`fill too large: ${n}`);
        this.checkLoaded(a);
        this.checkLoaded(b);
        this.calls.fill++;
        this.calls.filled += n;
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++)
            for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
                for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) {
                    const key = `${x},${y},${z}`;
                    if (perm.type === 'minecraft:air') this.blocks.delete(key);
                    else this.blocks.set(key, perm);
                }
        return {};
    }
    setBlockPermutation(l, perm) {
        this.checkLoaded(l);
        this.calls.set++;
        if (perm.type === 'minecraft:air') this.blocks.delete(this.k(l));
        else this.blocks.set(this.k(l), perm);
    }
    getBlock(l) {
        if (!this.isChunkLoaded(l)) return undefined;
        return new MockBlock(this, { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) });
    }
    getEntities() {
        return [];
    }
    getPlayers() {
        return state.players.filter((p) => p.dimension === this);
    }
}

class Signal {
    constructor() {
        this.handlers = [];
    }
    subscribe(fn) {
        this.handlers.push(fn);
        return fn;
    }
    unsubscribe(fn) {
        this.handlers = this.handlers.filter((h) => h !== fn);
    }
    fire(ev) {
        for (const h of this.handlers) h(ev);
    }
}

export class MockPlayer {
    constructor(name, dim, loc) {
        this.id = name;
        this.name = name;
        this.dimension = dim;
        this.location = { ...loc };
        this.actionbar = '';
        this.teleports = 0;
        this.onScreenDisplay = { setActionBar: (t) => (this.actionbar = t) };
        const attr = (v, max) => ({ currentValue: v, defaultValue: max, effectiveMax: max, setCurrentValue(x) { this.currentValue = x; return true; } });
        this.components = {
            'minecraft:health': attr(20, 20),
            'minecraft:player.hunger': attr(20, 20),
            'minecraft:player.saturation': attr(5, 20),
        };
        this.items = new Array(36).fill(undefined);
        this.selectedSlotIndex = 0;
        const items = this.items;
        this.components['minecraft:inventory'] = { container: { size: 36, getItem: (i) => items[i], setItem: (i, v) => (items[i] = v) } };
    }
    getComponent(id) {
        return this.components[id];
    }
    getGameMode() {
        return 'Survival';
    }
    getHeadLocation() {
        return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
    }
    getViewDirection() {
        return { x: 0, y: 0, z: 1 };
    }
    teleport(loc, opts) {
        this.location = { ...loc };
        if (opts?.dimension) this.dimension = opts.dimension;
        this.teleports++;
    }
}

const state = {
    tick: 0,
    players: [],
    intervals: [],
    timeouts: [],
    jobs: [],
    props: new Map(),
    dims: new Map(),
    messages: [],
    structures: [],
    spawn: null,
};

for (const id of ['overworld', 'nether', 'the_end']) state.dims.set(id, new MockDimension(`minecraft:${id}`));

export const world = {
    seed: '-3743925519127219153',
    afterEvents: {
        worldLoad: new Signal(),
        playerSpawn: new Signal(),
        playerDimensionChange: new Signal(),
        entitySpawn: new Signal(),
        itemCompleteUse: new Signal(),
        entityHurt: new Signal(),
        entityDie: new Signal(),
        playerInteractWithBlock: new Signal(),
        playerBreakBlock: new Signal(),
    },
    beforeEvents: {
        itemUse: new Signal(),
        playerInteractWithBlock: new Signal(),
        playerInteractWithEntity: new Signal(),
        playerBreakBlock: new Signal(),
    },
    getDimension(id) {
        const d = state.dims.get(id.replace('minecraft:', ''));
        if (!d) throw new Error(`no dimension ${id}`);
        return d;
    },
    getDynamicProperty(k) {
        return state.props.get(k);
    },
    setDynamicProperty(k, v) {
        if (v === undefined) state.props.delete(k);
        else state.props.set(k, v);
    },
    getAllPlayers() {
        return state.players;
    },
    getPlayers() {
        return state.players;
    },
    sendMessage(m) {
        state.messages.push(String(m));
    },
    setDefaultSpawnLocation(l) {
        state.spawn = { ...l };
    },
    getDefaultSpawnLocation() {
        return state.spawn ?? { x: 0, y: 64, z: 0 };
    },
    structureManager: {
        made: new Map(),
        createEmpty(id, size) {
            if (this.made.has(id)) throw new Error(`structure ${id} already exists`);
            const st = {
                id, size, blocks: new Map(),
                setBlockPermutation(l, perm) {
                    if (l.x < 0 || l.y < 0 || l.z < 0 || l.x >= size.x || l.y >= size.y || l.z >= size.z) throw new Error('outside structure');
                    this.blocks.set(`${l.x},${l.y},${l.z}`, perm);
                },
            };
            this.made.set(id, st);
            return st;
        },
        delete(st) {
            return this.made.delete(typeof st === 'string' ? st : st.id);
        },
        place(st, dim, loc) {
            if (typeof st === 'string' && !this.made.has(st)) {
                // a pack structure (dungeon spawner)
                state.structures.push([st, dim.id, loc]);
                dim.blocks.set(dim.k(loc), BlockPermutation.resolve('minecraft:mob_spawner'));
                return;
            }
            const s = typeof st === 'string' ? this.made.get(st) : st;
            dim.checkLoaded(loc);
            dim.calls.structures = (dim.calls.structures ?? 0) + 1;
            // an empty structure is air: the whole volume is overwritten
            for (let x = 0; x < s.size.x; x++)
                for (let y = 0; y < s.size.y; y++)
                    for (let z = 0; z < s.size.z; z++) {
                        const p = s.blocks.get(`${x},${y},${z}`);
                        const key = `${loc.x + x},${loc.y + y},${loc.z + z}`;
                        if (p) dim.blocks.set(key, p);
                        else dim.blocks.delete(key);
                    }
        },
    },
    gameRules: {},
};

export const system = {
    get currentTick() {
        return state.tick;
    },
    afterEvents: { scriptEventReceive: new Signal() },
    beforeEvents: { startup: new Signal() },
    runInterval(fn, n = 1) {
        state.intervals.push({ fn, n, next: state.tick + n });
        return state.intervals.length;
    },
    runTimeout(fn, n = 1) {
        state.timeouts.push({ fn, at: state.tick + n });
        return -state.timeouts.length;
    },
    run(fn) {
        return this.runTimeout(fn, 0);
    },
    runJob(gen) {
        state.jobs.push(gen);
        return state.jobs.length;
    },
    clearRun() {},
};

// Mock driver
export const mock = {
    state,
    addPlayer(name, dimId, loc) {
        const p = new MockPlayer(name, world.getDimension(dimId), loc);
        state.players.push(p);
        return p;
    },
    // one game tick: timeouts, intervals, then jobs get `budgetMs` of work (approximating runJob's slice)
    tick(budgetMs = 6) {
        state.tick++;
        const due = state.timeouts.filter((t) => t.at <= state.tick);
        state.timeouts = state.timeouts.filter((t) => t.at > state.tick);
        for (const t of due) t.fn();
        for (const iv of state.intervals) {
            if (state.tick >= iv.next) {
                iv.next = state.tick + iv.n;
                iv.fn();
            }
        }
        const t0 = performance.now();
        while (state.jobs.length && performance.now() - t0 < budgetMs) {
            for (let i = 0; i < state.jobs.length; i++) {
                const r = state.jobs[i].next();
                if (r.done) {
                    state.jobs.splice(i, 1);
                    i--;
                }
            }
        }
    },
};

export const InputPermissionCategory = { Movement: 'Movement' };
export const CommandPermissionLevel = { Any: 'Any', GameDirectors: 'GameDirectors' };
export const CustomCommandParamType = { Integer: 'Integer', String: 'String' };
export const CustomCommandStatus = { Success: 'Success', Failure: 'Failure' };
export const EntityComponentTypes = {};
export const GameMode = { Survival: 'Survival', Creative: 'Creative' };
