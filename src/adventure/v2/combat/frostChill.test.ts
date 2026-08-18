import { describe, expect, it } from "vitest";
import {
  BASE_FREEZE_DELAY_PCT,
  FROST_CHILL_THRESHOLD,
  formatFrostChillGainLog,
  formatFrostChillTriggerLog,
  freezeRawDamage,
  frostChillSnapshot,
  mergeFrostChillSnapshot,
  normalizeFrostChill,
  resolveFrostChillGain,
} from "./frostChill";

describe("한기 전이", () => {
  it("5스택 전까지 누적하고 임계점에서 한 번만 소비한다", () => {
    expect(FROST_CHILL_THRESHOLD).toBe(5);
    expect(BASE_FREEZE_DELAY_PCT).toBe(30);
    expect(resolveFrostChillGain(0, 2)).toEqual({
      previous: 0,
      requestedGain: 2,
      next: 2,
      triggered: false,
      consumed: 0,
      damagePct: 0,
      delayPct: 0,
    });
    expect(resolveFrostChillGain(2, 2)).toMatchObject({
      previous: 2,
      next: 4,
      triggered: false,
    });
    expect(resolveFrostChillGain(4, 2)).toEqual({
      previous: 4,
      requestedGain: 2,
      next: 0,
      triggered: true,
      consumed: 5,
      damagePct: 0,
      delayPct: 30,
    });
  });

  it("초과분은 버리고 큰 증가량도 빙결을 한 번만 일으킨다", () => {
    expect(
      resolveFrostChillGain(3, 99, { damagePct: 50, delayPct: 40 }),
    ).toEqual({
      previous: 3,
      requestedGain: 99,
      next: 0,
      triggered: true,
      consumed: 5,
      damagePct: 50,
      delayPct: 40,
    });
  });

  it("손상되거나 범위를 벗어난 저장값을 안전하게 정규화한다", () => {
    expect(normalizeFrostChill(undefined)).toBe(0);
    expect(normalizeFrostChill(null)).toBe(0);
    expect(normalizeFrostChill(Number.NaN)).toBe(0);
    expect(normalizeFrostChill(-3)).toBe(0);
    expect(normalizeFrostChill(2.9)).toBe(2);
    expect(normalizeFrostChill(999)).toBe(4);
    expect(resolveFrostChillGain(2, -4).next).toBe(2);
    expect(resolveFrostChillGain(2, Number.NaN).requestedGain).toBe(0);
  });
});

describe("빙결 피해와 표시", () => {
  it("INT·최대 MP 공식과 빙점 지배 피해 증가를 적용한다", () => {
    expect(freezeRawDamage({ int: 100, maxMp: 1_000, damagePct: 0 })).toBe(290);
    expect(freezeRawDamage({ int: 100, maxMp: 1_000, damagePct: 50 })).toBe(435);
    expect(freezeRawDamage({ int: -1, maxMp: Number.NaN, damagePct: -20 })).toBe(180);
  });

  it("1~4스택만 자원 스냅샷에 표시하고 기존 자원과 병합한다", () => {
    expect(frostChillSnapshot(0)).toBeNull();
    expect(frostChillSnapshot(3)).toEqual({ frostChill: "한기 3/5" });
    expect(frostChillSnapshot(5)).toEqual({ frostChill: "한기 4/5" });
    expect(mergeFrostChillSnapshot(undefined, 0)).toBeUndefined();
    expect(mergeFrostChillSnapshot({ physicalWard: 2 }, 3)).toEqual({
      physicalWard: 2,
      frostChill: "한기 3/5",
    });
  });

  it("한기 획득과 빙결 발동 로그를 일관된 문장으로 만든다", () => {
    expect(formatFrostChillGainLog(2, 4)).toBe("한기 +2 (4/5)");
    expect(formatFrostChillTriggerLog()).toBe(
      "한기 5스택을 소비해 빙결이 발생했다.",
    );
  });
});
