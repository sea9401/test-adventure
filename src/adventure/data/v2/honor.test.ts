import { describe, expect, it } from "vitest";
import { parseHonor, parseHonorEarned } from "./honor";

describe("parseHonor", () => {
  it("정상 값 보존", () => {
    expect(parseHonor(100)).toBe(100);
    expect(parseHonor(0)).toBe(0);
  });
  it("소수는 절사", () => {
    expect(parseHonor(10.9)).toBe(10);
  });
  it("미설정/손상/음수/비유한 = 0", () => {
    expect(parseHonor(undefined)).toBe(0);
    expect(parseHonor(null)).toBe(0);
    expect(parseHonor("x")).toBe(0);
    expect(parseHonor(-5)).toBe(0);
    expect(parseHonor(Number.NaN)).toBe(0);
    expect(parseHonor(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parseHonorEarned", () => {
  it("저장된 누적값 보존(소수 절사)", () => {
    expect(parseHonorEarned(500, 100)).toBe(500);
    expect(parseHonorEarned(500.9, 100)).toBe(500);
  });
  it("레거시(미설정/손상) = 현재 보유로 폴백 → 누적 ≥ 보유", () => {
    expect(parseHonorEarned(undefined, 100)).toBe(100);
    expect(parseHonorEarned(null, 80)).toBe(80);
    expect(parseHonorEarned("x", 42)).toBe(42);
    expect(parseHonorEarned(-5, 30)).toBe(30);
  });
  it("저장값 < 보유면 보유로 끌어올림(불변 보장)", () => {
    expect(parseHonorEarned(10, 100)).toBe(100);
  });
  it("저장값 ≥ 보유면 저장값(소비로 보유만 줄어든 정상 상태)", () => {
    expect(parseHonorEarned(300, 120)).toBe(300);
  });
  it("둘 다 0/음수 = 0", () => {
    expect(parseHonorEarned(undefined, 0)).toBe(0);
    expect(parseHonorEarned(-1, -1)).toBe(0);
  });
});
