import { describe, expect, it } from "vitest";
import {
  TREASURY_CLAIMER_SHARE_PCT,
  treasuryShares,
} from "./outposts";

describe("treasuryShares (거점 금고 분배 — 회수자/길드)", () => {
  it("합 보존 — 본인+길드 = 총액", () => {
    for (const total of [1, 9, 10, 99, 100, 3400, 12345]) {
      const { claimerShare, guildShare } = treasuryShares(total);
      expect(claimerShare + guildShare).toBe(total);
    }
  });
  it("본인 몫 = floor(10%)", () => {
    expect(treasuryShares(100).claimerShare).toBe(
      Math.floor((100 * TREASURY_CLAIMER_SHARE_PCT) / 100),
    );
    expect(treasuryShares(9).claimerShare).toBe(0); // 소액은 전부 길드
    expect(treasuryShares(3400)).toEqual({
      claimerShare: 340,
      guildShare: 3060,
    });
  });
  it("0/음수/소수 방어", () => {
    expect(treasuryShares(0)).toEqual({ claimerShare: 0, guildShare: 0 });
    expect(treasuryShares(-50)).toEqual({ claimerShare: 0, guildShare: 0 });
    expect(treasuryShares(10.9).claimerShare + treasuryShares(10.9).guildShare).toBe(10);
  });
});
