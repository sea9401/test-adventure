import { describe, expect, it, vi } from "vitest";

const { store, rollout } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  rollout: {
    startedAt: null as number | null,
    endsAt: null as number | null,
    active: false,
  },
}));

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

vi.mock("@/lib/server/jobSpRollout", () => ({
  readJobSpRebalanceState: vi.fn(async () => ({ ...rollout })),
}));

import {
  reconcileV2EquippedSkills,
  reconcileV2EquippedSkillsWithResult,
  sanitizeCombatLoadout,
} from "@/lib/server/v2Skills";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  V2_JOB_LIST,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

const FRUIT_BUDGET_LOADOUT = [
  "v2c_warrior_strike", // 4
  "v2c_mage_boltcast", // 5
  "v2c_warrior_might", // 3
] as const;

const OVER_BUDGET_LOADOUT = [
  "v2c_warrior_strike",
  "v2c_mage_fireball",
  "v2c_mage_shield",
  "v2c_archmage_collapse",
  "v2c_primordialmage_return",
  "v2c_absolute_unity",
  "v2c_blackmoon_dominion",
] as const;

const FARMING_UNLOCK_LOADOUT = [
  "v2c_warrior_strike",
  "v2c_mage_fireball",
  "v2c_mage_barrage",
  "v2c_mage_shield",
  "v2c_martial_combo",
  "v2c_rogue_poison",
  "v2c_warrior_warcry",
] as const;

const REBALANCE_LOADOUT = [
  "v2c_warrior_strike",
  "v2c_warrior_flurry",
  "v2c_warrior_sunder",
  "v2c_warrior_warcry",
  "v2c_martial_combo",
  "v2c_martial_chi",
  "v2c_mage_fireball",
  "v2c_mage_barrage",
  "v2c_mage_shield",
  "v2c_mage_meditate",
  "v2c_rogue_poison",
  "v2c_martial_steelguard",
  "v2c_mage_boltcast",
  "v2c_warrior_might",
  "v2c_martial_fortitude",
  "v2c_mage_acumen",
  "v2c_rogue_finesse",
  "v2c_survivor_firstaid",
  "v2c_survivor_knowledge",
  "v2c_none_toughness",
  "v2c_none_diligence",
  "v2c_shieldman_bash",
  "v2c_squire_cleave",
  "v2c_boxer_combo",
  "v2c_monk_palm",
  "v2c_caster_bolt",
  "v2c_acolyte_smite",
  "v2c_warder_barrier",
  "v2c_assassin_ambush",
  "v2c_archer_volley",
  "v2c_venomist_toxiccloud",
  "v2c_camper_camp",
  "v2c_ironman_brace",
  "v2c_shieldman_vitality",
  "v2c_squire_might",
  "v2c_boxer_fortitude",
  "v2c_monk_spirit",
] as const;
const REBALANCED_EQUIPPED = [
  ...REBALANCE_LOADOUT.slice(0, 33),
  "v2c_boxer_fortitude",
] as const;
const REBALANCED_REMOVED = [
  "v2c_shieldman_vitality",
  "v2c_squire_might",
  "v2c_monk_spirit",
] as const;

function fullyUnlocked(): {
  proficiency: V2ProficiencyState;
  context: JobUnlockContext;
} {
  const proficiency = emptyProficiency();
  const completedQuestIds = new Set<string>();
  const killCounts: Record<string, number> = {};
  for (const job of V2_JOB_LIST) {
    proficiency.groups[job.id] = {
      cultivations: 0,
      tier: 1,
      cumLevel: 1_000_000,
    };
    proficiency.jobCumLevel ??= {};
    proficiency.jobCumLevel[job.id] = 1_000_000;
    for (const condition of job.unlock.extraConditions ?? []) {
      if (condition.type === "questCompleted") {
        completedQuestIds.add(condition.questId);
      }
      if (condition.type === "monsterKilled") {
        killCounts[condition.monsterId] = condition.minCount;
      }
      if (condition.type === "statThreshold") {
        proficiency.caps[condition.stat] = condition.min;
      }
    }
  }
  return {
    proficiency,
    context: {
      completedQuestIds,
      killCounts,
      farmingLevel: 1_000,
      cookingLevel: 1_000,
      woodcuttingLevel: 1_000,
      miningLevel: 1_000,
    },
  };
}

