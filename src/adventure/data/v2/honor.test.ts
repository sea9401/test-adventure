import { describe, expect, it } from "vitest";
import { parseHonor } from "./honor";

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
