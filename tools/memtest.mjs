// Memory use of the generator side while the add-on fills the spawn area (mock world, no block storage).
import { mock, world } from '@minecraft/server';
import { debugState } from '../packs/BP/scripts/bedrock/genmanager.js';
await import('../packs/BP/scripts/main.js');
for (const d of mock.state.dims.values()) { d.fillBlocks = () => ({}); d.setBlockPermutation = () => {}; }
world.afterEvents.worldLoad.fire({});
const p = mock.addPlayer('Steve', 'overworld', { x: 0.5, y: 80, z: 0.5 });
world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
for (let t = 0; t < 3000; t++) {
    mock.tick(6);
    await Promise.resolve();
    if (t % 500 === 0 || t === 2999) {
        const st = debugState(), ds = st.dims.get('minecraft:overworld');
        const m = process.memoryUsage();
        console.log(`tick ${t}: written ${st.stats.chunks}, gen chunks ${ds?.gw.chunks.size}, lateWrites ${ds?.gw.lateWrites.length / 2}, heap ${(m.heapUsed / 1e6).toFixed(0)} MB, buffers ${(m.arrayBuffers / 1e6).toFixed(0)} MB`);
    }
}
