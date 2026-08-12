import { beforeEach, describe, expect, it, vi } from "vitest";

type StoreTx = { saves: Map<string, unknown> };

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  userId: "combat-preset-user" as string | null,
  lockOrder: [] as string[],
  failOnWriteKey: null as string | null,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: StoreTx) => unknown) => {
      const tx = { saves: new Map(mocks.saves) };
      const result = await callback(tx);
      mocks.saves.clear();
      for (const [key, value] of tx.saves) mocks.saves.set(key, value);
      return result;
    }),
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (tx: StoreTx, _userId: string, key: string, fallback: unknown) => {
      mocks.lockOrder.push(key);
      return tx.saves.has(key) ? tx.saves.get(key) : fallback;
    },
  ),
  readSave: vi.fn(
    async (executor: StoreTx | object, _userId: string, key: string, fallback: unknown) => {
      const saves = "saves" in executor ? executor.saves : mocks.saves;
      return saves.has(key) ? saves.get(key) : fallback;
    },
  ),
  upsertSave: vi.fn(
    async (tx: StoreTx, _userId: string, key: string, value: unknown) => {
      tx.saves.set(key, value);
      if (mocks.failOnWriteKey === key) throw new Error("forced write failure");
    },
  ),
}));

vi.mock("@/lib/server/codexSpBonus", () => ({
  readCodexSpBonus: vi.fn(async () => ({ total: 0 })),
}));

vi.mock("@/lib/server/jobUnlockContext", () => ({
  readJobUnlockContext: vi.fn(async () => ({
    currentClass: "warrior",
    unlocked: ["warrior"],
  })),
}));

import {
  COMBAT_LOADOUT_PRESETS_KEY,
  GET,
  POST,
} from "./route";

const STRIKE = "v2c_warrior_strike";
const MIGHT = "v2c_warrior_might";
const weapon = { iid: "weapon-1", id: "v2_iron_sword" } as const;

function request(body: unknown): Request {
  return new Request("http://localhost/api/v2/me/combat-loadout-presets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedCurrent() {
  mocks.saves.set("character.v2", {
    class: "warrior",
    level: 100,
    spFruitUsed: 0,
  });
  mocks.saves.set("proficiency.v2", {
    current: { group: "warrior" },
    groups: { warrior: { tier: 1, cumLevel: 100 } },
  });
  mocks.saves.set("skills.v2", {
    learned: [STRIKE],
    equipped: [STRIKE],
    pattern: {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: STRIKE },
        },
      ],
    },
    loadoutPresets: [{ name: "기존 스킬", skills: [STRIKE] }],
    presets: [{ name: "기존 패턴", pattern: { blocks: [] } }],
  });
  mocks.saves.set("equipment.v2", {
    owned: [weapon],
    equipped: { weapon: weapon.iid },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.userId = "combat-preset-user";
  mocks.lockOrder.length = 0;
  mocks.failOnWriteKey = null;
  seedCurrent();
});

