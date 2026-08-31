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
});
