import { describe, expect, it, vi } from "vitest";
import {
  STORM_EXPEDITION_ALTAR_CHOICES,
  STORM_EXPEDITION_CAMP_CHOICES,
  STORM_EXPEDITION_FINAL_PREP_CHOICES,
  STORM_EXPEDITION_SUPPLY_CHOICES,
  type StormExpeditionRiskEventOffer,
} from "@/adventure/data/v2/stormExpedition";
import { STORM_EXPEDITION_MAP_NODES } from "@/adventure/data/v2/stormExpeditionMap";
import type { StormExpeditionAutoplayPlan } from "./stormExpeditionAutoplayPolicy";
import type { StormExpeditionActionRequest } from "./stormExpeditionViewModel";
import {
  nextStormExpeditionAutoplayStep,
  runStormExpeditionAutoplay,
  type StormExpeditionAutoplayActive,
  type StormExpeditionAutoplayStatus,
} from "./stormExpeditionAutoplay";

const plan: StormExpeditionAutoplayPlan = {
  version: 1,
  mode: "normal",
  outerRouteId: "gale",
  middleRouteId: "thunder",
  guardianRouteId: "wreckage",
  boonStrategy: "offense",
};

const choices = {
  supply: STORM_EXPEDITION_SUPPLY_CHOICES,
  camp: STORM_EXPEDITION_CAMP_CHOICES,
  altar: STORM_EXPEDITION_ALTAR_CHOICES,
  final_prep: STORM_EXPEDITION_FINAL_PREP_CHOICES,
};

function active(
  overrides: Partial<StormExpeditionAutoplayActive> = {},
): StormExpeditionAutoplayActive {
  return {
    mode: "normal",
    currentNodeId: "gale_outer",
    visitedNodeIds: ["gale_outer"],
    completedNodeIds: [],
    encounterIndex: 0,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    boons: [],
    altarOffers: ["storm_guard", "swift_fate", "deep_mana"],
    riskEvent: null,
    ...overrides,
  };
}

function status(
  current: StormExpeditionAutoplayActive | null,
  overrides: Partial<StormExpeditionAutoplayStatus> = {},
): StormExpeditionAutoplayStatus {
  return {
    ok: true,
    state: { active: current },
    nodes: STORM_EXPEDITION_MAP_NODES,
    choices,
    availableNextNodeIds: [],
    ...overrides,
  };
}

describe("폭풍 원정 다음 자동 행동", () => {
  it("활성 원정이 없으면 계획한 외곽 항로로 시작한다", () => {
    expect(nextStormExpeditionAutoplayStep(status(null), plan)).toEqual({
      kind: "request",
      label: "칼바람 외곽 출발 중",
      request: { action: "start", mode: "normal", targetNodeId: "gale_outer" },
    });
  });

  it("현재 체크포인트에 위험 이벤트가 대기하면 다른 행동보다 먼저 지나친다", () => {
    const riskEvent: StormExpeditionRiskEventOffer = {
      id: "rift_cache",
      triggerCheckpoint: "supply",
      status: "offered",
      boonId: null,
      curseId: null,
    };
    const current = active({
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
      riskEvent,
    });

    expect(nextStormExpeditionAutoplayStep(status(current), plan)).toEqual({
      kind: "request",
      label: "균열 상자 지나치는 중",
      request: {
        action: "risk_event",
        decision: "decline",
        expectedCurrentNodeId: "supply",
        expectedEncounterIndex: 0,
      },
    });
  });

  it("미완료 전투는 최신 노드와 연전 번호로 싸운다", () => {
    const current = active({ encounterIndex: 1 });
    expect(nextStormExpeditionAutoplayStep(status(current), plan)).toEqual({
      kind: "request",
      label: "칼바람 외곽 2전 전투 중",
      request: {
        action: "fight",
        expectedCurrentNodeId: "gale_outer",
        expectedEncounterIndex: 1,
      },
    });
  });

  it("보급은 최신 HP와 MP로 자동 선택한다", () => {
    const current = active({
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
      hp: 60,
      mp: 70,
    });
    expect(nextStormExpeditionAutoplayStep(status(current), plan)).toEqual({
      kind: "request",
      label: "응급 식량 선택 중",
      request: {
        action: "choose",
        choiceId: "field_rations",
        expectedCurrentNodeId: "supply",
        expectedEncounterIndex: 0,
      },
    });
  });

  it("제단은 제시되고 미보유한 축복 중 전략 우선순위가 높은 것을 고른다", () => {
    const current = active({
      currentNodeId: "altar",
      visitedNodeIds: ["gale_outer", "supply", "thunder_middle", "thunder_camp", "thunder_elite", "altar"],
      boons: ["swift_fate"],
      altarOffers: ["storm_guard", "swift_fate", "deep_mana"],
    });
    expect(nextStormExpeditionAutoplayStep(status(current), plan)).toEqual({
      kind: "request",
      label: "폭풍의 가호 선택 중",
      request: {
        action: "choose",
        choiceId: "storm_guard",
        expectedCurrentNodeId: "altar",
        expectedEncounterIndex: 0,
      },
    });
  });

  it.each([
    ["supply", "thunder_middle"],
    ["altar", "wreckage_guardian"],
  ] as const)("완료한 %s에서 계획한 분기 %s로 이동한다", (currentNodeId, targetNodeId) => {
    const current = active({
      currentNodeId,
      visitedNodeIds: currentNodeId === "supply"
        ? ["gale_outer", "supply"]
        : ["gale_outer", "supply", "thunder_middle", "thunder_camp", "thunder_elite", "altar"],
      completedNodeIds: [currentNodeId],
    });
    expect(nextStormExpeditionAutoplayStep(status(current, {
      availableNextNodeIds: currentNodeId === "supply"
        ? ["gale_middle", "thunder_middle", "wreckage_middle"]
        : ["gale_guardian", "thunder_guardian", "wreckage_guardian"],
    }), plan)).toMatchObject({
      kind: "request",
      request: { action: "move", targetNodeId },
    });
  });

  it("완료한 공통 경로에서는 연결된 유일한 다음 노드로 이동한다", () => {
    const current = active({
      currentNodeId: "final_prep",
      visitedNodeIds: ["gale_outer", "supply", "thunder_middle", "thunder_camp", "thunder_elite", "altar", "wreckage_guardian", "final_prep"],
      completedNodeIds: ["final_prep"],
    });
    expect(nextStormExpeditionAutoplayStep(status(current, {
      availableNextNodeIds: ["storm_heart"],
    }), plan)).toMatchObject({
      kind: "request",
      request: { action: "move", targetNodeId: "storm_heart" },
    });
  });

  it("계획한 다음 노드가 이동 가능 목록에 없으면 임의 경로를 고르지 않는다", () => {
    const current = active({
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
      completedNodeIds: ["supply"],
    });
    expect(nextStormExpeditionAutoplayStep(status(current, {
      availableNextNodeIds: ["gale_middle"],
    }), plan)).toEqual({
      kind: "conflict",
      message: "계획한 뇌운 중층으로 이동할 수 없습니다.",
    });
  });

  it("선택 카탈로그에 정책 결과가 없으면 임의 선택하지 않는다", () => {
    const current = active({
      currentNodeId: "altar",
      visitedNodeIds: ["gale_outer", "supply", "thunder_middle", "thunder_camp", "thunder_elite", "altar"],
      altarOffers: ["swift_fate"],
      boons: ["swift_fate"],
    });
    expect(nextStormExpeditionAutoplayStep(status(current), plan)).toEqual({
      kind: "conflict",
      message: "자동으로 선택할 수 있는 제단 축복이 없습니다.",
    });
  });

  it("패배와 완주는 추가 요청을 만들지 않는다", () => {
    expect(nextStormExpeditionAutoplayStep(status(null, { failed: true }), plan)).toEqual({ kind: "defeated" });
    expect(nextStormExpeditionAutoplayStep(status(null, { bossClear: true }), plan)).toEqual({ kind: "complete" });
    expect(nextStormExpeditionAutoplayStep(status(null, { practiceCompleted: true }), plan)).toEqual({ kind: "complete" });
  });
});

