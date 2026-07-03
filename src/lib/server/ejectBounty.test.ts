import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  profiles: [
    { value: { name: "토벌자", gender: "male1" } },
    { value: { name: "침입자", gender: "female1" } },
  ] as Array<{ value: { name: string; gender: string } }>,
  profileReads: 0,
  lockedSaves: new Map<string, Record<string, unknown>>(),
  upserts: [] as Array<{ userId: string; key: string; save: Record<string, unknown> }>,
  guildPatch: null as { guildId: number; patch: { gold: number } } | null,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "hunter"),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, userId: string, key: string) => {
    if (key === "adventure-log.v2") return {};
    return h.lockedSaves.get(userId) ?? {};
  }),
  upsertSave: vi.fn(async (_tx, userId: string, key: string, save: Record<string, unknown>) => {
    h.upserts.push({ userId, key, save });
  }),
}));

vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => ({
    player: { hp: 1000, atk: 100, def: 50, spd: 50, maxMp: 100 },
    maxHp: 1000,
    selectedStance: null,
  })),
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async ({ userId }: { userId: string }) => ({
    player: {
      player: { hp: 1000, atk: 100, def: 50, spd: 50, maxMp: 100 },
      maxHp: 1000,
      selectedStance: null,
    },
    skills: {
      learned: [`${userId}:skill`],
      equipped: [`${userId}:skill`],
    },
  })),
}));

vi.mock("@/adventure/v2/combat/engine-pvp", () => ({
  resolveBattlePvP: vi.fn(() => ({
    outcome: "p1_win",
    turns: 3,
    finalState: {
      p1: { hp: 900, mp: 50 },
      p2: { hp: 0, mp: 0 },
      log: [],
    },
  })),
}));

vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 1_000 })),
  upsertGuildResources: vi.fn(async (_tx, guildId: number, patch: { gold: number }) => {
    h.guildPatch = { guildId, patch };
  }),
}));

vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotification: vi.fn(async () => {}),
}));

vi.mock("@/db", async () => {
  const { getTableName } = await import("drizzle-orm");

  function tableName(table: unknown): string {
    try {
      return getTableName(table as never);
    } catch {
      return "";
    }
  }

  function rowsFor(table: unknown) {
    const name = tableName(table);
    if (name === "outpost_occupations") {
      return [
        {
          outpostId: "tile:2,3",
          occupiedByUserId: null,
          occupiedByGuildId: 7,
          occupiedAt: new Date(0),
          policy: "open",
          taxRate: "0.100",
          nextAttackAt: new Date(0),
          fortHp: 100,
          fortMaxHp: 100,
          fortUpdatedAt: new Date(),
          protectedUntil: new Date(0),
        },
      ];
    }
    if (name === "guild_members") return [];
    if (name === "saves_kv") return [h.profiles[h.profileReads++] ?? h.profiles[0]];
    return [];
  }

  function chain() {
    let table: unknown = null;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        table = t;
        return c;
      },
      where: () => c,
      for: () => c,
      limit: async () => rowsFor(table),
    };
    return c;
  }

  const tx = { select: () => chain() };
  return {
    db: {
      transaction: vi.fn(async (cb: (txArg: unknown) => unknown) => cb(tx)),
    },
  };
});

import { POST } from "@/app/api/v2/outpost/eject/route";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/outpost/eject", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/outpost/eject bounty", () => {
  beforeEach(() => {
    h.profileReads = 0;
    h.upserts = [];
    h.guildPatch = null;
    h.lockedSaves = new Map([
      ["hunter", { gold: 123, hp: 1000 }],
      [
        "intruder",
        {
          gold: 1_000,
          bankedGold: 10_000,
          tilePos: { col: 2, row: 3, at: Date.now() - 60_000 },
          discoveredOutpostIds: [],
        },
      ],
    ]);
  });

  it("토벌 성공 시 침입자 보유 전액과 은행 5%를 점령 길드 금고로 압류한다", async () => {
    const res = await POST(
      req({ outpostId: "tile:2,3", targetUserId: "intruder" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      won: boolean;
      bountyGold: number;
      heldBountyGold: number;
      bankBountyGold: number;
    };

    expect(json).toMatchObject({
      ok: true,
      won: true,
      bountyGold: 1_500,
      heldBountyGold: 1_000,
      bankBountyGold: 500,
    });
    expect(h.guildPatch).toEqual({ guildId: 7, patch: { gold: 2_500 } });
    expect(h.upserts).toContainEqual(
      expect.objectContaining({
        userId: "hunter",
        key: "character.v2",
        save: expect.objectContaining({ gold: 123 }),
      }),
    );
    expect(h.upserts).toContainEqual(
      expect.objectContaining({
        userId: "intruder",
        key: "character.v2",
        save: expect.objectContaining({ gold: 0, bankedGold: 9_500 }),
      }),
    );
    expect(vi.mocked(resolveBattlePvP).mock.calls[0]?.[4]).toMatchObject({
      v2Skills: {
        p1: { equipped: ["hunter:skill"] },
        p2: { equipped: ["intruder:skill"] },
      },
    });
  });
});
