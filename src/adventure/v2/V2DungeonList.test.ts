import { describe, expect, it } from "vitest";
import {
  parseHiddenThemeStarts,
  stageRangeLabel,
  toggleHiddenTheme,
} from "./V2DungeonList";

describe("toggleHiddenTheme", () => {
  it("adds a visible theme start to the hidden set without mutating input", () => {
    const original = new Set([1]);
    const next = toggleHiddenTheme(original, 7);
    expect([...original]).toEqual([1]);
    expect([...next].sort((a, b) => a - b)).toEqual([1, 7]);
  });

  it("removes an already hidden theme start", () => {
    const next = toggleHiddenTheme(new Set([1, 7]), 7);
    expect([...next]).toEqual([1]);
  });
});

describe("parseHiddenThemeStarts", () => {
  it("keeps only positive finite numeric theme starts", () => {
    expect([...parseHiddenThemeStarts('[1,"7",-1,null,"bad",13.8]')]).toEqual([
      1, 7, 13,
    ]);
  });

  it("falls back to an empty set for invalid storage", () => {
    expect([...parseHiddenThemeStarts("not json")]).toEqual([]);
  });
});

describe("stageRangeLabel", () => {
  it("내부 대표 깊이를 플레이어용 단계명으로 표시", () => {
    expect(stageRangeLabel([2, 4, 6])).toBe("입구 · 심부 · 최심부");
    expect(stageRangeLabel([8])).toBe("입구");
  });
});
