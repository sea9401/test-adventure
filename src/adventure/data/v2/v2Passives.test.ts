import { describe, it, expect } from "vitest";
import { V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import {
  V2_CLASS_PASSIVE,
  resolveClassPassive,
} from "@/adventure/data/v2/v2Passives";
import { V2_DOT_PRESETS } from "@/adventure/data/v2/statusEffects";

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

  it("DoT 보유 직업군의 label·turns 는 statusEffects 프리셋과 일치", () => {
    for (const g of groups) {
      for (const tierEffect of V2_CLASS_PASSIVE[g]!) {
        const d = tierEffect.onHitDot;
        if (!d) continue;
        const preset = (
          V2_DOT_PRESETS as Record<
            string,
            { label: string; turns: number }
          >
        )[d.label];
        expect(preset, `${g}:${d.label}`).toBeDefined();
        expect(d.turns).toBe(preset.turns);
        expect(d.dmgPerTurn).toBeGreaterThan(0);
        expect(d.chancePct).toBeGreaterThan(0);
        expect(d.chancePct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("티어가 오를수록 핵심 수치 단조 증가", () => {
    const sword = V2_CLASS_PASSIVE.swordsman!;
    for (let i = 1; i < 4; i++) {
      expect(sword[i].extraAttackChancePct!).toBeGreaterThan(
        sword[i - 1].extraAttackChancePct!,
      );
    }
    const ninja = V2_CLASS_PASSIVE.ninja!;
    for (let i = 1; i < 4; i++) {
      expect(ninja[i].critMultAdd!).toBeGreaterThan(ninja[i - 1].critMultAdd!);
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
    expect(r!.extraAttackChancePct).toBe(
      V2_CLASS_PASSIVE.swordsman![0].extraAttackChancePct,
    );
  });

  it("패시브 티어 = 학습 시그니처 중 최고 티어(현 직업이 상위여도 미학습이면 안 오름)", () => {
    // 검신(T4)이지만 T1·T2 시그니처만 학습 → tier 2.
    const r = resolveClassPassive("swordgod", [
      SIG.swordsmanT1,
      SIG.swordmasterT2,
    ]);
    expect(r!.tier).toBe(2);
    expect(r!.extraAttackChancePct).toBe(
      V2_CLASS_PASSIVE.swordsman![1].extraAttackChancePct,
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
    // 마법사 T1 시그니처 → 마공 증폭 + 소각 DoT.
    const r = resolveClassPassive("mage", [SIG.mageT1]);
    expect(r!.group).toBe("mage");
    expect(r!.tier).toBe(1);
    expect(r!.magicAtkMultPct).toBeGreaterThan(0);
    expect(r!.onHitDot?.label).toBe("소각");
  });
});
