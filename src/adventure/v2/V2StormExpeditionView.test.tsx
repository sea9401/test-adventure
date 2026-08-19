import { describe, expect, it, vi } from "vitest";
import {
  confirmStormExpeditionExit,
  shouldShowAcceptedRisk,
  stormUniqueDropPreview,
} from "./V2StormExpeditionView";
import type { StormExpeditionRiskEventOffer } from "@/adventure/data/v2/stormExpedition";

const rules = {
  guardianRouteChance: 0.0015,
  finalRouteChance: 0.004,
  finalCrossChance: 0.002,
  finalHeartChance: 0.0005,
};

describe("폭풍 원정 유니크 보상 미리보기", () => {
  it("수호자에서는 선택 항로 유니크 확률만 표시한다", () => {
    expect(stormUniqueDropPreview("guardian", rules, 1)).toEqual([
      "항로 유니크 0.15%",
    ]);
  });

  it("최종 보스에서는 경로·교차·심장 독립 확률을 모두 표시한다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 1)).toEqual([
      "항로 유니크 0.40%",
      "교차 유니크 0.20%",
      "폭풍심장 유니크 0.05%",
    ]);
  });

  it("폭풍 계약은 경로·교차만 2배이며 심장 확률은 바꾸지 않는다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 2)).toEqual([
      "항로 유니크 0.80%",
      "교차 유니크 0.40%",
      "폭풍심장 유니크 0.05%",
    ]);
  });

  it("일반·정예 전투에는 유니크 보상 문구를 표시하지 않는다", () => {
    expect(stormUniqueDropPreview("elite", rules, 2)).toEqual([]);
  });
});

describe("폭풍 원정 자진 이탈 확인", () => {
  it("확인을 취소하면 이탈하지 않고 확인 창은 한 번만 표시한다", () => {
    const confirm = vi.fn(() => false);
    const onExit = vi.fn();

    expect(
      confirmStormExpeditionExit({ mode: "normal", confirm, onExit }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("귀환"));
    expect(onExit).not.toHaveBeenCalled();
  });

  it("확인하면 이탈 요청을 한 번만 실행한다", () => {
    const confirm = vi.fn(() => true);
    const onExit = vi.fn();

    expect(
      confirmStormExpeditionExit({ mode: "practice", confirm, onExit }),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("연습 원정"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("폭풍 원정 적용 중인 위험 표시", () => {
  const acceptedRisk = (
    id: StormExpeditionRiskEventOffer["id"],
  ): StormExpeditionRiskEventOffer => ({
    id,
    triggerCheckpoint: "supply",
    status: "accepted",
    boonId: null,
    curseId: null,
  });

  it("균열 상자는 강화 전투 대가가 남아 있을 때만 표시한다", () => {
    const riftCache = acceptedRisk("rift_cache");

    expect(shouldShowAcceptedRisk(riftCache, ["risk_enemy_fury"])).toBe(true);
    expect(shouldShowAcceptedRisk(riftCache, [])).toBe(false);
  });

  it("남은 원정에 적용되는 위험은 다음 전투 효과가 없어도 표시한다", () => {
    expect(shouldShowAcceptedRisk(acceptedRisk("storm_contract"), [])).toBe(true);
  });
});
