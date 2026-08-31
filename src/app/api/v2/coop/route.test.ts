import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRows: [] as unknown[][],
}));

function query(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return builder;
}

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => ({ materials: {} })),
}));
vi.mock("@/lib/server/v2Coop", () => ({
  expireStaleCoopSessions: vi.fn(async () => undefined),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => query(mocks.queryRows.shift() ?? [])),
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryRows = [];
});

describe("GET /api/v2/coop", () => {
  it("공개 값이 손상돼도 다른 사람의 개인 보스는 목록에 노출하지 않는다", async () => {
    mocks.queryRows.push(
      [{
        id: "personal-1",
        regionId: "tracking_weapon",
        hp: 100,
        maxHp: 100,
        mechanicState: null,
        expiresAt: new Date(Date.now() + 60_000),
        summonedByName: "owner",
        summonerId: "owner",
        summonerGuildId: null,
        visibility: "public",
        spawnedAt: new Date(),
        defeatedAt: null,
      }],
      [],
      [],
    );
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sessions: [],
      claimables: [],
    });
  });

  it("추적 병기 소환자에게 저장된 추적 게이지를 목록에 표시한다", async () => {
    mocks.queryRows.push(
      [{
        id: "personal-1",
        regionId: "tracking_weapon",
        hp: 80,
        maxHp: 100,
        mechanicState: { trackingThreat: 73 },
        expiresAt: new Date(Date.now() + 60_000),
        summonedByName: "viewer",
        summonerId: "viewer",
        summonerGuildId: null,
        visibility: "summoner_only",
        spawnedAt: new Date(),
        defeatedAt: null,
      }],
      [],
      [],
      [],
      [],
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessions: [{
        id: "personal-1",
        trackingThreat: 73,
        trackingThreatMax: 100,
        trackingReady: false,
      }],
    });
  });
});
