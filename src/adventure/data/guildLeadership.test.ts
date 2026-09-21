import { describe, expect, it } from "vitest";
import { canClaimGuildLeadership } from "./guildLeadership";

describe("길드장 미접속 승계 조건", () => {
  const now = Date.parse("2026-09-21T05:00:00Z");
  const cutoff = now - 72 * 60 * 60 * 1000;

  it("정확히 72시간부터 승계할 수 있다", () => {
    expect(canClaimGuildLeadership(new Date(cutoff), now)).toBe(true);
    expect(canClaimGuildLeadership(new Date(cutoff - 1), now)).toBe(true);
    expect(canClaimGuildLeadership(new Date(cutoff + 1), now)).toBe(false);
  });

  it("접속 기록 누락·잘못된 시각·미래 시각은 승계를 허용하지 않는다", () => {
    for (const lastSeen of [null, undefined, new Date(NaN), new Date(now + 1)]) {
      expect(canClaimGuildLeadership(lastSeen, now)).toBe(false);
    }
  });
});
