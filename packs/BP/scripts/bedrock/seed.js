// Beta 1.7.3's create-world seed rule (GuiCreateWorld): an empty box picks a random seed; otherwise
// Long.parseLong(text), and text that is not a number uses String.hashCode(). A parsed 0 also means random.

const MIN = -(1n << 63n);
const MAX = (1n << 63n) - 1n;

// java.lang.Long.parseLong(s, 10); null on NumberFormatException
export function parseJavaLong(s) {
    if (s.length === 0) return null;
    let i = 0;
    let neg = false;
    if (s[0] === '-' || s[0] === '+') {
        neg = s[0] === '-';
        i = 1;
        if (s.length === 1) return null;
    }
    let v = 0n;
    for (; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 48 || c > 57) return null;
        v = v * 10n + BigInt(c - 48);
        if (v > MAX + 1n) return null;
    }
    v = neg ? -v : v;
    if (v < MIN || v > MAX) return null;
    return v;
}

// java.lang.String.hashCode() over UTF-16 code units, as a long
export function javaStringHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return BigInt(h);
}

// text: what the player typed; fallback: the long to use where Beta would pick a random seed
export function betaSeed(text, fallback) {
    if (text === undefined || text === null || text.length === 0) return fallback;
    const n = parseJavaLong(text);
    if (n === null) return javaStringHash(text);
    return n !== 0n ? n : fallback;
}

// world.seed is a decimal string; Bedrock seeds are 64-bit
export function bedrockSeedAsLong(seedString) {
    try {
        return BigInt.asIntN(64, BigInt(seedString));
    } catch {
        return javaStringHash(String(seedString));
    }
}
