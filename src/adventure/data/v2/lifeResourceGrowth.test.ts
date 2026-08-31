import { describe, expect, it } from "vitest";
import {
  lifeResourceRanges,
  parseLifeResourceGrowth,
  resetLifeResourceLevels,
  rollInitialLifeResourceGrowth,
  rollLifeResourceLevels,
  trainedIntSpiMpBonus,
} from "./lifeResourceGrowth";

const baseRanges = lifeResourceRanges({
  strFloor: 15,
  vitCap: 60,
  spiFloor: 15,
  intCap: 60,
});

describe("v2 생애 HP·MP 성장", () => {
  it("기본 영구 스탯에서는 기본 자원 범위를 사용한다", () => {
    expect(baseRanges).toEqual({
      baseHp: { min: 150, max: 180 },
      baseMp: { min: 65, max: 95 },
      hpPerLevel: { min: 8, max: 12 },
      mpPerLevel: { min: 3, max: 5 },
    });
  });

  it("영구 저점과 한계치가 10 오를 때마다 대응 범위를 확장한다", () => {
    expect(
      lifeResourceRanges({
        strFloor: 25,
        vitCap: 70,
        spiFloor: 35,
        intCap: 80,
      }, 1),
    ).toEqual({
      baseHp: { min: 152, max: 184 },
      baseMp: { min: 67, max: 99 },
      hpPerLevel: { min: 9, max: 14 },
      mpPerLevel: { min: 5, max: 9 },
    });
  });

  it("버전 2는 레벨업 MP 영향만 40%로 완화하고 Lv.1·HP 범위는 보존한다", () => {
    const ryuInput = {
      strFloor: 15,
      vitCap: 60,
      spiFloor: 218,
      intCap: 60,
    };
    const version1 = lifeResourceRanges(ryuInput, 1);
    const version2 = lifeResourceRanges(ryuInput, 2);

    expect(version1.mpPerLevel).toEqual({ min: 23, max: 25 });
    expect(version2.mpPerLevel).toEqual({ min: 11, max: 13 });
    expect(version2.baseMp).toEqual({ min: 85, max: 115 });
    expect(version2.baseMp).toEqual(version1.baseMp);
    expect(version2.baseHp).toEqual(version1.baseHp);
    expect(version2.hpPerLevel).toEqual(version1.hpPerLevel);
  });

  it("훈련한 지능·정신만 기준값 15를 넘긴 만큼 MP를 더한다", () => {
    expect(trainedIntSpiMpBonus({ int: 60, spi: 60 })).toBe(90);
    expect(trainedIntSpiMpBonus({ int: 100, spi: 100 })).toBe(170);
    expect(trainedIntSpiMpBonus({ int: 5, spi: 15 })).toBe(0);
  });

  it("Lv.1 굴림은 난수 양 끝에서 범위의 최솟값과 최댓값을 확정한다", () => {
    expect(rollInitialLifeResourceGrowth(baseRanges, () => 0)).toEqual({
      version: 2,
      rolledLevel: 1,
      baseHp: 150,
      baseMp: 65,
      gainedHp: 0,
      gainedMp: 0,
    });
    expect(
      rollInitialLifeResourceGrowth(baseRanges, () => 0.999999),
    ).toMatchObject({ baseHp: 180, baseMp: 95, rolledLevel: 1 });
  });

  it("여러 레벨의 굴림과 누적 자원을 함께 반환한다", () => {
    const record = rollInitialLifeResourceGrowth(baseRanges, () => 0);
    const result = rollLifeResourceLevels(record, 1, 2, baseRanges, () => 0);

    expect(result).toEqual({
      record: {
        ...record,
        rolledLevel: 3,
        gainedHp: 16,
        gainedMp: 6,
      },
      hpGain: 16,
      mpGain: 6,
    });
  });

  it("기본 범위의 평균 굴림은 Lv.100에서 생애 HP 1,155와 MP 476이 된다", () => {
    const initial = rollInitialLifeResourceGrowth(baseRanges, () => 0.5);
    const result = rollLifeResourceLevels(initial, 1, 99, baseRanges, () => 0.5);

    expect(initial).toMatchObject({ baseHp: 165, baseMp: 80 });
    expect(result.record.baseHp + result.record.gainedHp).toBe(1_155);
    expect(result.record.baseMp + result.record.gainedMp).toBe(476);
  });

  it("레벨 초기화가 누락된 기존 기록은 Lv.1 생애로 복구한 뒤 새 레벨만 굴린다", () => {
    const result = rollLifeResourceLevels(
      {
        version: 1,
        rolledLevel: 41,
        baseHp: 172,
        baseMp: 81,
        gainedHp: 873,
        gainedMp: 390,
      },
      1,
      1,
      baseRanges,
      () => 0,
    );

    expect(result).toEqual({
      record: {
        version: 1,
        rolledLevel: 2,
        baseHp: 172,
        baseMp: 81,
        gainedHp: 8,
        gainedMp: 3,
      },
      hpGain: 8,
      mpGain: 3,
    });
  });

  it("기록 레벨이 실제 레벨보다 낮으면 빠진 레벨을 채운 뒤 새 레벨을 굴린다", () => {
    const record = rollInitialLifeResourceGrowth(baseRanges, () => 0);
    const result = rollLifeResourceLevels(record, 3, 1, baseRanges, () => 0);

    expect(result).toEqual({
      record: {
        ...record,
        rolledLevel: 4,
        gainedHp: 24,
        gainedMp: 9,
      },
      hpGain: 8,
      mpGain: 3,
    });
  });

  it("수행 초기화는 버전과 Lv.1 굴림을 보존하고 레벨 누적만 비운다", () => {
    expect(
      resetLifeResourceLevels({
        version: 2,
        rolledLevel: 37,
        baseHp: 142,
        baseMp: 81,
        gainedHp: 361,
        gainedMp: 145,
      }),
    ).toEqual({
      version: 2,
      rolledLevel: 1,
      baseHp: 142,
      baseMp: 81,
      gainedHp: 0,
      gainedMp: 0,
    });
  });

  it("파서는 유효한 정수 기록만 받아들인다", () => {
    const valid = {
      version: 1 as const,
      rolledLevel: 37,
      baseHp: 142,
      baseMp: 81,
      gainedHp: 361,
      gainedMp: 145,
    };
    expect(parseLifeResourceGrowth(valid)).toEqual(valid);
    expect(parseLifeResourceGrowth({ ...valid, version: 2 })).toEqual({
      ...valid,
      version: 2,
    });
    expect(parseLifeResourceGrowth({ ...valid, version: 3 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, rolledLevel: 0 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, gainedMp: -1 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, baseHp: Number.NaN })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, gainedHp: 1.5 })).toBeNull();
  });
});
