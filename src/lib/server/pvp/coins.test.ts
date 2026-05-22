import { describe, it, expect } from "vitest";
import {
  coinRewardFor,
  applyDailyCappedCoins,
  kstDayKey,
  PVP_DAILY_COIN_CAP,
} from "./coins";

describe("coinRewardFor", () => {
  it("인간 상대 — 승 10 / 무 4 / 패 2", () => {
    expect(coinRewardFor("a_win", false)).toBe(10);
    expect(coinRewardFor("draw", false)).toBe(4);
    expect(coinRewardFor("d_win", false)).toBe(2); // 챌린저 패배
  });
  it("봇 상대 — ×0.5 floor (5 / 2 / 1)", () => {
    expect(coinRewardFor("a_win", true)).toBe(5);
    expect(coinRewardFor("draw", true)).toBe(2);
    expect(coinRewardFor("d_win", true)).toBe(1);
  });
});

describe("kstDayKey", () => {
  it("UTC 15:00 = KST 다음날 0시 → 다음날 키", () => {
    // 2026-05-23 15:00 UTC = 2026-05-24 00:00 KST.
    expect(kstDayKey(new Date("2026-05-23T15:00:00Z"))).toBe("2026-05-24");
    expect(kstDayKey(new Date("2026-05-23T14:59:00Z"))).toBe("2026-05-23");
  });
});

describe("applyDailyCappedCoins", () => {
  const today = new Date("2026-05-23T05:00:00Z"); // KST 14:00 2026-05-23

  it("첫 지급(dailyResetAt null) — 전액 지급, 누적 갱신", () => {
    const r = applyDailyCappedCoins(0, null, 10, today);
    expect(r.awarded).toBe(10);
    expect(r.newDailyEarned).toBe(10);
    expect(r.newResetAt).toBe(today);
  });

  it("같은 날 누적 — 캡 남은 만큼만 지급", () => {
    const r = applyDailyCappedCoins(PVP_DAILY_COIN_CAP - 4, today, 10, today);
    expect(r.awarded).toBe(4); // 100-96=4 남음
    expect(r.newDailyEarned).toBe(PVP_DAILY_COIN_CAP);
  });

  it("같은 날 캡 도달 — 0 지급", () => {
    const r = applyDailyCappedCoins(PVP_DAILY_COIN_CAP, today, 10, today);
    expect(r.awarded).toBe(0);
    expect(r.newDailyEarned).toBe(PVP_DAILY_COIN_CAP);
    expect(r.newResetAt).toBe(today); // 같은 날이라 reset 시각 유지
  });

  it("다른 날(어제 reset) — 누적 0 으로 리셋 후 지급", () => {
    const yesterday = new Date("2026-05-22T05:00:00Z");
    const r = applyDailyCappedCoins(PVP_DAILY_COIN_CAP, yesterday, 10, today);
    expect(r.awarded).toBe(10); // 새 날이라 캡 초기화
    expect(r.newDailyEarned).toBe(10);
    expect(r.newResetAt).toBe(today); // 리셋 시각 = now
  });

  it("base 가 캡보다 커도 캡 남은 만큼만", () => {
    const r = applyDailyCappedCoins(0, today, PVP_DAILY_COIN_CAP + 50, today);
    expect(r.awarded).toBe(PVP_DAILY_COIN_CAP);
  });
});
