import { describe, it, expect } from "vitest";
import {
  computeStatFloors,
  lifeResourceRangesForProficiency,
} from "./statGrowth";
import {
  effectiveStatCap,
  emptyProficiency,
  parseProficiency,
} from "./proficiency";
import { V2_BASE_STATS } from "./v2Stats";

describe("v2 생애 자원 영구 범위", () => {
  it("숙련 저점과 수행 한계치가 대응하는 HP·MP 성장 범위를 높인다", () => {
    const base = lifeResourceRangesForProficiency(emptyProficiency());
    const progressed = lifeResourceRangesForProficiency({
      ...emptyProficiency(),
      statFloorLevels: { warrior: 10_000, mage: 10_000 },
      caps: { vit: 10, int: 10 },
    });

    expect(progressed.hpPerLevel.min).toBeGreaterThan(base.hpPerLevel.min);
    expect(progressed.hpPerLevel.max).toBeGreaterThan(base.hpPerLevel.max);
    expect(progressed.mpPerLevel.min).toBeGreaterThan(base.mpPerLevel.min);
    expect(progressed.mpPerLevel.max).toBeGreaterThan(base.mpPerLevel.max);
  });

  it("기존 기록은 종전 MP 성장 범위를, 새 기록은 완화된 범위를 사용한다", () => {
    const progressed = {
      ...emptyProficiency(),
      statFloorLevels: { mage: 10_000 },
      caps: { int: 10 },
    };
    const version1 = lifeResourceRangesForProficiency(progressed, 1);
    const version2 = lifeResourceRangesForProficiency(progressed, 2);

    expect(version1.mpPerLevel.min).toBeGreaterThan(version2.mpPerLevel.min);
    expect(version1.mpPerLevel.max).toBeGreaterThan(version2.mpPerLevel.max);
    expect(version1.baseMp).toEqual(version2.baseMp);
    expect(version1.baseHp).toEqual(version2.baseHp);
    expect(version1.hpPerLevel).toEqual(version2.hpPerLevel);
  });
});

describe("v2 스탯 floor", () => {
  it("computeStatFloors — 승리 숙련도가 늘어도 고정된 레벨 성장 입력만 사용한다", () => {
    const prof = parseProficiency({
      groups: {
        mage: { cultivations: 0, tier: 1, cumLevel: 1800 },
      },
      statFloorLevels: { mage: 37 },
    });
    const moreMastery = {
      ...prof,
      groups: {
        ...prof.groups,
        mage: { ...prof.groups.mage, cumLevel: 90_000 },
      },
    };

    expect(computeStatFloors(moreMastery)).toEqual(computeStatFloors(prof));
  });

  it("computeStatFloors — 총(전 스탯) + 직군 숙련도(프로필·차수 가중)", () => {
    // 전사(warrior {str:2,vit:1,dex:1}) 숙련도 1800(밸런스 입력 200), tier1. 총=200×0.005=1.
    // 프로필 값 비례: str(2/2=1.0)·vit/dex(1/2=0.5). FLOOR_GLOBAL 0.005·FLOOR_PER_PROF 0.02.
    const prof = parseProficiency({
      groups: {
        warrior: { points: 10, cultivations: 0, tier: 1, cumLevel: 1800 },
      },
    });
    const f = computeStatFloors(prof);
    // str = base + 1(총) + 200×0.02×1×1.0 = base + 1 + 4
    expect(f.str).toBe(V2_BASE_STATS.str + 1 + 4);
    // dex = base + 1(총) + 200×0.02×1×0.5 = base + 1 + 2
    expect(f.dex).toBe(V2_BASE_STATS.dex + 1 + 2);
    // int(프로필 외) = base + 1(총만)
    expect(f.int).toBe(V2_BASE_STATS.int + 1);
  });

  it("computeStatFloors — 프로필 값 비례: 마법사 spi=int·도적 luk=dex (값2 동급)", () => {
    // 옛 앵커-이진에선 spi/luk 이 0.4 로 홀대됐으나, 값 비례에서 값2는 모두 1.0(주력 동급).
    const mage = computeStatFloors(
      parseProficiency({
        groups: { mage: { points: 0, cultivations: 0, tier: 1, cumLevel: 1800 } },
      }),
    );
    // mage {int:2, spi:2} — 둘 다 최댓값 → floor 1.0 동급 = base + 1 + 4.
    expect(mage.int).toBe(V2_BASE_STATS.int + 1 + 4);
    expect(mage.spi).toBe(mage.int);
    const rogue = computeStatFloors(
      parseProficiency({
        groups: { rogue: { points: 0, cultivations: 0, tier: 1, cumLevel: 1800 } },
      }),
    );
    // rogue {dex:2, luk:2} — luk 이 dex 와 동급.
    expect(rogue.luk).toBe(rogue.dex);
  });

  it("computeStatFloors — 차수 높을수록 floor↑, 빈 숙련도는 base", () => {
    const mk = (tier: number) =>
      computeStatFloors(
        parseProficiency({
          groups: {
            warrior: { points: 10, cultivations: 0, tier, cumLevel: 1800 },
          },
        }),
      );
    expect(mk(3).str).toBeGreaterThan(mk(1).str);
    expect(computeStatFloors(emptyProficiency()).str).toBe(V2_BASE_STATS.str);
  });

  it("표준 4단계 계보 진행에서도 주력 저점이 수행 한계치 절반을 넘지 않는다", () => {
    // sim-v2-proficiency 표준 4단계 누적 숙련도 14,253, 주력 수행 이득 60 기준.
    // 이전 계수는 str 저점 117 / 한계 120(98%)로 랜덤 성장 여유를 사실상 없앴다.
    const floor = computeStatFloors(
      parseProficiency({
        groups: { warrior: { cultivations: 30, tier: 1, cumLevel: 14_253 } },
        caps: { str: 60 },
      }),
    ).str;
    const cap = effectiveStatCap(60);

    expect(floor).toBe(54);
    expect(floor / cap).toBeLessThanOrEqual(0.5);
  });

  it("computeStatFloors — cumLevel 0(미적립)이면 직군 가중 없음, base + 총만", () => {
    // 잔액(points)만 있고 cumLevel 0 → 직군 floor 기여 없음(floor 입력이 cumLevel 이므로).
    const prof = parseProficiency({
      groups: {
        warrior: { points: 9999, cultivations: 0, tier: 4, cumLevel: 0 },
      },
    });
    const f = computeStatFloors(prof);
    expect(f.str).toBe(V2_BASE_STATS.str);
  });
});
