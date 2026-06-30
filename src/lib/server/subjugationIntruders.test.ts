import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occRows: [] as Array<Record<string, unknown>>,
  attackRows: [] as Array<Record<string, unknown>>,
  treasuryRows: [] as Array<Record<string, unknown>>,
  villageRows: [] as Array<Record<string, unknown>>,
  tileNameRows: [] as Array<Record<string, unknown>>,
  guildRows: [] as Array<Record<string, unknown>>,
  membershipRows: [] as Array<Record<string, unknown>>,
  ownGuildRows: [] as Array<Record<string, unknown>>,
  charRows: [] as Array<Record<string, unknown>>,
  profileRows: [] as Array<Record<string, unknown>>,
  profileOutside: false,
  viewerGuildId: 7 as number | null,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer"),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => h.viewerGuildId),
}));

vi.mock("@/lib/server/serverFeed", () => ({
  resolveUserDisplayName: vi.fn(async (id: string) => id),
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

  function rowsFor(table: unknown, cols: unknown, source: "db" | "tx") {
    const name = tableName(table);
    if (name === "outpost_occupations") {
      return cols && typeof cols === "object" && "guildId" in cols
        ? h.occRows.map((r) => ({ guildId: r.occupiedByGuildId }))
        : h.occRows;
    }
    if (name === "outpost_claim_attempts") return h.attackRows;
    if (name === "outpost_treasury") return h.treasuryRows;
    if (name === "outpost_villages") return h.villageRows;
    if (name === "tile_settlements") return h.tileNameRows;
    if (name === "guilds") return h.guildRows;
    if (name === "guild_members") {
      return cols && typeof cols === "object" && "guildId" in cols
        ? h.membershipRows
        : h.ownGuildRows;
    }
    if (name === "saves_kv") {
      return source === "db" && h.profileOutside ? h.profileRows : h.charRows;
    }
    return [];
  }

  function chain(source: "db" | "tx", cols?: unknown) {
    let table: unknown = null;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        table = t;
        return c;
      },
      where: () => c,
      orderBy: () => c,
      limit: async () => rowsFor(table, cols, source),
      then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rowsFor(table, cols, source)).then(resolve, reject),
    };
    return c;
  }

  const tx = { select: (cols?: unknown) => chain("tx", cols) };
  return {
    db: {
      transaction: vi.fn(async (cb: (txArg: unknown) => unknown) => cb(tx)),
      select: (cols?: unknown) => chain("db", cols),
    },
  };
});

import { GET as getIntruders } from "@/app/api/v2/outpost/intruders/route";
import { GET as getWarOverview } from "@/app/api/v2/war/overview/route";

function occ(over: Record<string, unknown> = {}) {
  return {
    outpostId: "tile:2,3",
    occupiedByUserId: null,
    occupiedByGuildId: 7,
    occupiedAt: new Date(0),
    policy: "open",
    taxRate: "0.100",
    nextAttackAt: new Date(Date.now() + 60_000),
    fortHp: 100,
    fortMaxHp: 100,
    fortUpdatedAt: new Date(),
    protectedUntil: new Date(0),
    ...over,
  };
}

beforeEach(() => {
  h.occRows = [occ()];
  h.attackRows = [];
  h.treasuryRows = [];
  h.villageRows = [];
  h.tileNameRows = [{ col: 2, row: 3, name: "전초기지" }];
  h.guildRows = [{ id: 7, name: "수비대" }];
  h.membershipRows = [{ guildId: 7 }];
  h.ownGuildRows = [{ userId: "viewer" }];
  h.charRows = [
    { userId: "viewer", value: { tilePos: { col: 0, row: 0 } } },
    {
      userId: "enemy",
      value: { level: 12, tilePos: { col: "2", row: "3", at: 1000 } },
    },
  ];
  h.profileRows = [
    { userId: "enemy", value: { name: "침입자" } },
  ];
  h.profileOutside = false;
  h.viewerGuildId = 7;
});

describe("subjugation intruders", () => {
  it("war overview counts tile intruders for guild-owned rows without occupiedByUserId", async () => {
    const res = await getWarOverview();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      myGuild: { outposts: Array<{ outpostId: string; intruderCount: number }> };
    };

    expect(json.myGuild.outposts).toHaveLength(1);
    expect(json.myGuild.outposts[0]).toMatchObject({
      outpostId: "tile:2,3",
      intruderCount: 1,
    });
  });

  it("intruders API lists an enemy standing on the owned tile", async () => {
    h.profileOutside = true;
    const res = await getIntruders(
      new Request("http://t/api/v2/outpost/intruders?outpostId=tile%3A2%2C3"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      intruders: Array<{ userId: string; name: string; source: string }>;
    };

    expect(json.intruders).toEqual([
      expect.objectContaining({
        userId: "enemy",
        name: "침입자",
        source: "tile",
      }),
    ]);
  });
});
