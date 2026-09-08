import { describe, expect, it } from "vitest";
import { emptyProficiency, resetLevelGrowth } from "./proficiency";
import { lifeResourceRangesForProficiency } from "./statGrowth";
import { parseLifeResourceGrowth, rollLifeResourceLevels } from "./lifeResourceGrowth";

describe("MP 성장의 기존 Lv.100 수준 유지", () => {
  it.each([0, 5_000, 100_000, 1_000_000, 10_000_000])("숙련도 %i에서 동일 영구 스탯의 개편 전 생애 MP와 10퍼센트 이내다", mastery => {
    const prof = resetLevelGrowth({ ...emptyProficiency(), jobCumLevel: { mage: mastery } });
    const ranges = lifeResourceRangesForProficiency(prof);
    const spiStep = Math.floor((prof.lifeStartStats!.spi - 15) / 10);
    // 개편 전: 시작 65~95 + 정신 단계, 레벨당 3~5 + 정신 단계의 40%.
    const before = 80 + spiStep + 99 * (4 + Math.floor(spiStep * 0.4));
    const after = (ranges.baseMp.min + ranges.baseMp.max) / 2 + 99 * ranges.mpPerLevel.expected!;
    expect(after / before).toBeGreaterThanOrEqual(0.9);
    expect(after / before).toBeLessThanOrEqual(1.1);
    expect(ranges.baseMp.min).toBe(120 + spiStep);
    expect(ranges.baseMp.max).toBe(180 + spiStep);
    expect(ranges.hpPerLevel.expected).toBe(10);
  });

  it("추가 MP 숙련도는 완만하게 연속 증가한다", () => {
    const base = emptyProficiency();
    const mean = (m: number) => lifeResourceRangesForProficiency({ ...base, jobCumLevel: { mage: m } }).mpPerLevel.expected!;
    expect(mean(0)).toBe(3);
    expect(mean(5_000)).toBeCloseTo(3.15);
    expect(mean(100_001)).toBeGreaterThan(mean(100_000));
  });

  it("이미 지급한 MP와 시작 자원을 보존하고 이후 성장만 더한다", () => {
    const record = { version: 2 as const, rolledLevel: 99, baseHp: 300, baseMp: 150, gainedHp: 1000, gainedMp: 2000 };
    expect(parseLifeResourceGrowth(record)).toEqual(record);
    const ranges = lifeResourceRangesForProficiency(emptyProficiency());
    const result = rollLifeResourceLevels(record, 99, 1, ranges, () => 0.5);
    expect(result.mpGain).toBe(3);
    expect(result.record.gainedMp).toBe(2003);
    expect(result.record.baseMp).toBe(150);
    expect(record.gainedMp).toBe(2000);
  });
});
