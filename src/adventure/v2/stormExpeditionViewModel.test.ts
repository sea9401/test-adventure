import { describe, expect, it } from "vitest";
import {
  stormExpeditionChooseRequest,
  stormExpeditionEntryActions,
  stormExpeditionFightRequest,
  stormExpeditionMoveRequest,
  stormExpeditionNodeIntent,
  stormExpeditionRiskRequest,
  stormExpeditionStartRequest,
} from "./stormExpeditionViewModel";

describe("stormExpeditionEntryActions", () => {
  it("입장 횟수가 남으면 실전과 연습을 모두 시작할 수 있다", () => {
    expect(stormExpeditionEntryActions(2)).toEqual({
      normal: { enabled: true, label: "실전 출발" },
      practice: {
        enabled: true,
        label: "연습 시작",
        description: "입장 횟수 소모 없음 · 보상 없음",
      },
    });
  });

  it("입장 횟수가 없어도 연습 시작은 유지한다", () => {
    expect(stormExpeditionEntryActions(0)).toEqual({
      normal: { enabled: false, label: "오늘 입장 완료" },
      practice: {
        enabled: true,
        label: "연습 시작",
        description: "입장 횟수 소모 없음 · 보상 없음",
      },
    });
  });
});

describe("폭풍 원정 지도 노드 의도", () => {
  const active = {
    currentNodeId: "gale_outer" as const,
    visitedNodeIds: ["gale_outer"] as const,
    completedNodeIds: [] as const,
    riskEvent: null,
  };

  it("입장 전 외곽 노드는 시작 이동 확인으로 분류한다", () => {
    expect(stormExpeditionNodeIntent("thunder_outer", null, ["gale_outer", "thunder_outer", "wreckage_outer"], "battle")).toEqual({ kind: "move" });
  });

  it("현재 전투와 선택 노드를 종류에 맞게 분류한다", () => {
    expect(stormExpeditionNodeIntent("gale_outer", active, [], "battle")).toEqual({ kind: "battle" });
    expect(stormExpeditionNodeIntent("supply", {
      ...active,
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
    }, [], "supply")).toEqual({ kind: "choice" });
  });

  it("현재 노드의 미결 위험 이벤트를 전투·정비보다 먼저 분류한다", () => {
    expect(stormExpeditionNodeIntent("supply", {
      ...active,
      currentNodeId: "supply",
      visitedNodeIds: ["gale_outer", "supply"],
      riskEvent: { status: "offered", triggerCheckpoint: "supply" },
    }, [], "supply")).toEqual({ kind: "risk" });
  });

  it("완료한 노드와 이동 가능한 다음 노드를 구분한다", () => {
    expect(stormExpeditionNodeIntent("gale_outer", {
      ...active,
      completedNodeIds: ["gale_outer"],
    }, ["supply"], "battle")).toEqual({ kind: "completed" });
    expect(stormExpeditionNodeIntent("supply", {
      ...active,
      completedNodeIds: ["gale_outer"],
    }, ["supply"], "supply")).toEqual({ kind: "move" });
  });

  it("진행할 수 없는 미래 노드는 정보 전용 잠금으로 분류한다", () => {
    expect(stormExpeditionNodeIntent("storm_heart", active, [], "battle")).toEqual({ kind: "locked" });
  });
});

describe("폭풍 원정 2단계 확정 요청", () => {
  it("시작 확정은 선택한 모드와 외곽 노드 ID를 보낸다", () => {
    expect(stormExpeditionStartRequest("practice", "thunder_outer")).toEqual({
      action: "start",
      mode: "practice",
      targetNodeId: "thunder_outer",
    });
  });

  it("이동 확정은 선택 노드와 서버 동시성 검증 위치를 보낸다", () => {
    expect(stormExpeditionMoveRequest("supply", "gale_outer", 1)).toEqual({
      action: "move",
      targetNodeId: "supply",
      expectedCurrentNodeId: "gale_outer",
      expectedEncounterIndex: 1,
    });
  });

  it("전투 요청은 현재 노드와 최신 연전 번호를 보낸다", () => {
    expect(stormExpeditionFightRequest("gale_outer", 1)).toEqual({
      action: "fight",
      expectedCurrentNodeId: "gale_outer",
      expectedEncounterIndex: 1,
    });
  });

  it("정비 요청은 선택 ID와 현재 위치를 함께 보낸다", () => {
    expect(stormExpeditionChooseRequest("storm_oil", "supply", 0)).toEqual({
      action: "choose",
      choiceId: "storm_oil",
      expectedCurrentNodeId: "supply",
      expectedEncounterIndex: 0,
    });
  });

  it("위험 이벤트 요청은 지나치기 결정과 현재 위치를 함께 보낸다", () => {
    expect(stormExpeditionRiskRequest("decline", "supply", 0)).toEqual({
      action: "risk_event",
      decision: "decline",
      expectedCurrentNodeId: "supply",
      expectedEncounterIndex: 0,
    });
  });
});
