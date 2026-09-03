import { describe, expect, it, vi } from "vitest";
import type { StormExpeditionAutoplayPlan } from "./stormExpeditionAutoplayPolicy";
import {
  chooseStormExpeditionBoon,
  chooseStormExpeditionCheckpointChoice,
  isStormExpeditionPlanCompatible,
  loadStormExpeditionResumePlan,
  loadStormExpeditionAutoplayDefaults,
  parseStoredStormExpeditionPlan,
  serializeStormExpeditionPlan,
  stormExpeditionPlannedNodeId,
  storeStormExpeditionAutoplayPlan,
  clearStormExpeditionAutoplayPlan,
  STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY,
  STORM_EXPEDITION_AUTOPLAY_PLAN_KEY,
  alignStormExpeditionPlanToVisitedRoutes,
  stormExpeditionRiskDecision,
} from "./stormExpeditionAutoplayPolicy";

const basePlan: StormExpeditionAutoplayPlan = {
  version: 1,
  mode: "normal",
  outerRouteId: "gale",
  middleRouteId: "thunder",
  guardianRouteId: "wreckage",
  boonStrategy: "offense",
};

const resources = (hp: number, maxHp: number, mp: number, maxMp: number) => ({
  hp,
  maxHp,
  mp,
  maxMp,
});

describe("폭풍 원정 일괄 진행 계획", () => {
  it("위험 이벤트 설정이 없는 기존 계획은 모든 이벤트를 안전하게 지나친다", () => {
    expect(stormExpeditionRiskDecision(basePlan, "rift_cache")).toBe("decline");
    expect(stormExpeditionRiskDecision(basePlan, "storm_contract")).toBe("decline");
  });

  it("이벤트별 수락 설정만 선택적으로 적용한다", () => {
    const configured = {
      ...basePlan,
      riskEventDecisions: {
        rift_cache: "accept" as const,
        golden_compass: "decline" as const,
      },
    };
    expect(stormExpeditionRiskDecision(configured, "rift_cache")).toBe("accept");
    expect(stormExpeditionRiskDecision(configured, "golden_compass")).toBe("decline");
    expect(stormExpeditionRiskDecision(configured, "unstable_blessing")).toBe("decline");
  });

  it("진행 중 방문한 항로는 현재 경로로 계획을 맞추고 남은 항로는 유지한다", () => {
    expect(alignStormExpeditionPlanToVisitedRoutes(basePlan, [
      "gale_outer",
      "supply",
      "wreckage_middle",
      "wreckage_camp",
    ])).toEqual({
      ...basePlan,
      outerRouteId: "gale",
      middleRouteId: "wreckage",
    });
  });

  it("외곽·중층·수호자 항로를 계획한 체크포인트 노드로 변환한다", () => {
    expect(stormExpeditionPlannedNodeId(basePlan, "outer")).toBe("gale_outer");
    expect(stormExpeditionPlannedNodeId(basePlan, "middle")).toBe("thunder_middle");
    expect(stormExpeditionPlannedNodeId(basePlan, "guardian")).toBe("wreckage_guardian");
  });

  it("방문한 외곽·중층·수호자 항로가 계획과 일치하면 재개할 수 있다", () => {
    expect(isStormExpeditionPlanCompatible(basePlan, [
      "gale_outer",
      "supply",
      "thunder_middle",
      "thunder_camp",
      "thunder_elite",
      "altar",
      "wreckage_guardian",
      "final_prep",
    ])).toBe(true);
  });

  it.each([
    ["외곽", ["thunder_outer"]],
    ["중층", ["gale_outer", "supply", "wreckage_middle"]],
    ["중층 야영지", ["gale_outer", "supply", "gale_camp"]],
    ["수호자", ["gale_outer", "supply", "thunder_middle", "altar", "gale_guardian"]],
  ] as const)("방문한 %s 항로가 계획과 다르면 재개하지 않는다", (_label, visited) => {
    expect(isStormExpeditionPlanCompatible(basePlan, visited)).toBe(false);
  });
});

describe("폭풍 원정 자동 축복 선택", () => {
  it.each([
    ["offense", ["storm_guard", "swift_fate"], [], "swift_fate"],
    ["survival", ["deep_mana", "storm_guard", "victory_vigor"], [], "victory_vigor"],
    ["resource", ["tempest_might", "deep_mana"], [], "deep_mana"],
  ] as const)("%s 전략은 제시된 축복 중 우선순위가 가장 높은 것을 고른다", (strategy, offered, owned, expected) => {
    expect(chooseStormExpeditionBoon(strategy, offered, owned)).toBe(expected);
  });

  it("이미 보유한 축복은 건너뛴다", () => {
    expect(chooseStormExpeditionBoon(
      "resource",
      ["deep_mana", "storm_guard"],
      ["deep_mana"],
    )).toBe("storm_guard");
  });

  it("제시된 선택 가능 축복이 없으면 임의 선택하지 않는다", () => {
    expect(chooseStormExpeditionBoon("survival", [], [])).toBeNull();
    expect(chooseStormExpeditionBoon("offense", ["tempest_might"], ["tempest_might"])).toBeNull();
  });
});

