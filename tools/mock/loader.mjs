// node --import ./tools/mock/loader.mjs ...  maps the @minecraft/* modules to the mocks next to this file.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
const map = {
    '@minecraft/server': ${JSON.stringify(new URL('./minecraft-server.mjs', import.meta.url).href)},
    '@minecraft/server-ui': ${JSON.stringify(new URL('./minecraft-server-ui.mjs', import.meta.url).href)},
};
export async function resolve(spec, ctx, next) {
    if (map[spec]) return { url: map[spec], shortCircuit: true };
    return next(spec, ctx);
}
`));
