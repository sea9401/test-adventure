import { describe, expect, it } from "vitest";
import { guildWeeklySuppliesFunded, markGuildWeeklySuppliesFunded } from "./guildWeeklySupplies";

describe("길드 주간 지원품", () => {
  const friday = new Date("2026-09-25T12:00:00.000Z");
  const nextMonday = new Date("2026-09-27T15:00:00.000Z");

  it("같은 주 중복 결제를 막고 다음 주에는 다시 열며 기존 연구를 보존한다", () => {
    const existing = [{ buffId: "combat_gold", tier: 10, installedAt: "2026-01-01T00:00:00.000Z" }];
    const funded = markGuildWeeklySuppliesFunded(existing, friday);

    expect(guildWeeklySuppliesFunded(funded, friday)).toBe(true);
    expect(guildWeeklySuppliesFunded(funded, nextMonday)).toBe(false);
    expect(funded).toContainEqual(existing[0]);
    expect(markGuildWeeklySuppliesFunded(funded, nextMonday)).toHaveLength(2);
  });
});
