// Beta 1.7.3 terrain for Bedrock: entry point.
import * as mc from '@minecraft/server';
import { startGeneration, commandSeed, commandRadius, commandStatus } from './bedrock/genmanager.js';

const { world, system } = mc;
// namespace access: a missing enum must not stop the module from linking
const { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } = mc;

system.beforeEvents.startup.subscribe((ev) => {
    const reg = ev.customCommandRegistry;
    if (!reg) return;
    const ok = { status: CustomCommandStatus?.Success ?? 0 };
    const any = CommandPermissionLevel?.Any ?? 0;
    try {
        reg.registerCommand({ name: 'b173:seed', description: 'Show the Beta 1.7.3 world seed', permissionLevel: any, cheatsRequired: false },
            () => (system.run(() => commandSeed()), ok));
        reg.registerCommand({ name: 'b173:status', description: 'Beta 1.7.3 terrain generation status', permissionLevel: any, cheatsRequired: false },
            () => (system.run(() => commandStatus()), ok));
        reg.registerCommand({
            name: 'b173:radius', description: 'Chunks generated around each player (2-16)',
            permissionLevel: CommandPermissionLevel?.GameDirectors ?? 1, cheatsRequired: false,
            mandatoryParameters: [{ name: 'chunks', type: CustomCommandParamType?.Integer ?? 'Integer' }],
        }, (origin, n) => (system.run(() => commandRadius(n)), ok));
    } catch (e) {
        console.warn(`[B173] commands not registered: ${e}`);
    }
});

world.afterEvents.worldLoad.subscribe(() => {
    startGeneration();
    console.warn('[B173] Beta 1.7.3 terrain loaded');
});