function seedRebalanceStore(proficiency: V2ProficiencyState) {
  const questIds = V2_JOB_LIST.flatMap((job) =>
    (job.unlock.extraConditions ?? [])
      .filter((condition) => condition.type === "questCompleted")
      .map((condition) => condition.questId),
  );
  store.clear();
  store.set("character.v2", { class: "warrior", level: 100 });
  store.set("skills.v2", {
    learned: [...REBALANCE_LOADOUT],
    equipped: [...REBALANCE_LOADOUT],
  });
  store.set("proficiency.v2", proficiency);
  store.set("guide-quests.v2", { claimed: questIds });
  store.set("farm.v2", { stats: { farmingXp: 1_000_000 } });
  store.set("cooking.v1", { xp: 1_000_000 });
  store.set("woodcutting-log.v1", { cuts: 1_000_000, xp: 1_000_000 });
  store.set("mining-log.v1", { successes: 1_000_000, xp: 1_000_000 });
}

describe("v2Skills — SP 열매 보너스 예산", () => {
  it("마법사는 누락된 코어 기본기 마력탄을 전투 직전에 지급·장착한다", () => {
    const next = sanitizeCombatLoadout(
      { learned: [], equipped: [] },
      { class: "mage", level: 1 },
      { points: 0, groups: {}, caps: {}, grown: {} },
    );

    expect(next.learned).toEqual(["v2c_mage_boltcast"]);
    expect(next.equipped).toEqual(["v2c_mage_boltcast"]);
  });

  it("기존 마법사 세이브에도 누락된 마력탄을 영속 백필한다", async () => {
    store.clear();
    store.set("character.v2", { class: "mage", level: 1 });
    store.set("skills.v2", { learned: [], equipped: [] });
    store.set("proficiency.v2", { points: 0, groups: {}, caps: {}, grown: {} });

    const next = await reconcileV2EquippedSkills({} as DbExecutor, "u-mage");

    expect(next.learned).toEqual(["v2c_mage_boltcast"]);
    expect(next.equipped).toEqual(["v2c_mage_boltcast"]);
    expect(store.get("skills.v2")).toMatchObject(next);
  });

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

  it("농사 레벨로 해금한 직업의 SP까지 state reconcile 과 전투 검증에 반영한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "survivor",
      level: 100,
    });
    store.set("skills.v2", {
      learned: [...FARMING_UNLOCK_LOADOUT],
      equipped: [...FARMING_UNLOCK_LOADOUT],
    });
    const proficiency = {
      points: 0,
      groups: {
        survivor: { tier: 1, cultivations: 0, cumLevel: 900 },
      },
      caps: {},
      grown: {},
    };
    store.set("proficiency.v2", proficiency);
    store.set("farm.v2", {
      stats: {
        harvests: 0,
        rareHarvests: 0,
        deliveries: 0,
        reputation: 0,
        reputationSpent: 0,
        farmingXp: 810,
      },
    });

    const reconciled = await reconcileV2EquippedSkills(
      {} as DbExecutor,
      "u-farmer",
    );
    expect(reconciled.equipped).toEqual([...FARMING_UNLOCK_LOADOUT]);

    const combat = sanitizeCombatLoadout(
      {
        learned: [...FARMING_UNLOCK_LOADOUT],
        equipped: [...FARMING_UNLOCK_LOADOUT],
      },
      { class: "survivor", level: 100 },
      proficiency,
      0,
      { farmingLevel: 10 },
    );
    expect(combat.equipped).toEqual([...FARMING_UNLOCK_LOADOUT]);
  });
});

