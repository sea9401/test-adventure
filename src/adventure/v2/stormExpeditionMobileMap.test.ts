import { describe, expect, it } from "vitest";
import { STORM_EXPEDITION_ENTRANCE_NODE_IDS } from "@/adventure/data/v2/stormExpeditionMap";
import {
  stormExpeditionMobilePlanSummary,
  stormExpeditionMobileProgressSummary,
  stormExpeditionMobileWindow,
} from "./stormExpeditionMobileMap";

describe("폭풍 원정 모바일 축약 지도", () => {
  it("입장 전에는 세 입구만 짧은 캔버스에 표시한다", () => {
    const window = stormExpeditionMobileWindow(
      null,
      STORM_EXPEDITION_ENTRANCE_NODE_IDS,
    );

    expect(window.label).toBe("입구 선택");
    expect(window.height).toBe(180);
    expect(window.nodes.map((node) => node.id)).toEqual([
      "gale_outer",
      "thunder_outer",
      "wreckage_outer",
    ]);
  });

  it("분기점에서는 현재 노드와 바로 다음 세 경로만 표시한다", () => {
    const window = stormExpeditionMobileWindow("supply", [
      "gale_middle",
      "thunder_middle",
      "wreckage_middle",
    ]);

    expect(window.label).toBe("현재 + 다음 경로");
    expect(window.height).toBe(260);
    expect(window.nodes.map((node) => node.id)).toEqual([
      "supply",
      "gale_middle",
      "thunder_middle",
      "wreckage_middle",
    ]);
    expect(window.nodes.map((node) => node.id)).not.toContain("gale_camp");
    expect(window.nodes.map((node) => node.id)).not.toContain("altar");
  });

  it("다음 경로가 없으면 현재 체크포인트 하나만 표시한다", () => {
    const window = stormExpeditionMobileWindow("storm_heart", []);

    expect(window.label).toBe("현재 체크포인트");
    expect(window.height).toBe(180);
    expect(window.nodes).toEqual([
      { id: "storm_heart", x: 180, y: 90 },
    ]);
  });

  it("모든 노드를 360px 폭과 캔버스 높이 안에 배치한다", () => {
    const windows = [
      stormExpeditionMobileWindow(null, STORM_EXPEDITION_ENTRANCE_NODE_IDS),
      stormExpeditionMobileWindow("supply", [
        "gale_middle",
        "thunder_middle",
        "wreckage_middle",
      ]),
      stormExpeditionMobileWindow("gale_middle", ["gale_camp"]),
    ];

    for (const window of windows) {
      for (const node of window.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(360);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(window.height);
      }
    }
  });

  it("세 구간에 서로 다른 예약 항로를 한 줄로 요약한다", () => {
    expect(stormExpeditionMobilePlanSummary({
      version: 1,
      mode: "normal",
      outerRouteId: "gale",
      middleRouteId: "thunder",
      guardianRouteId: "wreckage",
      boonStrategy: "offense",
    })).toBe("예약 경로 · 외곽 칼바람 · 중층 뇌운 · 수호자 잔해");
  });

  it("완료한 방문 노드만 짧은 경로로 접어 표시한다", () => {
    expect(stormExpeditionMobileProgressSummary(
      ["gale_outer", "supply", "thunder_middle"],
      ["gale_outer", "supply"],
    )).toBe("완료 경로 · 칼바람 외곽 → 표류 보급품");
  });
});
