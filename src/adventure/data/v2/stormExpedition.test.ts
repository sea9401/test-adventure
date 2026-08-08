import { describe, expect, it } from "vitest";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_NODES,
  STORM_EXPEDITION_ROUTES,
  createStormAltarOffers,
  createStormRiskEvent,
  parseStormExpeditionState,
  stormExpeditionBattleReward,
  stormExpeditionEncounterDepth,
  stormExpeditionEnemy,
} from "./stormExpedition";

describe("stormExpedition", () => {
  it("새 날짜에는 입장 횟수만 초기화하고 진행 중 원정은 보존한다", () => {
    const state = parseStormExpeditionState({
      date: "2026-07-10",
      attemptsUsed: 3,
      clears: 2,
      active: {
        routeId: "gale",
        stage: 2,
        hp: 123,
        mp: 45,
        pendingGold: 46_000,
      },
    }, "2026-07-11");

    expect(state.attemptsUsed).toBe(0);
    expect(state.clears).toBe(2);
    expect(state.active).toMatchObject({
      version: 2,
      routeId: "gale",
      nodeIndex: 4,
      encounterIndex: 0,
      defeatedCount: 2,
      hp: 123,
      mp: 45,
      pendingGold: 46_000,
      pendingMaterials: {},
      pendingEquipment: [],
      usedRecoverySkillIds: [],
    });
  });

  it("원정 회복기 사용 기록은 허용된 스킬만 중복 없이 복원한다", () => {
    const state = parseStormExpeditionState({
      date: "2026-07-11",
      active: {
        version: 2,
        routeId: "gale",
        nodeIndex: 2,
        encounterIndex: 0,
        hp: 500,
        mp: 100,
        usedRecoverySkillIds: [
          "v2c_survivor_firstaid",
          "v2c_survivor_firstaid",
          "v2c_shadow_shadowstep",
          "unknown",
        ],
      },
    }, "2026-07-11");

    expect(state.active?.usedRecoverySkillIds).toEqual([
      "v2c_survivor_firstaid",
    ]);
  });

  it("손상된 저장값을 안전한 범위로 정규화한다", () => {
    const state = parseStormExpeditionState({
      date: "2026-07-11",
      attemptsUsed: 999,
      clears: -4,
      active: { routeId: "unknown", stage: 99 },
    }, "2026-07-11");

    expect(state.attemptsUsed).toBe(STORM_EXPEDITION_DAILY_ATTEMPTS);
    expect(state.clears).toBe(0);
    expect(state.active).toBeNull();
  });

  it("세 항로가 서로 다른 전투 성격과 우두머리를 가진다", () => {
    expect(STORM_EXPEDITION_ROUTES.map((route) => route.id)).toEqual([
      "gale",
      "thunder",
      "wreckage",
    ]);

    const gale = stormExpeditionEnemy("gale", "guardian");
    const thunder = stormExpeditionEnemy("thunder", "guardian");
    const wreckage = stormExpeditionEnemy("wreckage", "guardian");
    expect(gale.evasionPct).toBeGreaterThan(wreckage.evasionPct ?? 0);
    expect(thunder.atkType).toBe("magic");
    expect(thunder.v2Skills?.equipped.length).toBeGreaterThan(1);
    expect(wreckage.def).toBeGreaterThan(gale.def);
    expect(wreckage.statusDamageReductionPct).toBeGreaterThan(
      gale.statusDamageReductionPct ?? 0,
    );
    expect(new Set([gale.name, thunder.name, wreckage.name]).size).toBe(3);
  });

  it("원정 적도 HP·공격력보다 역할별 방어 유틸 비중이 높다", () => {
    const gale = stormExpeditionEnemy("gale", "guardian");
    const thunder = stormExpeditionEnemy("thunder", "guardian");
    const wreckage = stormExpeditionEnemy("wreckage", "guardian");
    const galeHeart = stormExpeditionEnemy("gale", "final_boss");
    const thunderHeart = stormExpeditionEnemy("thunder", "final_boss");
    const wreckageHeart = stormExpeditionEnemy("wreckage", "final_boss");

    expect(gale.evasionPct).toBeGreaterThan(thunder.evasionPct ?? 0);
    expect(thunder.magicDef).toBeGreaterThan(gale.magicDef ?? 0);
    expect(wreckage.def).toBeGreaterThan(thunder.def);
    expect(wreckage.statusDamageReductionPct).toBe(60);
    expect(galeHeart.statusDamageReductionPct).toBe(30);
    expect(galeHeart.v2Skills).toBeUndefined();
    expect(galeHeart.skill?.kind).toBe("pierce");
    expect(thunderHeart.v2Skills?.equipped).toHaveLength(2);
    expect(thunderHeart.magicDef).toBeLessThan(galeHeart.def);
    expect(wreckageHeart.v2Skills).toBeUndefined();
    expect(wreckageHeart.skill?.kind).toBe("heavy_blow");
    expect(wreckageHeart.spd).toBeLessThan(thunderHeart.spd);
  });

  it("뇌운 정예는 단일 마법, 수호자는 연속 마법 패턴을 사용한다", () => {
    const elite = stormExpeditionEnemy("thunder", "elite");
    const guardian = stormExpeditionEnemy("thunder", "guardian");

    expect(elite.v2Skills?.equipped).toEqual(["mob_arcane_burst"]);
    expect(guardian.v2Skills?.equipped).toEqual([
      "mob_arcane_nova",
      "mob_arcane_burst",
    ]);
  });

  it("9개 노드 사이에 7개 전투와 공통 최종 보스를 배치한다", () => {
    expect(STORM_EXPEDITION_NODES).toHaveLength(9);
    expect(STORM_EXPEDITION_NODES.filter((node) => node.kind === "battle"))
      .toHaveLength(5);
    expect(STORM_EXPEDITION_NODES.reduce(
      (sum, node) => sum + (node.encounterCount ?? 0),
      0,
    )).toBe(7);
    expect(STORM_EXPEDITION_NODES.at(-1)?.id).toBe("storm_heart");
  });

  it("초반 연전은 완화하고 최종 보스 스케일은 유지한다", () => {
    expect([
      stormExpeditionEncounterDepth("early_trash", 0),
      stormExpeditionEncounterDepth("early_trash", 1),
      stormExpeditionEncounterDepth("late_trash", 0),
      stormExpeditionEncounterDepth("late_trash", 1),
      stormExpeditionEncounterDepth("elite"),
      stormExpeditionEncounterDepth("guardian"),
      stormExpeditionEncounterDepth("final_boss"),
    ]).toEqual([65, 66, 67, 68, 71, 74, 76]);
  });

  it("후반 전투일수록 골드가 증가하고 완주 기본 골드는 262,000G다", () => {
    const rewards = [
      stormExpeditionBattleReward("early_trash", 0),
      stormExpeditionBattleReward("early_trash", 1),
      stormExpeditionBattleReward("late_trash", 0),
      stormExpeditionBattleReward("late_trash", 1),
      stormExpeditionBattleReward("elite"),
      stormExpeditionBattleReward("guardian"),
      stormExpeditionBattleReward("final_boss"),
    ];
    expect(rewards).toEqual([12_000, 14_000, 18_000, 20_000, 38_000, 65_000, 95_000]);
    expect(rewards.reduce((sum, reward) => sum + reward, 0)).toBe(262_000);
  });

  it("제단은 중복 없이 다섯 축복 중 세 개를 제시한다", () => {
    const offers = createStormAltarOffers(() => 0);
    expect(offers).toHaveLength(3);
    expect(new Set(offers).size).toBe(3);
  });

  it("위험 이벤트는 출발 시 종류와 불안정한 축복 결과까지 고정한다", () => {
    expect(createStormRiskEvent(() => 0)).toMatchObject({
      id: "rift_cache",
      nodeIndex: 1,
      status: "offered",
    });
    expect(createStormRiskEvent(() => 0.26)).toMatchObject({
      id: "storm_contract",
      nodeIndex: 1,
    });
    const unstable = createStormRiskEvent(() => 0.51);
    expect(unstable).toMatchObject({
      id: "unstable_blessing",
      nodeIndex: 5,
      boonId: "swift_fate",
      curseId: "mana_fracture",
    });
    expect(createStormRiskEvent(() => 0.99)).toMatchObject({
      id: "golden_compass",
      nodeIndex: 3,
    });
  });
});
