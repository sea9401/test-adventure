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
      "/api/v2/cooking",
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
