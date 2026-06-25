import { describe, it, expect } from "vitest";
import {
  FORT_MAX_HP,
  FORT_MAX_HP_BY_TIER,
  fortMaxHpForTier,
  BASE_SIEGE_DAMAGE,
  siegeDamage,
  undefendedSiegeDamage,
  FORT_REGEN_PER_HOUR,
  REPAIR_GOLD_PER_HP,
  currentFortHp,
  isOutpostProtected,
  repairHpFromGold,
  siegeWinsToFall,
  tileFortMaxHp,
} from "./outpostSiege";
import { STRONGHOLD_FORT_HP_MULT } from "./settlementWarfareConfig";

describe("currentFortHp (성벽 lazy 재생)", () => {
  const t0 = new Date("2026-06-08T00:00:00.000Z");

  it("경과 0 이면 그대로", () => {
    expect(currentFortHp(60, 100, t0, t0)).toBe(60);
  });

  it("시간당 FORT_REGEN_PER_HOUR 만큼 재생", () => {
    const t2h = new Date(t0.getTime() + 2 * 3_600_000);
    expect(currentFortHp(60, 100, t0, t2h)).toBe(60 + FORT_REGEN_PER_HOUR * 2);
  });

  it("상한(fortMaxHp) 으로 클램프", () => {
    const t100h = new Date(t0.getTime() + 100 * 3_600_000);
    expect(currentFortHp(60, 100, t0, t100h)).toBe(100);
  });

  it("음수 경과(clock skew)는 증가만 — 0 경과로 처리", () => {
    const tPast = new Date(t0.getTime() - 3_600_000);
    expect(currentFortHp(60, 100, t0, tPast)).toBe(60);
  });
});

