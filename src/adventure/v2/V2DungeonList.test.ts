import { describe, expect, it } from "vitest";
import {
  parseHiddenThemeStarts,
  rareMapUnavailable,
  removeExpiredRareMap,
  stageRangeLabel,
  toggleHiddenTheme,
} from "./V2DungeonList";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";

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

describe("rareMapUnavailable", () => {
  it("현재 진행도보다 깊은 사냥 지도만 사용 불가로 표시한다", () => {
    const now = Date.now();
    expect(
      rareMapUnavailable(newRareMapInstance("worn_map", 12, now), 10),
    ).toContain("현재 사용 불가");
    expect(
      rareMapUnavailable(newRareMapInstance("worn_map", 11, now), 10),
    ).toBeNull();
    expect(
      rareMapUnavailable(newRareMapInstance("rename_map", 99, now), 10),
    ).toBeNull();
  });
});

describe("removeExpiredRareMap", () => {
  it("만료된 iid 한 장만 열린 지도 목록에서 제거한다", () => {
    const first = newRareMapInstance("worn_map", 10, 1, "rm-first");
    const expired = newRareMapInstance("gilded_map", 12, 1, "rm-expired");
    const last = newRareMapInstance("rename_map", 14, 1, "rm-last");

    expect(removeExpiredRareMap([first, expired, last], expired.iid)).toEqual([
      first,
      last,
    ]);
  });
});
