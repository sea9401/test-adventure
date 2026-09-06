/** Synchronous engine scope only: never hold across await/yield. */
let activeRandom: (() => number) | undefined;

export function combatRandom(): number {
  return activeRandom ? activeRandom() : Math.random();
}

export function withCombatRandom<T>(random: (() => number) | undefined, run: () => T): T {
  const previous = activeRandom;
  activeRandom = random;
  try {
    return run();
  } finally {
    activeRandom = previous;
  }
}

/** Mulberry32 v1. Seed and engine/data version are required to reproduce a run. */
export function seededCombatRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Combat seed must be an unsigned 32-bit integer");
  }
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
