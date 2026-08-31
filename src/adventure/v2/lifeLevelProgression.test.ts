import { describe, expect, it } from "vitest";

import {
  LIFE_LEVEL_CAP,
  LIFE_LEVEL_CURVE_VERSION,
  LIFE_LEGACY_LEVEL_CAP,
  applyLifeXpGain,
  extendedLifeLevelForXp,
  extendedLifeXpThreshold,
  lifeLevelMigrationMessage,
  lifeLevelProgress,
  normalizeLifeXp,
} from "./lifeLevelProgression";

const legacyThreshold = (level: number) => {
  const safeLevel = Math.max(1, Math.min(50, Math.floor(level) || 1));
  return (safeLevel - 1) ** 2 * 10;
};

describe("생활 레벨 100 경험치 곡선", () => {
  it("기존 1~50 기준을 보존하고 50 이후 총 4배 곡선을 적용한다", () => {
    expect(LIFE_LEGACY_LEVEL_CAP).toBe(50);
    expect(LIFE_LEVEL_CAP).toBe(100);
    expect(extendedLifeXpThreshold(1, legacyThreshold)).toBe(0);
    expect(extendedLifeXpThreshold(25, legacyThreshold)).toBe(5_760);
    expect(extendedLifeXpThreshold(50, legacyThreshold)).toBe(24_010);
    expect(extendedLifeXpThreshold(60, legacyThreshold)).toBe(33_998);
    expect(extendedLifeXpThreshold(100, legacyThreshold)).toBe(120_050);
    expect(
      extendedLifeXpThreshold(100, legacyThreshold) -
        extendedLifeXpThreshold(50, legacyThreshold),
    ).toBe(96_040);
  });

  it("후반 누적 기준과 레벨별 요구량이 계속 증가한다", () => {
    let previousThreshold = extendedLifeXpThreshold(50, legacyThreshold);
    let previousDelta = 0;

    for (let level = 51; level <= 100; level += 1) {
      const threshold = extendedLifeXpThreshold(level, legacyThreshold);
      const delta = threshold - previousThreshold;
      expect(threshold).toBeGreaterThan(previousThreshold);
      expect(delta).toBeGreaterThan(previousDelta);
      previousThreshold = threshold;
      previousDelta = delta;
    }

    const level80Delta =
      extendedLifeXpThreshold(80, legacyThreshold) -
      extendedLifeXpThreshold(79, legacyThreshold);
    const level100Delta =
      extendedLifeXpThreshold(100, legacyThreshold) -
      extendedLifeXpThreshold(99, legacyThreshold);
    expect(level100Delta).toBeGreaterThan(level80Delta);
  });

  it("경계 경험치를 1~100 레벨로 역산하고 초과 경험치는 100으로 제한한다", () => {
    expect(extendedLifeLevelForXp(0, legacyThreshold)).toBe(1);
    expect(extendedLifeLevelForXp(24_009, legacyThreshold)).toBe(49);
    expect(extendedLifeLevelForXp(24_010, legacyThreshold)).toBe(50);
    expect(extendedLifeLevelForXp(33_998, legacyThreshold)).toBe(60);
    expect(extendedLifeLevelForXp(120_049, legacyThreshold)).toBe(99);
    expect(extendedLifeLevelForXp(Number.MAX_SAFE_INTEGER, legacyThreshold)).toBe(100);
  });
});

describe("구 생활 경험치 환산과 최종 상한", () => {
  it("최초 환산 응답에만 사용자 안내를 앞에 붙인다", () => {
    expect(lifeLevelMigrationMessage("농사 XP +10", true)).toBe(
      "기존 초과 숙련 경험치의 일부가 신규 성장 구간에 반영되었습니다. · 농사 XP +10",
    );
    expect(lifeLevelMigrationMessage("농사 XP +10", false)).toBe(
      "농사 XP +10",
    );
  });

  it("구 50레벨 초과 경험치의 25%만 한 번 인정한다", () => {
    expect(
      normalizeLifeXp({
        xp: 24_410,
        levelCurveVersion: 1,
        legacyThreshold,
      }),
    ).toEqual({
      xp: 24_110,
      levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
      migrated: true,
    });
  });

  it("구 초과 경험치 인정량을 새 60레벨 기준에서 제한한다", () => {
    expect(
      normalizeLifeXp({
        xp: 999_999,
        levelCurveVersion: undefined,
        legacyThreshold,
      }),
    ).toEqual({
      xp: 33_998,
      levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
      migrated: true,
    });
  });

  it("이미 환산했거나 더 최신인 저장값은 다시 환산하지 않는다", () => {
    expect(
      normalizeLifeXp({
        xp: 24_410,
        levelCurveVersion: 2,
        legacyThreshold,
      }),
    ).toEqual({ xp: 24_410, levelCurveVersion: 2, migrated: false });
    expect(
      normalizeLifeXp({
        xp: 24_410,
        levelCurveVersion: 3,
        legacyThreshold,
      }),
    ).toEqual({ xp: 24_410, levelCurveVersion: 3, migrated: false });
  });

  it("50레벨 이하 저장값은 버전만 올리고 환산 안내를 만들지 않는다", () => {
    expect(
      normalizeLifeXp({
        xp: 5_760,
        levelCurveVersion: 1,
        legacyThreshold,
      }),
    ).toEqual({
      xp: 5_760,
      levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
      migrated: false,
    });
  });

  it("비정상 저장값을 안전하게 정규화하고 현재 곡선은 100레벨에서 자른다", () => {
    expect(
      normalizeLifeXp({ xp: -1, levelCurveVersion: 1, legacyThreshold }).xp,
    ).toBe(0);
    expect(
      normalizeLifeXp({ xp: Number.NaN, levelCurveVersion: 1, legacyThreshold })
        .xp,
    ).toBe(0);
    expect(
      normalizeLifeXp({
        xp: Number.POSITIVE_INFINITY,
        levelCurveVersion: 2,
        legacyThreshold,
      }).xp,
    ).toBe(0);
    expect(
      normalizeLifeXp({
        xp: Number.MAX_SAFE_INTEGER,
        levelCurveVersion: 2,
        legacyThreshold,
      }).xp,
    ).toBe(120_050);
  });

  it("경험치 가산은 100레벨 상한까지만 실제 반영량을 반환한다", () => {
    expect(
      applyLifeXpGain({ xp: 120_049, gainedXp: 10, legacyThreshold }),
    ).toEqual({ xp: 120_050, appliedXp: 1 });
    expect(
      applyLifeXpGain({ xp: 120_050, gainedXp: 10, legacyThreshold }),
    ).toEqual({ xp: 120_050, appliedXp: 0 });
    expect(
      applyLifeXpGain({ xp: 100, gainedXp: Number.NaN, legacyThreshold }),
    ).toEqual({ xp: 100, appliedXp: 0 });
  });

  it("현재 레벨 진행도와 최종 MAX 상태를 반환한다", () => {
    expect(lifeLevelProgress({ xp: 33_999, legacyThreshold })).toEqual({
      level: 60,
      xpIntoLevel: 1,
      xpForNext: 1_088,
      maxLevel: false,
    });
    expect(lifeLevelProgress({ xp: 120_050, legacyThreshold })).toEqual({
      level: 100,
      xpIntoLevel: 0,
      xpForNext: 0,
      maxLevel: true,
    });
  });
});
