export type GameTabId =
  | "adventure"
  | "battle"
  | "town"
  | "life"
  | "character"
  | "guild"
  | "plaza";

const LIFE_PATH_PREFIXES = [
  "/town/life-workshop",
  "/town/farm",
  "/town/fishing",
  "/town/logging",
  "/town/mining",
  "/town/kitchen",
] as const;

export function gameTabForPath(pathname: string): GameTabId {
  if (pathname === "/") return "adventure";
  if (pathname === "/map" || LIFE_PATH_PREFIXES.some((path) => pathname.startsWith(path))) {
    return "life";
  }
  if (pathname.startsWith("/battle")) return "battle";
  if (pathname.startsWith("/town")) return "town";
  if (pathname.startsWith("/character") || pathname.startsWith("/quests")) {
    return "character";
  }
  if (pathname.startsWith("/guild")) return "guild";
  if (pathname.startsWith("/plaza")) return "plaza";
  return "adventure";
}
