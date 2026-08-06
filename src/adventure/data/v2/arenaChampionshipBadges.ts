export type ArenaChampionshipBadge = "gold" | "silver" | "bronze";

export type ArenaChampionshipBadges = {
  gold: number;
  silver: number;
  bronze: number;
};

export const ARENA_CHAMPIONSHIP_BADGE_IDS = [
  "gold",
  "silver",
  "bronze",
] as const satisfies readonly ArenaChampionshipBadge[];

export function isArenaChampionshipBadge(
  value: unknown,
): value is ArenaChampionshipBadge {
  return (
    typeof value === "string" &&
    (ARENA_CHAMPIONSHIP_BADGE_IDS as readonly string[]).includes(value)
  );
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function parseArenaChampionshipBadges(
  value: unknown,
): ArenaChampionshipBadges {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    gold: count(raw.gold),
    silver: count(raw.silver),
    bronze: count(raw.bronze),
  };
}

export function arenaChampionshipBadgeForPlacement(
  placement: string,
): ArenaChampionshipBadge | null {
  if (placement === "1위") return "gold";
  if (placement === "2위") return "silver";
  if (placement === "3위") return "bronze";
  return null;
}

export function isArenaChampionshipWinner(placement: string): boolean {
  return placement === "1위";
}

export function hasArenaChampionshipWin(value: unknown): boolean {
  return parseArenaChampionshipBadges(value).gold > 0;
}

export function grantArenaChampionshipBadge(
  value: unknown,
  badge: ArenaChampionshipBadge,
): ArenaChampionshipBadges {
  const current = parseArenaChampionshipBadges(value);
  return { ...current, [badge]: current[badge] + 1 };
}
