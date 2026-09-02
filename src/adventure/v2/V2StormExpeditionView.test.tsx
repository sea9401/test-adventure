import { describe, expect, it, vi } from "vitest";
import {
  buildStormExpeditionAutoplayResultModel,
  confirmStormExpeditionExit,
  shouldShowAcceptedRisk,
  stormExpeditionArrivalNodeId,
  stormExpeditionErrorMessage,
  stormExpeditionResultAfterResponse,
  stormExpeditionStatusAfterResponse,
  stormExpeditionUnlockStatusText,
  stormUniqueDropPreview,
} from "./V2StormExpeditionView";
import type { StormExpeditionRiskEventOffer } from "@/adventure/data/v2/stormExpedition";

const rules = {
  guardianRouteChance: 0.03,
  finalRouteChance: 0.07,
  finalCrossChance: 0.04,
  finalHeartChance: 0.01,
};

describe("폭풍 원정 해금 진행 표시", () => {
  it("내부 숫자 진행도 대신 현재 사냥터 단계명을 표시한다", () => {
    expect(stormExpeditionUnlockStatusText(70)).toContain("심해 폐허 · 심부");
    expect(stormExpeditionUnlockStatusText(70)).not.toMatch(/\d+\/\d+단계/);
  });
});

describe("폭풍 원정 유니크 보상 미리보기", () => {
  it("수호자에서는 선택 항로 유니크 확률만 표시한다", () => {
    expect(stormUniqueDropPreview("guardian", rules, 1)).toEqual([
      "항로 유니크 3%",
    ]);
  });

  it("최종 보스에서는 경로·교차·심장 독립 확률을 모두 표시한다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 1)).toEqual([
      "항로 유니크 7.0%",
      "교차 유니크 4%",
      "폭풍심장 유니크 1%",
    ]);
  });

  it("폭풍 계약은 경로·교차만 2배이며 심장 확률은 바꾸지 않는다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 2)).toEqual([
      "항로 유니크 14.0%",
      "교차 유니크 8%",
      "폭풍심장 유니크 1%",
    ]);
  });

  it("일반·정예 전투에는 유니크 보상 문구를 표시하지 않는다", () => {
    expect(stormUniqueDropPreview("elite", rules, 2)).toEqual([]);
  });
});

describe("폭풍 원정 자진 이탈 확인", () => {
  it("확인을 취소하면 이탈하지 않고 확인 창은 한 번만 표시한다", async () => {
    const confirm = vi.fn(async () => false);
    const onExit = vi.fn();

    expect(
      await confirmStormExpeditionExit({ mode: "normal", confirm, onExit }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("귀환"));
    expect(onExit).not.toHaveBeenCalled();
  });

  it("확인하면 이탈 요청을 한 번만 실행한다", async () => {
    const confirm = vi.fn(async () => true);
    const onExit = vi.fn();

    expect(
      await confirmStormExpeditionExit({ mode: "practice", confirm, onExit }),
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

describe("폭풍 원정 수동 도착 모달", () => {
  const response = {
    error: undefined,
    state: { active: { currentNodeId: "supply" as const } },
  };

  it("수동 시작과 이동 성공 뒤에는 도착 노드를 연다", () => {
    expect(stormExpeditionArrivalNodeId("start", response)).toBe("supply");
    expect(stormExpeditionArrivalNodeId("move", response)).toBe("supply");
  });

  it("전투·선택 응답이나 오류·초기 로드에서는 모달을 강제로 열지 않는다", () => {
    expect(stormExpeditionArrivalNodeId("fight", response)).toBeNull();
    expect(stormExpeditionArrivalNodeId("move", { ...response, error: "stale_state" })).toBeNull();
    expect(stormExpeditionArrivalNodeId("move", { state: { active: null } })).toBeNull();
  });
});

describe("폭풍 원정 일괄 진행 결과 요약", () => {
  it("완주하면 최종 도달 지점과 확정 획득 보상을 요약한다", () => {
    expect(buildStormExpeditionAutoplayResultModel("complete", {
      currentNodeId: "storm_heart",
      nodes: [{ id: "storm_heart", name: "폭풍의 심장" }],
      gainedGold: 12_000,
      gainedMaterials: { storm_shard: 2 },
      gainedEquipment: [{ id: "reward-1" }],
    }, null)).toEqual({
      kind: "complete",
      reachedNodeName: "폭풍의 심장",
      rewards: ["12,000 G", "재료 2개", "장비 1개"],
    });
  });

  it("패배하면 직전 상태를 기준으로 잃은 임시 전리품을 요약한다", () => {
    expect(buildStormExpeditionAutoplayResultModel("defeated", {
      currentNodeId: "thunder_elite",
      nodes: [{ id: "thunder_elite", name: "뇌운 정예" }],
    }, {
      currentNodeId: "thunder_elite",
      pendingGold: 8_500,
      pendingMaterials: { storm_shard: 3, wreckage: 2 },
      pendingEquipment: [{ id: "lost-1" }, { id: "lost-2" }],
    })).toEqual({
      kind: "defeated",
      reachedNodeName: "뇌운 정예",
      lostLoot: ["8,500 G", "재료 5개", "장비 2개"],
    });
  });
});

describe("폭풍 원정 축약 오류 응답", () => {
  it("429 응답이 현재 원정 상태와 지표를 지우지 않는다", () => {
    const current = {
      ok: true,
      unlocked: true,
      attemptsLeft: 1,
      gold: 123_456,
      state: { clears: 33, active: null, spFruitPity: 0, spFruitObtained: 0 },
    };
    const response = { ok: false, error: "rate_limited", retryAfterSec: 17 };
    expect(stormExpeditionStatusAfterResponse(current, response)).toBe(current);
  });

  it("429 응답의 남은 대기 시간을 사용자에게 안내한다", () => {
    expect(stormExpeditionErrorMessage({
      error: "rate_limited",
      retryAfterSec: 17,
    })).toBe(
      "원정 요청이 많습니다. 17초 후 일괄 진행을 다시 시작해 주세요.",
    );
  });

  it("출발 요청에서 받은 429도 직전 결과처럼 숨기지 않는다", () => {
    const response = { ok: false, error: "rate_limited", retryAfterSec: 17 };

    expect(stormExpeditionResultAfterResponse("start", response, true)).toBe(response);
  });
});
