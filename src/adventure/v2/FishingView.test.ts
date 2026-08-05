import { describe, expect, it } from "vitest";
import { fishingTapAction, type FishingPhase } from "./FishingView";

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