describe("폭풍 원정 자동 정비 선택", () => {
  it.each([
    [85, 90, "field_rations"],
    [90, 80, "mana_ampoule"],
    [70, 60, "mana_ampoule"],
    [60, 70, "field_rations"],
    [90, 90, "storm_oil"],
  ] as const)("보급에서 HP %s%%, MP %s%%이면 %s를 선택한다", (hp, mp, expected) => {
    expect(chooseStormExpeditionCheckpointChoice(
      "supply",
      resources(hp, 100, mp, 100),
    )).toBe(expected);
  });

  it("보급 자동 선택은 금고보다 생존과 완주를 우선한다", () => {
    expect(chooseStormExpeditionCheckpointChoice(
      "supply",
      resources(100, 100, 100, 100),
    )).not.toBe("scavenged_coffer");
  });

  it.each([
    [50, 95, "deep_rest"],
    [95, 50, "meditation"],
    [65, 55, "meditation"],
  ] as const)("야영에서 HP %s, MP %s의 유효 회복량과 동률 규칙에 맞는 %s를 선택한다", (hp, mp, expected) => {
    expect(chooseStormExpeditionCheckpointChoice(
      "camp",
      resources(hp, 100, mp, 100),
    )).toBe(expected);
  });

  it("야영 유효 회복량이 같으면 비율이 더 낮은 자원을 우선한다", () => {
    expect(chooseStormExpeditionCheckpointChoice(
      "camp",
      resources(50, 100, 85, 100),
    )).toBe("deep_rest");
  });

  it("야영 유효 회복량과 자원 비율이 모두 같으면 균형 정비를 선택한다", () => {
    expect(chooseStormExpeditionCheckpointChoice(
      "camp",
      resources(100, 100, 100, 100),
    )).toBe("balanced_rest");
  });

  it.each([
    [75, 80, "repair_armor"],
    [90, 65, "focus_mana"],
    [70, 50, "focus_mana"],
    [50, 60, "repair_armor"],
    [90, 90, "boss_slayer"],
  ] as const)("최종 정비에서 HP %s%%, MP %s%%이면 %s를 선택한다", (hp, mp, expected) => {
    expect(chooseStormExpeditionCheckpointChoice(
      "final_prep",
      resources(hp, 100, mp, 100),
    )).toBe(expected);
  });

  it("잘못된 최대 자원 값은 완전 회복 상태로 취급한다", () => {
    expect(chooseStormExpeditionCheckpointChoice(
      "supply",
      resources(0, 0, 0, 0),
    )).toBe("storm_oil");
  });
});

describe("폭풍 원정 자동 계획 저장 형식", () => {
  it("정상 계획을 직렬화하고 다시 검증해 읽는다", () => {
    expect(parseStoredStormExpeditionPlan(serializeStormExpeditionPlan(basePlan))).toEqual(basePlan);
  });

  it("저장된 이벤트 결정을 검증하고 잘못된 값은 안전한 기본값으로 버린다", () => {
    expect(parseStoredStormExpeditionPlan(JSON.stringify({
      ...basePlan,
      riskEventDecisions: {
        rift_cache: "accept",
        storm_contract: "always",
        unknown_event: "accept",
      },
    }))).toEqual({
      ...basePlan,
      riskEventDecisions: { rift_cache: "accept" },
    });
  });

  it.each([
    null,
    "",
    "not-json",
    JSON.stringify({ ...basePlan, version: 2 }),
    JSON.stringify({ ...basePlan, mode: "nightmare" }),
    JSON.stringify({ ...basePlan, outerRouteId: "sea" }),
    JSON.stringify({ ...basePlan, boonStrategy: "greed" }),
  ])("손상되거나 알 수 없는 계획 %j을 거부한다", (raw) => {
    expect(parseStoredStormExpeditionPlan(raw)).toBeNull();
  });

  it("실행 계획과 다음 원정 기본값을 분리해 저장한다", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    storeStormExpeditionAutoplayPlan(storage, basePlan);
    expect(storage.setItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY, JSON.stringify(basePlan));
    expect(storage.setItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY, JSON.stringify(basePlan));
  });

  it("다음 원정 기본값은 실행 계획과 별도로 읽는다", () => {
    const storage = {
      getItem: vi.fn((key: string) => key === STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY ? JSON.stringify(basePlan) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadStormExpeditionAutoplayDefaults(storage)).toEqual(basePlan);
    expect(storage.getItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY);
  });

  it("방문 이력과 호환되는 실행 계획만 명시적 재개 대상으로 읽는다", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(basePlan)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadStormExpeditionResumePlan(storage, ["gale_outer", "supply", "thunder_middle"])).toEqual(basePlan);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("손상되거나 방문 이력과 충돌하는 실행 계획은 폐기한다", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(basePlan)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadStormExpeditionResumePlan(storage, ["wreckage_outer"])).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
  });

  it("실행 계획을 지울 때 다음 원정 기본값은 보존한다", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    clearStormExpeditionAutoplayPlan(storage);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
  });
});
