import { describe, expect, it } from "vitest";
import {
  fishingTapAction,
  isFishingActivePhase,
  type FishingPhase,
} from "./FishingView";

describe("낚시 중앙 탭 동작", () => {
  it.each<[FishingPhase, "cast" | "reel" | null]>([
    ["idle", "cast"],
    ["casting", null],
    ["waiting", "reel"],
    ["biting", "reel"],
    ["resolving", null],
    ["result", "cast"],
  ])("%s 단계에서 %s 동작을 선택한다", (phase, action) => {
    expect(fishingTapAction(phase)).toBe(action);
  });
});

describe("낚시 진행 상태", () => {
  it.each<[FishingPhase, boolean]>([
    ["idle", false],
    ["casting", true],
    ["waiting", true],
    ["biting", true],
    ["resolving", true],
    ["result", false],
  ])("%s 단계의 낚시 진행 상태는 %s다", (phase, active) => {
    expect(isFishingActivePhase(phase)).toBe(active);
  });
});
