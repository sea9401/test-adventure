import { describe, it, expect } from "vitest";
import {
  applyCatchCoin,
  FISHING_CATCH_COIN_BY_TIER,
  FISHING_CATCH_COIN_DAILY_CAP,
} from "./coins";

describe("applyCatchCoin — 챔질당 코인(티어 소량·일일 상한)", () => {
  const DAY = "2026-06-27";

  it("티어별 지급액 + 같은 날 누적", () => {
    const w = applyCatchCoin({ coins: 100 }, "common", DAY);
    expect(w.awarded).toBe(FISHING_CATCH_COIN_BY_TIER.common); // 3
    expect(w.next.coins).toBe(103);
    expect(w.next.catchDay).toEqual({ date: DAY, earned: 3 });
    // 같은 날 전설(20) 추가 → 누적.
    const w2 = applyCatchCoin(w.next, "legendary", DAY);
    expect(w2.awarded).toBe(20);
    expect(w2.next.coins).toBe(123);
    expect(w2.next.catchDay).toEqual({ date: DAY, earned: 23 });
  });

  it("일일 상한: 부분 지급 후 0", () => {
    // earned 가 상한−2 → 전설(20) 중 2 만 지급.
    const near = {
      coins: 0,
      catchDay: { date: DAY, earned: FISHING_CATCH_COIN_DAILY_CAP - 2 },
    };
    const w = applyCatchCoin(near, "legendary", DAY);
    expect(w.awarded).toBe(2);
    expect(w.next.coins).toBe(2);
    expect(w.next.catchDay?.earned).toBe(FISHING_CATCH_COIN_DAILY_CAP);
    // 상한 도달 후엔 0(잡기는 되지만 코인 멈춤).
    const w2 = applyCatchCoin(w.next, "common", DAY);
    expect(w2.awarded).toBe(0);
    expect(w2.next.coins).toBe(2);
  });

  it("날짜 롤오버 시 earned 리셋", () => {
    const w = {
      coins: 50,
      catchDay: { date: "2026-06-26", earned: FISHING_CATCH_COIN_DAILY_CAP },
    };
    const r = applyCatchCoin(w, "rare", DAY); // 다른 날 → 0 부터
    expect(r.awarded).toBe(FISHING_CATCH_COIN_BY_TIER.rare); // 5
    expect(r.next.coins).toBe(55);
    expect(r.next.catchDay).toEqual({ date: DAY, earned: 5 });
  });

  it("빈/무효 지갑도 안전(coins 0 시드)", () => {
    const r = applyCatchCoin({}, "epic", DAY);
    expect(r.awarded).toBe(10);
    expect(r.next.coins).toBe(10);
    expect(applyCatchCoin(null, "common", DAY).next.coins).toBe(3);
  });

  it("연속 성공 보너스도 일일 상한 안에서 합산한다", () => {
    const r = applyCatchCoin({ coins: 0 }, "common", DAY, 2);
    expect(r.awarded).toBe(FISHING_CATCH_COIN_BY_TIER.common + 2);
    expect(r.next.coins).toBe(5);

    const near = {
      coins: 0,
      catchDay: { date: DAY, earned: FISHING_CATCH_COIN_DAILY_CAP - 1 },
    };
    const capped = applyCatchCoin(near, "common", DAY, 5);
    expect(capped.awarded).toBe(1);
    expect(capped.next.catchDay?.earned).toBe(FISHING_CATCH_COIN_DAILY_CAP);
  });

});
