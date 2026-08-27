export const DUNGEON_THEME_VISIBILITY_STORAGE_KEY =
  "adventure.v2.dungeonThemeHiddenStarts";
export const DUNGEON_THEME_VISIBILITY_SAVE_KEY =
  "dungeon-theme-visibility.v1";

export function normalizeHiddenThemeStarts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ].sort((a, b) => a - b);
}

export function parseHiddenThemeStarts(raw: string | null): Set<number> {
  try {
    return new Set(
      normalizeHiddenThemeStarts(raw ? (JSON.parse(raw) as unknown) : null),
    );
  } catch {
    return new Set();
  }
}
