import { describe, expect, it } from "vitest";
import {
  classifyRequestOperation,
  classifyRequestPath,
} from "./routeClassifier";

describe("classifyRequestPath", () => {
  it.each([
    ["/api/admin/presence", "admin"],
    ["/api/auth/session", "auth"],
    ["/api/profile/by-name?name=hidden", "auth"],
    ["/api/chat", "chat"],
    ["/api/chat/rooms/private-room-id", "chat"],
    ["/api/presence", "presence"],
    ["/api/feed", "social"],
    ["/api/v2/guild/activity", "social"],
    ["/api/v2/marketplace/browse", "marketplace"],
    ["/api/marketplace/inbox", "marketplace"],
    ["/api/v2/dungeon/hunt", "combat"],
    ["/api/v2/arena/match", "combat"],
    ["/api/v2/coop/attack", "combat"],
    ["/api/v2/fishing/cast", "life"],
    ["/api/v2/farm/harvest", "life"],
    ["/api/save", "save"],
    ["/api/v2/me/state", "save"],
    ["/api/v2/me/equipment/equip", "progression"],
    ["/api/cron/push-notifications", "cron"],
    ["/api/v2/cron/marketplace-expire", "cron"],
    ["/api/health", "health"],
    ["/_next/static/chunks/main.js", "static"],
    ["/images/ui/plains.webp", "static"],
    ["/adventure", "render"],
    ["/api/unclassified", "other"],
  ] as const)("%s 경로를 %s 기능으로 분류한다", (pathname, expected) => {
    expect(classifyRequestPath(pathname)).toBe(expected);
  });
});

describe("classifyRequestOperation", () => {
  it.each([
    [
      "/api/v2/dungeon/hunt?floor=private",
      "POST",
      "POST /api/v2/dungeon/hunt",
    ],
    [
      "/api/v2/coop/session-secret/attacks/attack-secret?token=hidden",
      "get",
      "GET /api/v2/coop/:sessionId/attacks/:attackId",
    ],
    [
      "/api/v2/arena/tournament/season-secret/matches/match-secret",
      "GET",
      "GET /api/v2/arena/tournament/:seasonId/matches/:matchId",
    ],
    [
      "/api/v2/battle-replays/replay-secret",
      "GET",
      "GET /api/v2/battle-replays/:replayId",
    ],
    ["/api/save?key=private", "GET", "GET /api/save"],
    ["/api/v2/me/state?view=core", "GET", "GET /api/v2/me/state"],
    ["/api/v2/farm/harvest?plot=private", "POST", "POST /api/v2/farm/harvest"],
    ["/api/v2/life-fields?view=codex", "GET", "GET /api/v2/life-fields"],
    ["/api/v2/farm/private-secret", "POST", "POST life"],
    ["/api/profile/by-name?name=hidden", "GET", "GET auth"],
  ] as const)("%s를 비식별 작업명으로 분류한다", (url, method, expected) => {
    const operation = classifyRequestOperation(url, method);
    expect(operation).toBe(expected);
    expect(operation).not.toMatch(/private|secret|hidden/);
  });
});
