import { describe, expect, it } from "vitest";
import {
  normalizeHiddenThemeStarts,
  parseHiddenThemeStarts,
} from "./dungeonThemeVisibility";

describe("사냥터 표시 설정 정규화", () => {
  it("양의 유한 정수만 중복 없이 오름차순으로 보관한다", () => {
    expect(
      normalizeHiddenThemeStarts([13.8, "7", 1, 7, -1, null, "bad"]),
    ).toEqual([1, 7, 13]);
  });

  it("손상된 로컬 저장값은 빈 설정으로 복구한다", () => {
    expect([...parseHiddenThemeStarts("not json")]).toEqual([]);
    expect([...parseHiddenThemeStarts('[13.8,"7",1,7,-1,null]')]).toEqual([
      1, 7, 13,
    ]);
  });
});
