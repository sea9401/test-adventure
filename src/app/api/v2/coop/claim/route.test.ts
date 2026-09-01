import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    id: "personal-1",
    regionId: "tracking_weapon",
    hp: 0,
    maxHp: 10_800_000,
    defeatedAt: new Date(),
    summonerId: "owner",
  } as Record<string, unknown>,
  contributor: {
    userId: "owner",
    damage: 1,
    claimedAt: null,
    claimedRewardSnapshot: null,
  } as Record<string, unknown>,
  character: { materials: {}, unexplored: {} } as Record<string, unknown>,
  adventureLog: {} as Record<string, unknown>,
  appendEquipInstances: vi.fn(),
  grantTitle: vi.fn(),
  upsertSave: vi.fn(),
  updateSet: vi.fn(),
}));

function selectBuilder(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => rows),
    for: vi.fn(async () => rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set: vi.fn((value: unknown) => {
      mocks.updateSet(value);
      return builder;
    }),
    where: vi.fn(async () => undefined),
  };
  return builder;
}

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "owner"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string) =>
    key === "character.v2"
      ? structuredClone(mocks.character)
      : structuredClone(mocks.adventureLog),
  ),
  readSave: vi.fn(async () => ({})),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/equipGrant", () => ({
  appendEquipInstances: mocks.appendEquipInstances,
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  mintRolledEquipInstance: vi.fn((id: string) => ({ iid: `iid-${id}`, id })),
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  applyUniqueEquipmentAcquisitions: vi.fn(({ adventureLogRaw }) =>
    adventureLogRaw,
  ),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: mocks.grantTitle,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationCoopProgress: vi.fn(async () => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      let selectIndex = 0;
      const selectRows = [[mocks.session], [mocks.contributor]];
      return callback({
        select: vi.fn(() => selectBuilder(selectRows[selectIndex++] ?? [])),
        update: vi.fn(() => updateBuilder()),
      });
    }),
  },
}));

import { POST } from "./route";
import { UNEXPLORED_BOSSES } from "@/adventure/data/v2/unexploredBosses";
import { UNEXPLORED_BOSS_CORE_MATERIAL } from "@/adventure/data/v2/unexploredBosses";

function request() {
  return new Request("http://localhost/api/v2/coop/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "personal-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = {
    id: "personal-1",
    regionId: "tracking_weapon",
    hp: 0,
    maxHp: 10_800_000,
    defeatedAt: new Date(),
    summonerId: "owner",
  };
  mocks.contributor = {
    userId: "owner",
    damage: 1,
    claimedAt: null,
    claimedRewardSnapshot: null,
  };
  mocks.character = { materials: {}, unexplored: {} };
  mocks.adventureLog = {};
  mocks.appendEquipInstances.mockResolvedValue(
    UNEXPLORED_BOSSES.tracking_weapon.uniqueDrops.map((drop) => ({
      iid: `iid-${drop.equipmentId}`,
      id: drop.equipmentId,
    })),
  );
  mocks.grantTitle.mockResolvedValue(true);
  mocks.upsertSave.mockResolvedValue(undefined);
});

