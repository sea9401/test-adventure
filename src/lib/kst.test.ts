import { describe, expect, it } from "vitest";
import { KST_OFFSET_MS, kstDayKey, kstWeekMondayKey } from "./kst";

// ── 옛 구현 오라클 — 통합 전 각 파일의 로직을 그대로 복사해 회귀를 고정한다 ──
// (키 문자열이 달라지면 라이브 일일/주간 진행이 리셋되므로, 동치가 깨지면 이 테스트가 막는다.)

// v2RepeatQuests.ts 의 옛 kstWeeklyKey.
function legacyRepeatWeeklyKey(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - daysSinceMonday);
  return kst.toISOString().slice(0, 10);
}

// tower/weeklyTypes.ts 의 옛 kstWeekStartKey (setUTCHours + 이중 +9h 시프트 변형).
function legacyTowerWeekStartKey(now: Date): string {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const day = kstNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const kstMonday = new Date(kstNow);
  kstMonday.setUTCDate(kstNow.getUTCDate() - daysSinceMonday);
  kstMonday.setUTCHours(0, 0, 0, 0);
  const kstDate = new Date(kstMonday.getTime() + KST_OFFSET_MS);
  return kstDate.toISOString().slice(0, 10);
}

// pvp/coins.ts · v2RepeatQuests.ts 의 옛 일일 키 (동일 구현 2벌).
function legacyDayKey(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

describe("kstDayKey", () => {
  it("KST 자정(UTC 15:00) 경계에서 날짜가 넘어간다", () => {
    expect(kstDayKey(new Date("2026-05-23T14:59:59Z"))).toBe("2026-05-23");
    expect(kstDayKey(new Date("2026-05-23T15:00:00Z"))).toBe("2026-05-24");
  });

  it("옛 구현(pvp/coins·v2RepeatQuests)과 전 구간 동치", () => {
    const start = Date.parse("2025-12-25T00:00:00Z"); // 연말/연초 경계 포함
    for (let i = 0; i < 21 * 24; i++) {
      const d = new Date(start + i * 3600_000);
      expect(kstDayKey(d)).toBe(legacyDayKey(d));
    }
  });
});

describe("kstWeekMondayKey", () => {
  it("KST 월요일 자정(UTC 일 15:00) 경계에서 주가 넘어간다", () => {
    // 2026-06-29 는 월요일 (2026-01-01 = 목요일 기준 산술).
    expect(kstWeekMondayKey(new Date("2026-06-28T14:59:59Z"))).toBe("2026-06-22");
    expect(kstWeekMondayKey(new Date("2026-06-28T15:00:00Z"))).toBe("2026-06-29");
  });

  it("연 경계 — 2026-01-01(KST 목) 의 주 시작은 2025-12-29(월)", () => {
    expect(kstWeekMondayKey(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-29");
  });

  it("옛 구현 2벌(v2RepeatQuests·tower/weeklyTypes)과 전 구간 동치", () => {
    const start = Date.parse("2025-12-22T00:00:00Z"); // 연말/연초 + 3주 스윕
    for (let i = 0; i < 28 * 24; i++) {
      const d = new Date(start + i * 3600_000);
      const unified = kstWeekMondayKey(d);
      expect(unified).toBe(legacyRepeatWeeklyKey(d));
      expect(unified).toBe(legacyTowerWeekStartKey(d));
    }
  });

  it("항상 월요일을 가리킨다", () => {
    const start = Date.parse("2026-06-01T00:00:00Z");
    for (let i = 0; i < 14; i++) {
      const key = kstWeekMondayKey(new Date(start + i * 24 * 3600_000));
      // 키를 KST 자정으로 되읽으면 요일은 월요일(1).
      const asDate = new Date(`${key}T00:00:00.000+09:00`);
      const kstDow = new Date(asDate.getTime() + KST_OFFSET_MS).getUTCDay();
      expect(kstDow).toBe(1);
    }
  });
});
