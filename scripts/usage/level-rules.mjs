export const LEVEL_SCHEMA_VERSION = 1;

export function tokenGrowthBonus(totalTokens) {
  const tokens = Math.max(0, Number(totalTokens) || 0);
  if (tokens >= 2_000_000) return 1;
  if (tokens >= 500_000) return 0.75;
  if (tokens >= 100_000) return 0.5;
  if (tokens >= 10_000) return 0.25;
  return 0;
}

export function dailyGrowth(totalTokens, active = true) {
  return active ? 1 + tokenGrowthBonus(totalTokens) : 0;
}

export function growthRequiredForLevel(level) {
  const normalized = Math.max(0, Math.floor(Number(level) || 0));
  return normalized * normalized + 4 * normalized;
}

export function levelForGrowth(growth) {
  const normalized = Math.max(0, Number(growth) || 0);
  return Math.max(0, Math.floor(Math.sqrt(normalized + 4) - 2));
}

export function decomposeLevel(level) {
  let remaining = Math.max(0, Math.floor(Number(level) || 0));
  const crowns = Math.floor(remaining / 64);
  remaining %= 64;
  const suns = Math.floor(remaining / 16);
  remaining %= 16;
  const moons = Math.floor(remaining / 4);
  const stars = remaining % 4;
  return { crowns, suns, moons, stars };
}

export function levelIcons(level) {
  const parts = decomposeLevel(level);
  const icons = [];
  for (const [kind, symbol] of [["crown", "♛"], ["sun", "☀"], ["moon", "☾"], ["star", "★"]]) {
    const count = parts[`${kind}s`];
    for (let index = 0; index < count; index += 1) icons.push({ kind, symbol });
  }
  return icons;
}

export function levelProgress(growth) {
  const normalized = Math.max(0, Number(growth) || 0);
  const level = levelForGrowth(normalized);
  const floor = growthRequiredForLevel(level);
  const ceiling = growthRequiredForLevel(level + 1);
  const earned = Math.max(0, normalized - floor);
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    floor,
    ceiling,
    earned,
    remaining: Math.max(0, ceiling - normalized),
    percent: Math.max(0, Math.min(100, Math.round(earned / span * 100))),
    icons: levelIcons(level),
  };
}
