import { describe, it, expect } from "vitest";
import { V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import {
  V2_CLASS_PASSIVE,
  resolveClassPassive,
  classPassiveTierText,
} from "@/adventure/data/v2/v2Passives";

// 시그니처 id 를 데이터에서 직접 끌어와 하드코딩 회피.
const SIG = {
  swordsmanT1: V2_CLASS_DEFS.swordsman.signatureSkill!,
  swordmasterT2: V2_CLASS_DEFS.swordmaster.signatureSkill!,
  swordkingT3: V2_CLASS_DEFS.swordking.signatureSkill!,
  swordgodT4: V2_CLASS_DEFS.swordgod.signatureSkill!,
  mageT1: V2_CLASS_DEFS.mage.signatureSkill!,
} as const;

describe("V2_CLASS_PASSIVE 테이블", () => {
  const groups = ["swordsman", "archer", "martial", "mage", "priest", "ninja"] as const;

  it("6 직업군 전부 4 티어 정의", () => {
    for (const g of groups) {
      const table = V2_CLASS_PASSIVE[g];
      expect(table, g).toBeDefined();
      expect(table!.length).toBe(4);
    }
  });

  it("티어가 오를수록 핵심 수치 단조 증가", () => {
    const monotonic = (g: (typeof groups)[number], key: string) => {
      const t = V2_CLASS_PASSIVE[g]!;
      for (let i = 1; i < 4; i++) {
        const cur = (t[i] as Record<string, number>)[key];
        const prev = (t[i - 1] as Record<string, number>)[key];
        expect(cur, `${g}.${key}[${i}]`).toBeGreaterThan(prev);
      }
    };
    monotonic("swordsman", "atkPerStrCoef");
    monotonic("archer", "defPenetrationPct");
    monotonic("martial", "counterChancePct");
    monotonic("priest", "turnHealPctMaxHp");
    monotonic("mage", "magicAtkPerIntCoef");
    monotonic("ninja", "critMultAdd");
  });

  it("궁수 방어 관통은 전 차수 30%(DEF_IGNORE_FRACTION) 미만", () => {
    for (const e of V2_CLASS_PASSIVE.archer!) {
      expect(e.defPenetrationPct!).toBeLessThan(30);
    }
  });

  it("마법사는 전 차수 평타 마공화(magicBasicAttack) 보유", () => {
    for (const e of V2_CLASS_PASSIVE.mage!) {
      expect(e.magicBasicAttack).toBe(true);
    }
  });
});

describe("resolveClassPassive", () => {
  it("직업 없음/none/학습 없음 → null", () => {
    expect(resolveClassPassive(null, [])).toBeNull();
    expect(resolveClassPassive("none", [SIG.swordsmanT1])).toBeNull();
    expect(resolveClassPassive("swordsman", [])).toBeNull();
  });

  it("시그니처 아닌 학습은 무시(7속성 풀 등) → null", () => {
    expect(
      resolveClassPassive("swordsman", ["v2_skill_elem_swordsman_fire", "nope"]),
    ).toBeNull();
  });

  it("T1 시그니처만 학습 → tier 1 효과", () => {
    const r = resolveClassPassive("swordsman", [SIG.swordsmanT1]);
    expect(r).not.toBeNull();
    expect(r!.group).toBe("swordsman");
    expect(r!.tier).toBe(1);
    expect(r!.atkPerStrCoef).toBe(
      V2_CLASS_PASSIVE.swordsman![0].atkPerStrCoef,
    );
  });

  it("패시브 티어 = 학습 시그니처 중 최고 티어(현 직업이 상위여도 미학습이면 안 오름)", () => {
    // 검신(T4)이지만 T1·T2 시그니처만 학습 → tier 2.
    const r = resolveClassPassive("swordgod", [
      SIG.swordsmanT1,
      SIG.swordmasterT2,
    ]);
    expect(r!.tier).toBe(2);
    expect(r!.atkPerStrCoef).toBe(
      V2_CLASS_PASSIVE.swordsman![1].atkPerStrCoef,
    );
    // 4티어 전부 학습 → tier 4.
    const full = resolveClassPassive("swordgod", [
      SIG.swordsmanT1,
      SIG.swordmasterT2,
      SIG.swordkingT3,
      SIG.swordgodT4,
    ]);
    expect(full!.tier).toBe(4);
  });

  it("다른 직업군 시그니처는 제외", () => {
    // 마법사인데 검사 시그니처만 학습 → 마법사 패시브 없음.
    expect(resolveClassPassive("mage", [SIG.swordsmanT1])).toBeNull();
    // 마법사 T1 시그니처 → 평타 마공화 + INT 계수.
    const r = resolveClassPassive("mage", [SIG.mageT1]);
    expect(r!.group).toBe("mage");
    expect(r!.tier).toBe(1);
    expect(r!.magicBasicAttack).toBe(true);
    expect(r!.magicAtkPerIntCoef!).toBeGreaterThan(0);
  });
});

describe("classPassiveTierText (학습창 표기)", () => {
  it("직업군·차수별 효과 텍스트", () => {
    expect(classPassiveTierText("swordsman", 1)).toContain("STR");
    expect(classPassiveTierText("martial", 2)).toContain("반격");
    expect(classPassiveTierText("mage", 1)).toContain("마법화");
    expect(classPassiveTierText("priest", 1)).toContain("HP");
    expect(classPassiveTierText("archer", 4)).toContain("방어 관통");
    expect(classPassiveTierText("ninja", 1)).toContain("치명타");
  });
  it("매핑/범위 밖이면 빈 문자열", () => {
    expect(classPassiveTierText("none", 1)).toBe("");
    expect(classPassiveTierText("swordsman", 0)).toBe("");
    expect(classPassiveTierText("swordsman", 5)).toBe("");
  });
});
