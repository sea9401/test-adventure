import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({
  queue: [] as unknown[][],
}));

function builder(result: unknown[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    leftJoin: vi.fn(() => query),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return query;
}

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "outsider"),
}));
vi.mock("@/db", () => ({
  db: { select: vi.fn(() => builder(rows.queue.shift() ?? [])) },
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => null),
}));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readProfileAvatarMap: vi.fn(async () => new Map()),
  readMuseunCosmeticAppearanceMap: vi.fn(async () => new Map()),
}));

import { GET } from "./route";

describe("GET /api/v2/coop/[sessionId]", () => {
  it("과거 기여 기록이 있어도 개인 보스는 소환자 외 상세 조회를 막는다", async () => {
    rows.queue = [
      [{
        id: "personal-1",
        regionId: "tracking_weapon",
        hp: 0,
        maxHp: 100,
        expiresAt: new Date(Date.now() + 60_000),
        defeatedAt: new Date(),
        summonerId: "owner",
        summonerGuildId: null,
        visibility: "public",
      }],
      [],
      [{ userId: "outsider" }],
    ];
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: "personal-1" }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "no_session" });
  });

  it("추적 병기 상세에 저장된 추적 게이지와 준비 상태를 반환한다", async () => {
    rows.queue = [
      [{
        id: "personal-1",
        regionId: "tracking_weapon",
        hp: 80,
        maxHp: 100,
        mechanicState: { trackingThreat: 100 },
        expiresAt: new Date(Date.now() + 60_000),
        defeatedAt: null,
        summonedByName: "outsider",
        summonerId: "outsider",
        summonerGuildId: null,
        visibility: "summoner_only",
      }],
      [],
      [],
      [],
    ];

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: "personal-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session: {
        trackingThreat: 100,
        trackingThreatMax: 100,
        trackingReady: true,
      },
    });
  });
});
