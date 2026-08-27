import { describe, expect, it } from "vitest";
import {
  lifeResourceRanges,
  parseLifeResourceGrowth,
  resetLifeResourceLevels,
  rollInitialLifeResourceGrowth,
  rollLifeResourceLevels,
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
      }),
    ).toEqual({
      baseHp: { min: 152, max: 184 },
      baseMp: { min: 67, max: 99 },
      hpPerLevel: { min: 9, max: 14 },
      mpPerLevel: { min: 5, max: 9 },
    });
  });

  it("Lv.1 굴림은 난수 양 끝에서 범위의 최솟값과 최댓값을 확정한다", () => {
    expect(rollInitialLifeResourceGrowth(baseRanges, () => 0)).toEqual({
      version: 1,
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

  it("저장된 굴림 레벨과 실제 시작 레벨이 다르면 진행을 거부한다", () => {
    const record = rollInitialLifeResourceGrowth(baseRanges, () => 0);
    expect(() =>
      rollLifeResourceLevels(record, 2, 1, baseRanges, () => 0),
    ).toThrow("life_resource_level_mismatch");
  });

  it("수행 초기화는 Lv.1 굴림을 보존하고 레벨 누적만 비운다", () => {
    expect(
      resetLifeResourceLevels({
        version: 1,
        rolledLevel: 37,
        baseHp: 142,
        baseMp: 81,
        gainedHp: 361,
        gainedMp: 145,
      }),
    ).toEqual({
      version: 1,
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
    expect(parseLifeResourceGrowth({ ...valid, version: 2 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, rolledLevel: 0 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, gainedMp: -1 })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, baseHp: Number.NaN })).toBeNull();
    expect(parseLifeResourceGrowth({ ...valid, gainedHp: 1.5 })).toBeNull();
  });
});
