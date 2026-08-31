import type { RuntimeFeature } from "./types";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function classifyRequestPath(rawPathname: string): RuntimeFeature {
  const pathname = rawPathname.split("?", 1)[0] || "/";

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js"
  ) {
    return "static";
  }
  if (!pathname.startsWith("/api/")) return "render";
  if (matchesPrefix(pathname, "/api/admin")) return "admin";
  if (
    matchesAny(pathname, ["/api/cron", "/api/v2/cron"])
  ) {
    return "cron";
  }
  if (matchesPrefix(pathname, "/api/health")) return "health";
  if (
    matchesAny(pathname, [
      "/api/auth",
      "/api/account",
      "/api/session",
      "/api/profile",
    ])
  ) {
    return "auth";
  }
  if (matchesPrefix(pathname, "/api/chat")) return "chat";
  if (matchesPrefix(pathname, "/api/presence")) return "presence";
  if (
    matchesAny(pathname, ["/api/marketplace", "/api/v2/marketplace"])
  ) {
    return "marketplace";
  }
  if (
    matchesAny(pathname, [
      "/api/v2/dungeon",
      "/api/v2/grid-dungeon",
      "/api/v2/arena",
      "/api/v2/coop",
      "/api/v2/mastery-tower",
      "/api/v2/battle-replays",
      "/api/v2/pvp",
      "/api/v2/storm-expedition",
    ])
  ) {
    return "combat";
  }
  if (
    matchesAny(pathname, [
      "/api/v2/farm",
      "/api/v2/fishing",
      "/api/v2/dangerous-fishing",
      "/api/v2/cooking",
      "/api/v2/mining",
      "/api/v2/woodcutting",
      "/api/v2/life-fields",
      "/api/v2/life-requests",
      "/api/v2/life-workshop",
      "/api/v2/artisan",
    ])
  ) {
    return "life";
  }
  if (
    matchesAny(pathname, [
      "/api/guilds",
      "/api/v2/guild",
      "/api/bulletin",
      "/api/feed",
      "/api/inbox",
      "/api/rankings",
      "/api/referrals",
      "/api/safety",
    ])
  ) {
    return "social";
  }
  if (
    matchesAny(pathname, [
      "/api/save",
      "/api/v2/me/state",
      "/api/v2/me/offline-hunt",
      "/api/v2/me/offline-settle",
    ])
  ) {
    return "save";
  }
  if (matchesPrefix(pathname, "/api/v2/me")) return "progression";
  return "other";
}

const STATIC_COMBAT_PATHS = new Set([
  "/api/v2/dungeon/hunt",
  "/api/v2/grid-dungeon",
  "/api/v2/arena/history",
  "/api/v2/arena/loadout",
  "/api/v2/arena/match",
  "/api/v2/arena/ranking",
  "/api/v2/arena/shop",
  "/api/v2/arena/state",
  "/api/v2/arena/tournament",
  "/api/v2/coop",
  "/api/v2/coop/attack",
  "/api/v2/coop/claim",
  "/api/v2/coop/shop",
  "/api/v2/coop/summon",
  "/api/v2/mastery-tower",
  "/api/v2/mastery-tower/attempt",
  "/api/v2/mastery-tower/claim",
  "/api/v2/mastery-tower/use-certificate",
  "/api/v2/storm-expedition",
]);

const STATIC_SAVE_PATHS = new Set([
  "/api/save",
  "/api/v2/me/state",
  "/api/v2/me/offline-hunt",
  "/api/v2/me/offline-settle",
]);

const STATIC_LIFE_PATHS = new Set([
  "/api/v2/artisan/leaderboard",
  "/api/v2/cooking",
  "/api/v2/cooking/surplus",
  "/api/v2/dangerous-fishing/boss",
  "/api/v2/dangerous-fishing/encounter",
  "/api/v2/dangerous-fishing/exchange",
  "/api/v2/dangerous-fishing/shop",
  "/api/v2/dangerous-fishing/status",
  "/api/v2/dangerous-fishing/voyage",
  "/api/v2/farm",
  "/api/v2/farm/deliver",
  "/api/v2/farm/feed-craft",
  "/api/v2/farm/fertilize",
  "/api/v2/farm/harvest",
  "/api/v2/farm/plant",
  "/api/v2/farm/plot-upgrade",
  "/api/v2/farm/ranch/collect",
  "/api/v2/farm/ranch/feed",
  "/api/v2/farm/ranch/rebuild",
  "/api/v2/farm/ranch/upgrade",
  "/api/v2/farm/shop",
  "/api/v2/farm/special-deliver",
  "/api/v2/farm/weekly",
  "/api/v2/fishing/cast",
  "/api/v2/fishing/challenges",
  "/api/v2/fishing/challenges/claim",
  "/api/v2/fishing/hall-of-fame",
  "/api/v2/fishing/leaderboard",
  "/api/v2/fishing/progression",
  "/api/v2/fishing/reel",
  "/api/v2/fishing/shop",
  "/api/v2/fishing/status",
  "/api/v2/life-fields",
  "/api/v2/life-requests",
  "/api/v2/life-workshop",
  "/api/v2/mining/auto",
  "/api/v2/mining/start",
  "/api/v2/mining/status",
  "/api/v2/mining/strike",
  "/api/v2/woodcutting/auto",
  "/api/v2/woodcutting/chop",
  "/api/v2/woodcutting/start",
  "/api/v2/woodcutting/status",
]);

const SAFE_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function safeMethod(method: string): string {
  const normalized = method.toUpperCase();
  return SAFE_METHODS.has(normalized) ? normalized : "OTHER";
}

export function classifyRequestOperation(
  rawUrl: string,
  method: string,
): string {
  const pathname = rawUrl.split("?", 1)[0] || "/";
  const verb = safeMethod(method);
  const feature = classifyRequestPath(pathname);
  if (
    (feature === "save" && STATIC_SAVE_PATHS.has(pathname)) ||
    (feature === "life" && STATIC_LIFE_PATHS.has(pathname))
  ) {
    return `${verb} ${pathname}`;
  }
  if (feature !== "combat") return `${verb} ${feature}`;

  if (STATIC_COMBAT_PATHS.has(pathname)) return `${verb} ${pathname}`;
  if (/^\/api\/v2\/coop\/[^/]+\/attacks\/[^/]+$/.test(pathname)) {
    return `${verb} /api/v2/coop/:sessionId/attacks/:attackId`;
  }
  if (/^\/api\/v2\/coop\/[^/]+\/visibility$/.test(pathname)) {
    return `${verb} /api/v2/coop/:sessionId/visibility`;
  }
  if (/^\/api\/v2\/coop\/[^/]+$/.test(pathname)) {
    return `${verb} /api/v2/coop/:sessionId`;
  }
  if (
    /^\/api\/v2\/arena\/tournament\/[^/]+\/matches\/[^/]+$/.test(
      pathname,
    )
  ) {
    return `${verb} /api/v2/arena/tournament/:seasonId/matches/:matchId`;
  }
  if (/^\/api\/v2\/battle-replays\/[^/]+$/.test(pathname)) {
    return `${verb} /api/v2/battle-replays/:replayId`;
  }
  return `${verb} combat:other`;
}
