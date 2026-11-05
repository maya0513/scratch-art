/** An integer hash also gives negative paper tiles stable, independent seeds. */
export function hash(seed: number, x: number, y: number, salt = 0): number {
  let value = Math.imul(seed ^ x, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16) ^ y, 0x85ebca77);
  value = Math.imul(value ^ (value >>> 13) ^ salt, 0xc2b2ae3d);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- The PRNG requires signed 32-bit wraparound.
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function freshSeed(): number {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return new DataView(bytes.buffer).getUint32(0, true);
}
