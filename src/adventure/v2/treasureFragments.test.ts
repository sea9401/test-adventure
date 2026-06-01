import { describe, it, expect } from "vitest";
import {
  FRAGMENTS_PER_MAP,
  addFragments,
  assemblableMaps,
  emptyTreasureFragments,
  parseTreasureFragments,
  rollFragmentDrop,
  spendOneMap,
} from "./treasureFragments";

describe("parseTreasureFragments", () => {
  it("손상/누락 입력 → 0", () => {
    expect(parseTreasureFragments(null)).toEqual({ fragments: 0 });
    expect(parseTreasureFragments("x")).toEqual({ fragments: 0 });
    expect(parseTreasureFragments({})).toEqual({ fragments: 0 });
    expect(parseTreasureFragments({ fragments: "5" })).toEqual({ fragments: 0 });
  });

  it("음수·소수는 정규화(0 클램프 + floor)", () => {
    expect(parseTreasureFragments({ fragments: -3 })).toEqual({ fragments: 0 });
    expect(parseTreasureFragments({ fragments: 7.9 })).toEqual({ fragments: 7 });
    expect(parseTreasureFragments({ fragments: 12 })).toEqual({ fragments: 12 });
  });
});

describe("addFragments", () => {
  it("양의 정수만 더함", () => {
    expect(addFragments(emptyTreasureFragments(), 1).fragments).toBe(1);
    expect(addFragments({ fragments: 4 }, 2).fragments).toBe(6);
  });

  it("0·음수·비유한은 무변경", () => {
    const s = { fragments: 4 };
    expect(addFragments(s, 0)).toBe(s);
    expect(addFragments(s, -1)).toBe(s);
    expect(addFragments(s, Infinity)).toBe(s);
  });
});

describe("assemblableMaps", () => {
  it("floor(조각 / K)", () => {
    expect(assemblableMaps({ fragments: 0 })).toBe(0);
    expect(assemblableMaps({ fragments: FRAGMENTS_PER_MAP - 1 })).toBe(0);
    expect(assemblableMaps({ fragments: FRAGMENTS_PER_MAP })).toBe(1);
    expect(assemblableMaps({ fragments: FRAGMENTS_PER_MAP * 2 + 3 })).toBe(2);
  });
});

describe("spendOneMap", () => {
  it("K개 미만이면 null", () => {
    expect(spendOneMap({ fragments: FRAGMENTS_PER_MAP - 1 })).toBeNull();
    expect(spendOneMap({ fragments: 0 })).toBeNull();
  });
  it("K개 이상이면 K 차감", () => {
    expect(spendOneMap({ fragments: FRAGMENTS_PER_MAP })).toEqual({ fragments: 0 });
    expect(spendOneMap({ fragments: FRAGMENTS_PER_MAP + 2 })).toEqual({ fragments: 2 });
  });
});

describe("rollFragmentDrop", () => {
  it("rng < chance → 1, 아니면 0", () => {
    expect(rollFragmentDrop(() => 0.05, 0.12)).toBe(1);
    expect(rollFragmentDrop(() => 0.5, 0.12)).toBe(0);
    expect(rollFragmentDrop(() => 0.12, 0.12)).toBe(0); // 경계 미만만 성공
  });

  it("chance 0/1 경계", () => {
    expect(rollFragmentDrop(() => 0, 0)).toBe(0); // 0 확률은 절대 안 나옴
    expect(rollFragmentDrop(() => 0.999, 1)).toBe(1); // 1 확률은 항상
  });
});
