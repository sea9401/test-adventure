import { describe, it, expect } from "vitest";
import { crossMapGatesFrom } from "./edge-requirement";
import type { AdventureLog } from "../log/storage";

// 최소 로그 stub — bestiary/trial 평가에 안 쓰이는 cross-map 게이트(여기선 story/visited)만 검증.
const emptyLog = {} as AdventureLog;
const baseCtx = (over: Partial<Parameters<typeof crossMapGatesFrom>[1]> = {}) => ({
  log: emptyLog,
  isTrialCleared: () => true,
  hasStoryFlag: () => false,
  visitedRegionIds: [] as string[] as never,
  ...over,
});

describe("crossMapGatesFrom", () => {
  it("깊은 동굴 → 별빛 갱도 게이트가 노출되고, apex 플래그 없으면 잠금", () => {
    const gates = crossMapGatesFrom("deep_cave", baseCtx());
    const starfall = gates.find((g) => g.to === "starfall_cave");
    expect(starfall).toBeDefined();
    expect(starfall!.status.met).toBe(false);
    // 잠금 사유(스토리 게이트 reason)가 노출돼야 함 — UI 힌트용.
    expect(starfall!.status.reason).toBeTruthy();
  });

  it("endgame_apex_defeated 플래그가 있으면 깊은 동굴 → 별빛 갱도 통과", () => {
    const gates = crossMapGatesFrom(
      "deep_cave",
      baseCtx({ hasStoryFlag: (id) => id === "endgame_apex_defeated" }),
    );
    const starfall = gates.find((g) => g.to === "starfall_cave");
    expect(starfall?.status.met).toBe(true);
  });

  it("별빛 갱도에서 본토(깊은 동굴)로 되돌아가는 cross-map 게이트는 자유 통과", () => {
    // story 게이트는 역방향에 적용 안 함(한 번 발견한 길은 자유) → met=true.
    const gates = crossMapGatesFrom("starfall_cave", baseCtx());
    const back = gates.find((g) => g.to === "deep_cave");
    expect(back).toBeDefined();
    expect(back!.status.met).toBe(true);
  });

  it("같은 맵(본토) 안에서는 cross-map 게이트가 없다", () => {
    // 시작 마을은 본토 안 이웃만 가짐 → cross-map 게이트 0.
    expect(crossMapGatesFrom("village", baseCtx())).toHaveLength(0);
  });
});
