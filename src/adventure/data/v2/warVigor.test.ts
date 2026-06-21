import { describe, expect, it } from "vitest";
import { WAR_VIGOR_FULL_RECOVERY_MS } from "./settlementWarfareConfig";
import {
  applyVigorRecovery,
  FULL_WAR_VIGOR,
  parseWarVigor,
  recoveredVigorFrac,
  vigorAfterBattle,
  vigorFracAfterBattle,
} from "./warVigor";

describe("vigorFracAfterBattle", () => {
  it("남은/최대 비율을 반환", () => {
    expect(vigorFracAfterBattle(50, 100)).toBe(0.5);
    expect(vigorFracAfterBattle(0, 100)).toBe(0);
    expect(vigorFracAfterBattle(100, 100)).toBe(1);
  });
  it("최대치 초과/음수는 0~1 로 클램프", () => {
    expect(vigorFracAfterBattle(150, 100)).toBe(1);
    expect(vigorFracAfterBattle(-10, 100)).toBe(0);
  });
  it("max<=0 가드 → 0", () => {
    expect(vigorFracAfterBattle(50, 0)).toBe(0);
    expect(vigorFracAfterBattle(50, -5)).toBe(0);
  });
});

describe("recoveredVigorFrac", () => {
  it("경과만큼 선형 회복", () => {
    expect(recoveredVigorFrac(0.5, WAR_VIGOR_FULL_RECOVERY_MS / 4)).toBeCloseTo(
      0.75,
      6,
    );
  });
  it("상한 1 로 클램프", () => {
    expect(recoveredVigorFrac(0.5, WAR_VIGOR_FULL_RECOVERY_MS)).toBe(1);
    expect(recoveredVigorFrac(0.9, WAR_VIGOR_FULL_RECOVERY_MS * 10)).toBe(1);
  });
  it("음수/0 경과는 현재값 유지(가드)", () => {
    expect(recoveredVigorFrac(0.4, 0)).toBe(0.4);
    expect(recoveredVigorFrac(0.4, -1000)).toBe(0.4);
  });
  it("손상 현재값도 0~1 로 정규화", () => {
    expect(recoveredVigorFrac(Number.NaN, 0)).toBe(0);
    expect(recoveredVigorFrac(2, 0)).toBe(1);
  });
});

describe("parseWarVigor", () => {
  it("미설정/비객체는 만충(1,1,0)", () => {
    expect(parseWarVigor(undefined)).toEqual(FULL_WAR_VIGOR);
    expect(parseWarVigor(null)).toEqual({ hp: 1, mp: 1, at: 0 });
    expect(parseWarVigor("x")).toEqual({ hp: 1, mp: 1, at: 0 });
  });
  it("부분/손상 필드는 기본+클램프", () => {
    expect(parseWarVigor({ hp: 0.3 })).toEqual({ hp: 0.3, mp: 1, at: 0 });
    expect(parseWarVigor({ hp: 5, mp: -1, at: -2 })).toEqual({
      hp: 1,
      mp: 0,
      at: 0,
    });
  });
  it("정상 값 보존", () => {
    expect(parseWarVigor({ hp: 0.2, mp: 0.6, at: 123 })).toEqual({
      hp: 0.2,
      mp: 0.6,
      at: 123,
    });
  });
});

describe("applyVigorRecovery", () => {
  it("at=0(미설정)이면 경과 0 = 만충 유지", () => {
    expect(applyVigorRecovery(FULL_WAR_VIGOR, 1_000_000)).toEqual({
      hp: 1,
      mp: 1,
      at: 1_000_000,
    });
  });
  it("경과시간만큼 hp/mp 회복 + 기준점 갱신", () => {
    const base = { hp: 0.2, mp: 0.4, at: 0 + 1 };
    const now = 1 + WAR_VIGOR_FULL_RECOVERY_MS / 2;
    const r = applyVigorRecovery(base, now);
    expect(r.hp).toBeCloseTo(0.7, 6);
    expect(r.mp).toBeCloseTo(0.9, 6);
    expect(r.at).toBe(now);
  });
  it("클락 스큐(now 과거)는 회복 0 + 기준점만 갱신", () => {
    const r = applyVigorRecovery({ hp: 0.5, mp: 0.5, at: 1000 }, 500);
    expect(r).toEqual({ hp: 0.5, mp: 0.5, at: 500 });
  });
});

describe("vigorAfterBattle", () => {
  it("남은 HP/MP 를 비율로 저장 + 갱신시각", () => {
    expect(vigorAfterBattle(30, 100, 10, 50, 777)).toEqual({
      hp: 0.3,
      mp: 0.2,
      at: 777,
    });
  });
});