describe("POST /api/v2/coop/claim — 개인 보스", () => {
  it("핵·연결 재료와 세 독립 고유를 지급하고 최초 칭호를 기록한다", async () => {
    mocks.adventureLog = {
      coopBossKinds: ["mountain_chief", "lake_sovereign"],
    };
    const rolls = [0.29, 0.09, 0.004, 0];
    vi.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0.999);
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reward).toMatchObject({
      rewardMode: "unexplored_personal",
      bossCore: 1,
      poolMaterialCount: 1,
      uniqueIds: UNEXPLORED_BOSSES.tracking_weapon.uniqueDrops.map(
        (drop) => drop.equipmentId,
      ),
    });
    expect(mocks.appendEquipInstances).toHaveBeenCalledWith(
      expect.anything(),
      "owner",
      expect.arrayContaining([
        expect.objectContaining({
          id: UNEXPLORED_BOSSES.tracking_weapon.uniqueDrops[2].equipmentId,
        }),
      ]),
    );
    expect(mocks.grantTitle).toHaveBeenCalledWith(
      expect.anything(),
      "owner",
      UNEXPLORED_BOSSES.tracking_weapon.titleId,
      expect.any(Number),
    );
    const characterWrite = mocks.upsertSave.mock.calls.find(
      (call) => call[2] === "character.v2",
    )?.[3] as {
      materials: Record<string, number>;
      unexplored: { achievementIds: string[] };
    };
    expect(characterWrite.materials[UNEXPLORED_BOSS_CORE_MATERIAL.id]).toBe(1);
    expect(Object.values(characterWrite.materials)).toContain(1);
    expect(characterWrite.unexplored.achievementIds).toEqual([
      "first_personal_boss",
      "defeat_tracking_weapon",
    ]);
  });

  it("claim 재시도는 저장된 스냅샷을 그대로 반환하고 재지급하지 않는다", async () => {
    const snapshot = {
      rewardMode: "unexplored_personal",
      bossCore: 1,
      poolMaterialId: "saved-material",
      poolMaterialCount: 1,
      uniqueIds: ["saved-unique"],
    };
    mocks.contributor = {
      ...mocks.contributor,
      claimedAt: new Date(),
      claimedRewardSnapshot: snapshot,
    };
    const response = await POST(request());
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      alreadyClaimed: true,
      reward: snapshot,
    });
    expect(mocks.appendEquipInstances).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("불괴의 성채 핵·연결 재료와 30%·10%·0.5% 독립 고유를 지급한다", async () => {
    const fortress = UNEXPLORED_BOSSES.invincible_fortress;
    mocks.session.regionId = "invincible_fortress";
    mocks.appendEquipInstances.mockResolvedValue(
      fortress.uniqueDrops.map((drop) => ({
        iid: `iid-${drop.equipmentId}`,
        id: drop.equipmentId,
      })),
    );
    const rolls = [0.29, 0.09, 0.004, 0];
    vi.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0.999);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reward).toMatchObject({
      rewardMode: "unexplored_personal",
      bossCore: 1,
      uniqueIds: fortress.uniqueDrops.map((drop) => drop.equipmentId),
      titleId: fortress.titleId,
    });
    expect(body.reward).not.toHaveProperty("pity");
    expect(body.reward).not.toHaveProperty("guaranteedDropProgress");
    const characterWrite = mocks.upsertSave.mock.calls.find(
      (call) => call[2] === "character.v2",
    )?.[3] as { unexplored: { achievementIds: string[] } };
    expect(characterWrite.unexplored.achievementIds).toEqual([
      "first_personal_boss",
      "defeat_invincible_fortress",
    ]);
  });

  it("불멸의 광전왕 핵·전용 장비·칭호·처치 업적을 지급한다", async () => {
    const immortal = UNEXPLORED_BOSSES.immortal_berserker;
    mocks.session.regionId = "immortal_berserker";
    mocks.appendEquipInstances.mockResolvedValue(
      immortal.uniqueDrops.map((drop) => ({
        iid: `iid-${drop.equipmentId}`,
        id: drop.equipmentId,
      })),
    );
    const rolls = [0.29, 0.09, 0.004, 0];
    vi.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0.999);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reward).toMatchObject({
      rewardMode: "unexplored_personal",
      bossCore: 1,
      uniqueIds: immortal.uniqueDrops.map((drop) => drop.equipmentId),
      titleId: immortal.titleId,
    });
    expect(mocks.grantTitle).toHaveBeenCalledWith(
      expect.anything(),
      "owner",
      immortal.titleId,
      expect.any(Number),
    );
    const characterWrite = mocks.upsertSave.mock.calls.find(
      (call) => call[2] === "character.v2",
    )?.[3] as { unexplored: { achievementIds: string[] } };
    expect(characterWrite.unexplored.achievementIds).toEqual([
      "first_personal_boss",
      "defeat_immortal_berserker",
    ]);
  });

  it("소환자가 아니면 보상을 조회하거나 받지 못한다", async () => {
    mocks.session.summonerId = "other";
    const response = await POST(request());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "no_permission",
    });
  });
});
