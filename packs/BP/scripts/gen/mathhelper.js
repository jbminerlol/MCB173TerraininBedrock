// MathHelper (class `in`): the float sine table and floors used by the b1.7.3 generator.

const f = Math.fround;

const SIN_TABLE = new Float32Array(65536);
for (let i = 0; i < 65536; i++) SIN_TABLE[i] = Math.sin((i * 3.141592653589793 * 2.0) / 65536.0);

const K = f(10430.378);

export function sin(x) {
    return SIN_TABLE[(f(x * K) | 0) & 65535];
}

export function cos(x) {
    return SIN_TABLE[(f(f(x * K) + 16384.0) | 0) & 65535];
}

// floor_double: (int)d, minus one when d is below it
export function floorD(d) {
    const i = d | 0;
    return d < i ? i - 1 : i;
}

export const SIN_TABLE_FOR_TEST = SIN_TABLE;
