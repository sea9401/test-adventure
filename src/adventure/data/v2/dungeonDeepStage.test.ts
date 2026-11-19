import { describe, expect, it } from "vitest";
import {
  DEEP_STAGE_TITLE_IDS,
  deepStageDepthBonus,
  deepStageRequestError,
  deepStageTitleIds,
  deepStageTokenReward,
  maxSelectableDeepStage,
  parseDeepProgress,
  parseDeepStageRequest,
  recordDeepStageClear,
} from "./dungeonDeepStage";

describe("던전 심층 단계", () => {
  it("단계마다 적 깊이 가산치가 8씩 오른다", () => {
    expect([0, 1, 3, 30].map(deepStageDepthBonus)).toEqual([0, 8, 24, 240]);
    expect(deepStageDepthBonus(-2)).toBe(0);
  });

  it("실전 완주 증표는 10 + 2 × 단계이고 심층이 아니면 없다", () => {
    expect([0, 1, 10, 30].map(deepStageTokenReward)).toEqual([0, 12, 30, 70]);
  });

  it("한 번이라도 완주했으면 1단계가 열리고, 최고 완주 단계 다음 단계까지 고를 수 있다", () => {
    expect(maxSelectableDeepStage({ clears: 0, deepBest: 0 })).toBe(0);
    expect(maxSelectableDeepStage({ clears: 1, deepBest: 0 })).toBe(1);
    expect(maxSelectableDeepStage({ clears: 40, deepBest: 7 })).toBe(8);
  });

  it("단계 요청은 0 이상의 정수만 받는다", () => {
    expect(parseDeepStageRequest(undefined)).toBe(0);
    expect(parseDeepStageRequest(0)).toBe(0);
    expect(parseDeepStageRequest(12)).toBe(12);
    for (const bad of [-1, 1.5, "3", null, NaN, Infinity, {}]) {
      expect(parseDeepStageRequest(bad)).toBeNull();
    }
  });

  it("열리지 않은 단계는 거절한다", () => {
    const progress = { clears: 5, deepBest: 2 };
    expect(deepStageRequestError(0, progress)).toBeNull();
    expect(deepStageRequestError(3, progress)).toBeNull();
    expect(deepStageRequestError(4, progress)).toBe("deep_stage_locked");
    expect(deepStageRequestError(1, { clears: 0, deepBest: 0 })).toBe("deep_stage_locked");
  });

  it("더 높은 단계를 완주했을 때만 최고 단계와 도달 시각을 바꾼다", () => {
    const first = recordDeepStageClear({ deepBest: 0, deepBestAt: 0 }, 1, 1_000);
    expect(first).toEqual({ deepBest: 1, deepBestAt: 1_000 });
    expect(recordDeepStageClear(first, 1, 2_000)).toEqual(first);
    expect(recordDeepStageClear(first, 0, 2_000)).toEqual(first);
    expect(recordDeepStageClear(first, 2, 3_000)).toEqual({ deepBest: 2, deepBestAt: 3_000 });
  });

  it("세이브의 기록을 읽고 잘못된 값은 0으로 본다", () => {
    expect(parseDeepProgress({ deepBest: 4, deepBestAt: 99 })).toEqual({ deepBest: 4, deepBestAt: 99 });
    expect(parseDeepProgress({ deepBest: -3, deepBestAt: "x" })).toEqual({ deepBest: 0, deepBestAt: 0 });
    expect(parseDeepProgress(null)).toEqual({ deepBest: 0, deepBestAt: 0 });
  });

  it("칭호는 던전별 10·20·30단계에 받는다", () => {
    expect(deepStageTitleIds("storm", 9)).toEqual([]);
    expect(deepStageTitleIds("storm", 10)).toEqual([DEEP_STAGE_TITLE_IDS.storm[10]]);
    expect(deepStageTitleIds("sanctuary", 31)).toEqual([
      DEEP_STAGE_TITLE_IDS.sanctuary[10],
      DEEP_STAGE_TITLE_IDS.sanctuary[20],
      DEEP_STAGE_TITLE_IDS.sanctuary[30],
    ]);
  });
});