describe("폭풍 원정 자동 진행 실행기", () => {
  it("각 서버 응답을 반영한 뒤 start, fight, move, choose를 한 번씩 순서대로 보낸다", async () => {
    const started = status(active());
    const fought = status(active({ completedNodeIds: ["gale_outer"] }), {
      availableNextNodeIds: ["supply"],
    });
    const moved = status(active({
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
    }));
    const completed = status(null, { bossClear: true });
    const responses = [started, fought, moved, completed];
    const request = vi.fn(async (_action: StormExpeditionActionRequest) => responses.shift()!);
    const onStatus = vi.fn();

    const result = await runStormExpeditionAutoplay({
      initialStatus: status(null),
      plan,
      request,
      onStatus,
      shouldStop: () => false,
    });

    expect(result).toEqual({ kind: "complete", status: completed });
    expect(request.mock.calls.map(([action]) => action.action)).toEqual(["start", "fight", "move", "choose"]);
    expect(onStatus.mock.calls.map(([value]) => value)).toEqual([started, fought, moved, completed]);
  });

  it("중단 요청은 현재 응답을 반영한 뒤 다음 요청을 보내지 않는다", async () => {
    let stopped = false;
    const started = status(active());
    const request = vi.fn(async () => started);

    const result = await runStormExpeditionAutoplay({
      initialStatus: status(null),
      plan,
      request,
      onStatus: () => { stopped = true; },
      shouldStop: () => stopped,
    });

    expect(result).toEqual({ kind: "stopped", status: started });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류가 나면 마지막 서버 상태에서 멈춘다", async () => {
    const error = new Error("offline");
    const request = vi.fn(async () => { throw error; });
    const initialStatus = status(null);

    await expect(runStormExpeditionAutoplay({
      initialStatus,
      plan,
      request,
      onStatus: () => undefined,
      shouldStop: () => false,
    })).resolves.toEqual({ kind: "error", error, status: initialStatus });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stale_state 응답은 상태를 반영하고 즉시 중단한다", async () => {
    const stale = status(active(), { ok: false, error: "stale_state" });
    const onStatus = vi.fn();

    const result = await runStormExpeditionAutoplay({
      initialStatus: status(null),
      plan,
      request: async () => stale,
      onStatus,
      shouldStop: () => false,
    });

    expect(result).toEqual({ kind: "stale", status: stale });
    expect(onStatus).toHaveBeenCalledWith(stale, "칼바람 외곽 출발 중");
  });
});