describe("v2Skills — 직업 SP 산식 전환 유예", () => {
  it("유예 중 기존 로드아웃은 종전 직업당 +1 예산으로 전투에 사용한다", () => {
    const { proficiency, context } = fullyUnlocked();
    context.jobSpRebalance = {
      startedAt: 1,
      endsAt: 24 * 60 * 60 * 1_000 + 1,
      active: true,
    };

    const next = sanitizeCombatLoadout(
      {
        learned: [...REBALANCE_LOADOUT],
        equipped: [...REBALANCE_LOADOUT],
      },
      { class: "warrior", level: 100 },
      proficiency,
      0,
      context,
    );

    expect(next.equipped).toEqual([...REBALANCE_LOADOUT]);
  });

  it("유예 종료 후에는 현재 우선순위를 보존하며 신규 131 SP 안으로 정리한다", () => {
    const { proficiency, context } = fullyUnlocked();
    context.jobSpRebalance = {
      startedAt: 1,
      endsAt: 24 * 60 * 60 * 1_000 + 1,
      active: false,
    };

    const next = sanitizeCombatLoadout(
      {
        learned: [...REBALANCE_LOADOUT],
        equipped: [...REBALANCE_LOADOUT],
      },
      { class: "warrior", level: 100 },
      proficiency,
      0,
      context,
    );

    expect(next.equipped).toEqual(REBALANCED_EQUIPPED);
  });

  it("state reconcile도 유예 중인 저장 로드아웃을 종전 예산으로 보존한다", async () => {
    const { proficiency } = fullyUnlocked();
    seedRebalanceStore(proficiency);
    rollout.startedAt = 1;
    rollout.endsAt = 24 * 60 * 60 * 1_000 + 1;
    rollout.active = true;

    const next = await reconcileV2EquippedSkills(
      {} as DbExecutor,
      "u-rebalance-grace",
    );

    expect(next.equipped).toEqual([...REBALANCE_LOADOUT]);
    expect(
      (store.get("skills.v2") as { equipped: string[] }).equipped,
    ).toEqual([...REBALANCE_LOADOUT]);
  });

  it("유예 종료 첫 reconcile만 신규 한도로 빠진 스킬을 보고한다", async () => {
    const { proficiency } = fullyUnlocked();
    seedRebalanceStore(proficiency);
    rollout.startedAt = 1;
    rollout.endsAt = 24 * 60 * 60 * 1_000 + 1;
    rollout.active = false;

    const first = await reconcileV2EquippedSkillsWithResult(
      {} as DbExecutor,
      "u-rebalance-ended",
    );
    const second = await reconcileV2EquippedSkillsWithResult(
      {} as DbExecutor,
      "u-rebalance-ended",
    );

    expect(first.skills.equipped).toEqual(REBALANCED_EQUIPPED);
    expect(first.migration).toMatchObject({
      graceActive: false,
      removedSkillIds: REBALANCED_REMOVED,
    });
    expect(second.migration?.removedSkillIds).toEqual([]);
  });

  it("core 조회에서 생긴 조정 알림을 전체 로드아웃 조회까지 보존한다", async () => {
    const { proficiency } = fullyUnlocked();
    seedRebalanceStore(proficiency);
    rollout.startedAt = 1;
    rollout.endsAt = 24 * 60 * 60 * 1_000 + 1;
    rollout.active = false;

    await reconcileV2EquippedSkillsWithResult(
      {} as DbExecutor,
      "u-core-first",
      { consumeJobSpNotice: false },
    );
    const storedCharacter = store.get("character.v2") as {
      jobSpRebalanceNotice?: { removedSkillIds?: string[] };
    };
    const fullView = await reconcileV2EquippedSkillsWithResult(
      {} as DbExecutor,
      "u-core-first",
      { consumeJobSpNotice: true },
    );
    const repeatedFullView = await reconcileV2EquippedSkillsWithResult(
      {} as DbExecutor,
      "u-core-first",
      { consumeJobSpNotice: true },
    );

    expect(storedCharacter.jobSpRebalanceNotice?.removedSkillIds).toEqual(
      REBALANCED_REMOVED,
    );
    expect(fullView.migration?.removedSkillIds).toEqual(
      REBALANCED_REMOVED,
    );
    expect(
      (store.get("character.v2") as { jobSpRebalanceNotice?: unknown })
        .jobSpRebalanceNotice,
    ).toBeUndefined();
    expect(repeatedFullView.migration?.removedSkillIds).toEqual([]);
  });
});
