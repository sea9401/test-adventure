import { describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import {
  reconcileV2EquippedSkills,
  sanitizeCombatLoadout,
} from "@/lib/server/v2Skills";
import type { DbExecutor } from "@/lib/server/savesKv";

const FRUIT_BUDGET_LOADOUT = [
  "v2c_warrior_strike", // 5
  "v2c_mage_boltcast", // 5
  "v2c_warrior_might", // 3
] as const;

const OVER_BUDGET_LOADOUT = [
  "v2c_warrior_strike",
  "v2c_mage_fireball",
  "v2c_mage_barrage",
  "v2c_mage_shield",
  "v2c_martial_combo",
  "v2c_rogue_poison",
] as const;

describe("v2Skills — SP 열매 보너스 예산", () => {
  it("state reconcile 이 spFruitUsed 보너스를 반영해 수동 로드아웃을 보존한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      level: 100,
      spFruitUsed: { 1: 3 },
    });
    store.set("skills.v2", {
      learned: [...FRUIT_BUDGET_LOADOUT],
      equipped: [...FRUIT_BUDGET_LOADOUT],
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {},
      caps: {},
      grown: {},
    });

    const next = await reconcileV2EquippedSkills({} as DbExecutor, "u-test");

    expect(next.equipped).toEqual([...FRUIT_BUDGET_LOADOUT]);
    expect((store.get("skills.v2") as { equipped: string[] }).equipped).toEqual(
      [...FRUIT_BUDGET_LOADOUT],
    );
  });

  it("state reconcile 이 장착 목록을 정리해도 로드아웃 프리셋은 보존한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      level: 100,
    });
    store.set("skills.v2", {
      learned: [...OVER_BUDGET_LOADOUT],
      equipped: [...OVER_BUDGET_LOADOUT],
      loadoutPresets: [
        {
          name: "보스용",
          skills: ["v2c_warrior_strike", "v2c_mage_boltcast"],
        },
      ],
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {},
      caps: {},
      grown: {},
    });

    const next = await reconcileV2EquippedSkills({} as DbExecutor, "u-test");

    expect(next.equipped.length).toBeLessThan(OVER_BUDGET_LOADOUT.length);
    expect(next.loadoutPresets).toEqual([
      {
        name: "보스용",
        skills: ["v2c_warrior_strike", "v2c_mage_boltcast"],
      },
    ]);
    expect(
      (store.get("skills.v2") as { loadoutPresets?: unknown }).loadoutPresets,
    ).toEqual(next.loadoutPresets);
  });

  it("전투 직전 sanitize 도 spFruitUsed 보너스를 반영한다", () => {
    const next = sanitizeCombatLoadout(
      {
        learned: [...FRUIT_BUDGET_LOADOUT],
        equipped: [...FRUIT_BUDGET_LOADOUT],
      },
      {
        class: "warrior",
        level: 100,
        spFruitUsed: { 1: 3 },
      },
      {
        points: 0,
        groups: {},
        caps: {},
        grown: {},
      },
    );

    expect(next.equipped).toEqual([...FRUIT_BUDGET_LOADOUT]);
  });
});