describe("통합 전투 프리셋 API", () => {
  it("인증되지 않은 조회와 변경을 거부한다", async () => {
    mocks.userId = null;

    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: "save", slot: 0 }))).status).toBe(401);
    expect(mocks.saves.has(COMBAT_LOADOUT_PRESETS_KEY)).toBe(false);
  });

  it("잘못된 슬롯과 빈 슬롯 적용을 거부한다", async () => {
    expect((await POST(request({ action: "save", slot: 5 }))).status).toBe(400);

    const empty = await POST(request({ action: "apply", slot: 0 }));
    expect(empty.status).toBe(404);
    expect(await empty.json()).toMatchObject({
      ok: false,
      error: "empty_slot",
    });
  });

  it("현재 스킬·패턴·장비를 지정 슬롯 하나에 함께 저장하고 활성 슬롯을 찾는다", async () => {
    const response = await POST(
      request({ action: "save", slot: 2, name: " 사냥 " }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.presets).toHaveLength(5);
    expect(json.presets[2]).toMatchObject({
      name: "사냥",
      skills: [STRIKE],
      equipment: { weapon: weapon.iid },
    });
    expect(json.activeSlot).toBe(2);
    expect(mocks.lockOrder).toEqual([
      COMBAT_LOADOUT_PRESETS_KEY,
      "equipment.v2",
      "skills.v2",
    ]);

    const loaded = await GET();
    expect(loaded.status).toBe(200);
    expect((await loaded.json()).activeSlot).toBe(2);
  });

  it("덮어쓰기와 삭제는 지정 슬롯만 바꾸고 다섯 슬롯 위치를 보존한다", async () => {
    await POST(request({ action: "save", slot: 0, name: "첫째" }));
    await POST(request({ action: "save", slot: 2, name: "셋째" }));

    mocks.saves.set("equipment.v2", { owned: [weapon], equipped: {} });
    const overwritten = await POST(
      request({ action: "save", slot: 2, name: "셋째 수정" }),
    );
    expect((await overwritten.json()).presets[2]).toMatchObject({
      name: "셋째 수정",
      equipment: {},
    });

    const deleted = await POST(request({ action: "delete", slot: 2 }));
    const deletedJson = await deleted.json();
    expect(deletedJson.presets).toHaveLength(5);
    expect(deletedJson.presets[0]?.name).toBe("첫째");
    expect(deletedJson.presets[2]).toBeNull();
  });

  it("프리셋을 현재 보유 상태에 맞춰 스킬·패턴·장비에 한 번에 적용한다", async () => {
    const originalSkills = mocks.saves.get("skills.v2") as Record<string, unknown>;
    mocks.saves.set(COMBAT_LOADOUT_PRESETS_KEY, [
      {
        name: "사냥",
        savedAt: "2026-08-12T00:00:00.000Z",
        skills: [STRIKE, MIGHT],
        pattern: { blocks: [] },
        equipment: { weapon: weapon.iid, ring: "missing-ring" },
      },
      null,
      null,
      null,
      null,
    ]);
    mocks.saves.set("skills.v2", {
      ...originalSkills,
      equipped: [],
      pattern: null,
    });

    const response = await POST(request({ action: "apply", slot: 0 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.excluded).toEqual({
      skillIds: [MIGHT],
      equipmentIids: ["missing-ring"],
    });
    expect(mocks.saves.get("skills.v2")).toMatchObject({
      equipped: [STRIKE],
      pattern: { blocks: [] },
      loadoutPresets: originalSkills.loadoutPresets,
      presets: originalSkills.presets,
    });
    expect(mocks.saves.get("equipment.v2")).toMatchObject({
      owned: [weapon],
      equipped: { weapon: weapon.iid },
    });
    expect(mocks.lockOrder).toEqual([
      COMBAT_LOADOUT_PRESETS_KEY,
      "character.v2",
      "equipment.v2",
      "skills.v2",
      "proficiency.v2",
    ]);
  });

  it("적용 도중 저장이 실패하면 스킬과 장비 모두 원래 상태로 롤백한다", async () => {
    await POST(request({ action: "save", slot: 0, name: "원본" }));
    const beforeSkills = structuredClone(mocks.saves.get("skills.v2"));
    mocks.saves.set("skills.v2", {
      ...(beforeSkills as Record<string, unknown>),
      equipped: [],
    });
    mocks.saves.set("equipment.v2", { owned: [weapon], equipped: {} });
    const currentSkills = structuredClone(mocks.saves.get("skills.v2"));
    const currentEquipment = structuredClone(mocks.saves.get("equipment.v2"));
    mocks.failOnWriteKey = "skills.v2";

    await expect(POST(request({ action: "apply", slot: 0 }))).rejects.toThrow(
      "forced write failure",
    );
    expect(mocks.saves.get("skills.v2")).toEqual(currentSkills);
    expect(mocks.saves.get("equipment.v2")).toEqual(currentEquipment);
  });
});
