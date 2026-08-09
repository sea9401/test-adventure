import { describe, expect, it } from "vitest";
import { classifyRequestPath } from "./routeClassifier";

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