describe("isOutpostProtected (보호막)", () => {
  const now = new Date("2026-06-08T00:00:00.000Z");
  it("protectedUntil 미래면 보호중", () => {
    expect(isOutpostProtected(new Date(now.getTime() + 1000), now)).toBe(true);
  });
  it("과거/현재면 해제", () => {
    expect(isOutpostProtected(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isOutpostProtected(now, now)).toBe(false);
  });
});

describe("repairHpFromGold (길드 금고 자동 수리)", () => {
  it("결손/금고 0 이면 0", () => {
    expect(repairHpFromGold(0, 10000)).toBe(0);
    expect(repairHpFromGold(40, 0)).toBe(0);
  });
  it("금고가 충분하면 결손분 전부", () => {
    expect(repairHpFromGold(40, 40 * REPAIR_GOLD_PER_HP)).toBe(40);
    expect(repairHpFromGold(5, 100000)).toBe(5);
  });
  it("금고가 한도면 살 수 있는 만큼만(내림)", () => {
    // 금고 = 9.5 HP 어치 → 9 HP.
    expect(repairHpFromGold(40, Math.floor(9.5 * REPAIR_GOLD_PER_HP))).toBe(9);
  });
});

describe("성벽 단계별 HP", () => {
  it("개척마을 900 / 마을 1500 / 도시 3000 / 대도시 4500", () => {
    expect(FORT_MAX_HP_BY_TIER[1]).toBe(900);
    expect(FORT_MAX_HP_BY_TIER[2]).toBe(1500);
    expect(FORT_MAX_HP_BY_TIER[3]).toBe(3000);
    expect(FORT_MAX_HP_BY_TIER[4]).toBe(4500);
    expect(fortMaxHpForTier(1)).toBe(900);
    expect(fortMaxHpForTier(4)).toBe(4500);
  });
  it("FORT_MAX_HP(폴백) = tier1", () => {
    expect(FORT_MAX_HP).toBe(FORT_MAX_HP_BY_TIER[1]);
  });
  it("불변식: 최소 HP > 최대 데미지(풀수리 성벽이 한 방에 안 무너짐)", () => {
    expect(FORT_MAX_HP_BY_TIER[1]).toBeGreaterThan(siegeDamage(999999, 1));
  });
});

describe("siegeDamage (전투력 비율 공성)", () => {
  it("전력 동급(비율 1.0) = BASE", () => {
    expect(siegeDamage(2000, 2000)).toBe(BASE_SIEGE_DAMAGE);
  });
  it("압도적(비율 ≥ 3.0) = 상한 BASE×3", () => {
    expect(siegeDamage(6000, 2000)).toBe(Math.round(BASE_SIEGE_DAMAGE * 3));
    expect(siegeDamage(999999, 2000)).toBe(Math.round(BASE_SIEGE_DAMAGE * 3));
  });
  it("열세(비율 ≤ 0.5) = 하한 BASE×0.5", () => {
    expect(siegeDamage(100, 2000)).toBe(Math.round(BASE_SIEGE_DAMAGE * 0.5));
  });
  it("비율 2.0 = BASE×2", () => {
    expect(siegeDamage(4000, 2000)).toBe(Math.round(BASE_SIEGE_DAMAGE * 2));
  });
  it("수비력 0 div 가드 — 크래시 없이 최소 1, 상한 클램프", () => {
    expect(siegeDamage(0, 0)).toBeGreaterThanOrEqual(1);
    expect(siegeDamage(1000, 0)).toBe(Math.round(BASE_SIEGE_DAMAGE * 3));
  });
});

describe("undefendedSiegeDamage (무방비 성벽 = 전투력÷4·캡 50%HP)", () => {
  it("캡 아래면 전투력÷4(반올림)", () => {
    expect(undefendedSiegeDamage(742, 900)).toBe(186); // round(742/4)=186 < cap 450
  });
  it("성벽 최대HP의 50% 로 캡(엔드 공격자 원샷 방지)", () => {
    expect(undefendedSiegeDamage(4000, 900)).toBe(450); // 1000 > floor(900*0.5)=450
    expect(undefendedSiegeDamage(999999, 4500)).toBe(2250); // cap = floor(4500*0.5)
  });
  it("최소 1", () => {
    expect(undefendedSiegeDamage(0, 900)).toBe(1);
    expect(undefendedSiegeDamage(1, 900)).toBe(1);
  });
  it("캡 덕분에 풀수리 성벽은 무방비라도 ≥2타", () => {
    const hp = FORT_MAX_HP_BY_TIER[1];
    expect(undefendedSiegeDamage(999999, hp)).toBeLessThan(hp);
  });
});

describe("siegeWinsToFall (함락까지 승수 표기)", () => {
  it("경계 — 정확히 나누어떨어지면 그 몫", () => {
    expect(siegeWinsToFall(BASE_SIEGE_DAMAGE * 3, BASE_SIEGE_DAMAGE)).toBe(3);
    // tier1 900 / BASE 75 = 12
    expect(siegeWinsToFall(FORT_MAX_HP_BY_TIER[1], BASE_SIEGE_DAMAGE)).toBe(12);
  });
  it("나머지가 있으면 올림", () => {
    expect(siegeWinsToFall(BASE_SIEGE_DAMAGE * 2 + 1, BASE_SIEGE_DAMAGE)).toBe(3);
  });
  it("0 이하/0 데미지라도 최소 1승(안정)", () => {
    expect(siegeWinsToFall(0, BASE_SIEGE_DAMAGE)).toBe(1);
    expect(siegeWinsToFall(1, BASE_SIEGE_DAMAGE)).toBe(1);
    expect(siegeWinsToFall(300, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("tileFortMaxHp (요새터 ×1.15·P3)", () => {
  // 요새터 배치 칸 (8,4)(7,7) — tileConfig.TILE_TERRAIN.
  it("요새터 칸 = tier 기본 × STRONGHOLD_FORT_HP_MULT(반올림)", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const expected = Math.round(fortMaxHpForTier(tier) * STRONGHOLD_FORT_HP_MULT);
      expect(tileFortMaxHp(8, 4, tier)).toBe(expected);
      expect(tileFortMaxHp(7, 7, tier)).toBe(expected);
    }
    expect(tileFortMaxHp(8, 4, 1)).toBe(1035); // round(900*1.15)
    expect(tileFortMaxHp(8, 4, 4)).toBe(5175); // round(4500*1.15)
  });

  it("비-요새터 칸 = tier 기본(보정 없음)", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(tileFortMaxHp(0, 0, tier)).toBe(fortMaxHpForTier(tier)); // 빈 땅
      expect(tileFortMaxHp(1, 6, tier)).toBe(fortMaxHpForTier(tier)); // 교역로(요새터 아님)
    }
  });

  it("멱등 — tier 로부터 단일 곱(저장값 재곱 = 복리 누적 아님)", () => {
    // 헬퍼 출력을 다시 ×1.15 하면 복리(틀린 값). 헬퍼는 항상 base 에서 한 번만 곱한다.
    const once = tileFortMaxHp(8, 4, 1);
    const compounded = Math.round(once * STRONGHOLD_FORT_HP_MULT);
    expect(once).not.toBe(compounded);
    expect(tileFortMaxHp(8, 4, 1)).toBe(once); // 반복 호출 동일(결정론)
  });
});
