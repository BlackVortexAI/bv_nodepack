export function randomSeed(random = Math.random) {
  const high = BigInt(Math.floor(random() * 0x100000000));
  const low = BigInt(Math.floor(random() * 0x100000000));
  return Number(((high << 32n) | low) & ((1n << 53n) - 1n));
}

export function applySeedAction(action, seed, lastSeed, random = Math.random) {
  if (action === "random-each") return -1;
  if (action === "new-fixed") return randomSeed(random);
  if (action === "use-last" && Number.isSafeInteger(lastSeed)) return lastSeed;
  return seed;
}

export function materializeSeedControl(seedControl, random = Math.random) {
  const value = Number(seedControl);
  if (!Number.isFinite(value)) return null;
  return value === -1 ? randomSeed(random) : value;
}
