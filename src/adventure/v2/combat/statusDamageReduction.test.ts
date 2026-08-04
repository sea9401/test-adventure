import { describe, expect, it } from "vitest";
import { statusDamageAfterReduction } from "./combatShared";

describe("statusDamageAfterReduction", () => {
  it("reduces only the supplied status damage by the configured percentage", () => {
    expect(statusDamageAfterReduction(100, 65)).toBe(35);
    expect(statusDamageAfterReduction(3, 65)).toBe(1);
  });

  it("clamps malformed and out-of-range reduction values", () => {
    expect(statusDamageAfterReduction(100, undefined)).toBe(100);
    expect(statusDamageAfterReduction(100, -10)).toBe(100);
    expect(statusDamageAfterReduction(100, 120)).toBe(0);
    expect(statusDamageAfterReduction(-10, 65)).toBe(0);
  });
});
