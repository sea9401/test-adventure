import { describe, expect, it } from "vitest";
import {
  stormExpeditionChooseRequest,
  stormExpeditionEntryActions,
  stormExpeditionFightRequest,
  stormExpeditionMoveRequest,
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
