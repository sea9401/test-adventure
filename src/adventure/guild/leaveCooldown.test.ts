import { describe, expect, it } from "vitest";
import { GUILD_LEAVE_COOLDOWN_DAYS } from "@/adventure/data/guild";
import { leaveCooldownWindowText } from "./leaveCooldown";

// 2026-10-16 19:33 KST = 10:33 UTC
const UNTIL = Date.UTC(2026, 9, 16, 10, 33);

describe("탈퇴/추방 쿨다운 기간 안내", () => {
  it("시작·해제 시각과 남은 시간을 KST로 보여준다", () => {
    expect(GUILD_LEAVE_COOLDOWN_DAYS).toBe(1);
    const now = UNTIL - (3 * 60 + 12) * 60_000;
    expect(leaveCooldownWindowText(UNTIL, now)).toBe(
      "2026.10.15 19:33부터 2026.10.16 19:33까지 · 3시간 12분 남음",
    );
  });

  it("1시간 미만이면 분만, 1분 미만은 1분으로 올림한다", () => {
    expect(leaveCooldownWindowText(UNTIL, UNTIL - 5 * 60_000)).toMatch(
      /· 5분 남음$/,
    );
    expect(leaveCooldownWindowText(UNTIL, UNTIL - 10_000)).toMatch(
      /· 1분 남음$/,
    );
  });
});
