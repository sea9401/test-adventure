import { describe, expect, it, vi } from "vitest";

const personalSession = {
  id: "personal-1",
  regionId: "tracking_weapon",
  hp: 100,
  maxHp: 100,
  mechanicState: null,
  expiresAt: new Date(Date.now() + 60_000),
  defeatedAt: null,
  summonerId: "owner",
  summonerGuildId: null,
  visibility: "public",
};

function selectBuilder() {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => [personalSession]),
  };
  return builder;
}

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "outsider"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({ stamina: {} })),
  readSave: vi.fn(async () => null),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async () => ({
    player: { maxHp: 100, player: { hp: 100, maxHp: 100 } },
    skills: [],
  })),
}));
vi.mock("@/adventure/v2/stamina", () => ({
  parseStaminaFromSave: vi.fn(() => ({ current: 100, updatedAt: 0 })),
  staminaConfigForCharacter: vi.fn(() => ({ max: 100, regenBonusPct: 0 })),
  tryConsume: vi.fn(() => ({ current: 80, updatedAt: 0 })),
  applyRegen: vi.fn((state) => state),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ select: vi.fn(() => selectBuilder()) }),
    ),
  },
}));

import { POST } from "./route";

describe("POST /api/v2/coop/attack", () => {
  it("개인 보스가 public으로 손상돼도 소환자 외 공격을 거부한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/v2/coop/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "personal-1" }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "no_permission",
    });
  });
});
