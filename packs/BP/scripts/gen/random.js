// java.util.Random, bit-exact. The 48-bit LCG state is held as two 24-bit halves so every step stays
// exact in doubles (no BigInt on the hot path). Longs (seeds, nextLong) are BigInt.

const M_HI = 0x5de;      // 0x5DEECE66D = M_HI * 2^24 + M_LO
const M_LO = 0xece66d;
const P24 = 16777216;
const MASK48 = (1n << 48n) - 1n;

export class JavaRandom {
    constructor(seed = 0n) {
        this.hi = 0;
        this.lo = 0;
        this.setSeed(seed);
    }

    // seed: BigInt or a safe integer (treated as a Java long).
    setSeed(seed) {
        const s = (BigInt(seed) ^ 0x5deece66dn) & MASK48;
        this.hi = Number(s >> 24n);
        this.lo = Number(s & 0xffffffn);
    }

    next(bits) {
        const p = this.lo * M_LO + 0xb;
        const lo = p % P24;
        const q = this.hi * M_LO + this.lo * M_HI + Math.floor(p / P24);
        const hi = q % P24;
        this.hi = hi;
        this.lo = lo;
        // seed >>> (48 - bits), as a Java int
        const v = Math.floor((hi * P24 + lo) / 2 ** (48 - bits));
        return bits === 32 ? v | 0 : v;
    }

    nextInt(n) {
        if (n === undefined) return this.next(32);
        if (n <= 0) throw new Error('n must be positive');
        if ((n & -n) === n) return Math.floor(this.next(31) / 2 ** (31 - Math.log2(n)));
        let bits, val;
        do {
            bits = this.next(31);
            val = bits % n;
        } while (((bits - val + (n - 1)) | 0) < 0);
        return val;
    }

    nextLong() {
        const a = BigInt(this.next(32));
        const b = BigInt(this.next(32));
        return BigInt.asIntN(64, (a << 32n) + b);
    }

    nextBoolean() {
        return this.next(1) !== 0;
    }

    nextFloat() {
        return this.next(24) / P24;
    }

    nextDouble() {
        return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
    }
}

// Java long helpers for seed arithmetic.
export const toLong = (v) => BigInt.asIntN(64, BigInt(v));
export const lmul = (a, b) => BigInt.asIntN(64, BigInt(a) * BigInt(b));
export const ladd = (a, b) => BigInt.asIntN(64, BigInt(a) + BigInt(b));
