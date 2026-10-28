// World.c() spawn search from b1.7.3: start at (0, 64, 0) and wander until the first uncovered block is sand.

import { B } from './behaviour.js';

// fd.a(int, int): the block under the first air at or above y 64
export function firstUncoveredBlock(w, x, z) {
    let y = 63;
    while (!w.isAirBlock(x, y + 1, z)) y++;
    return { id: w.getBlockId(x, y, z), y };
}

// Yields after every probe so the caller can spread the chunk generation over ticks.
// Beta used an unseeded Random here; this takes one so a seed always gives the same spawn.
export function* findSpawn(w, rand, out) {
    let x = 0, z = 0;
    for (;;) {
        const top = firstUncoveredBlock(w, x, z);
        if (top.id === B.sand) {
            out.x = x;
            out.y = top.y + 1;
            out.z = z;
            return;
        }
        x += rand.nextInt(64) - rand.nextInt(64);
        z += rand.nextInt(64) - rand.nextInt(64);
        yield;
    }
}
