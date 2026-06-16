import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_JOB_PASSIVES, jobPassive } from "./v2JobPassives";
import { V2_SKILLS, aggregateEquippedPassives, spCostOf } from "./v2Skills";

describe("직업 킷 — 스킬셋", () => {
  it("기본 4직업 = 액티브 1 + 패시브 스킬 1", () => {
    expect(skillsForJob("warrior")).toEqual([
      "v2c_warrior_strike",
      "v2c_warrior_might",
    ]); // 강타 + 근력
    expect(skillsForJob("martial")).toEqual([
      "v2c_martial_steelguard",
      "v2c_martial_fortitude",
    ]); // 철포 + 강건
    expect(skillsForJob("mage")).toEqual([
      "v2c_mage_boltcast",
      "v2c_mage_acumen",
    ]); // 마력탄 + 총명
    expect(skillsForJob("rogue")).toEqual([
      "v2c_rogue_poison",
      "v2c_rogue_finesse",
    ]); // 독침 + 예기
  });

  it("모든 직업 스킬 id 가 전투 카탈로그(V2_SKILLS)에 존재", () => {
    for (const [job, ids] of Object.entries(V2_SKILLS_BY_JOB)) {
      for (const id of ids) {
        expect(id in V2_SKILLS, `${job}:${id}`).toBe(true);
      }
    }
  });

  it("상위 직업은 흡수한 사라진 계파 스킬 포함(중간안)", () => {
    expect(skillsForJob("assassin")).toContain("v2s_venom_poisonslash"); // 독사 흡수
    expect(skillsForJob("squire")).toContain("v2s_gladiator_frenzy"); // 검투사 흡수
  });

  it("없는 jobId = 빈 배열", () => {
    expect(skillsForJob("none")).toEqual([]);
    expect(skillsForJob("nope")).toEqual([]);
  });
});

describe("직업 킷 — 액티브 스킬", () => {
  it("철포 = 받피감 버프(selfBuffPct damageReduction)", () => {
    const eff = V2_SKILLS.v2c_martial_steelguard.effects[0];
    expect(eff).toMatchObject({
      kind: "selfBuffPct",
      target: "damageReduction",
    });
  });

  it("마력탄 = 0코스트 마법 단일타", () => {
    const s = V2_SKILLS.v2c_mage_boltcast;
    expect(s.mpCost).toBe(0);
    expect(s.effects[0]).toMatchObject({ kind: "damage", scaling: "magic" });
  });

  it("독침 = 고정 수치 중독(% 아님)", () => {
    const dot = V2_SKILLS.v2c_rogue_poison.effects.find((e) => e.kind === "dot");
    expect(dot).toBeTruthy();
    if (dot && dot.kind === "dot") {
      expect(dot.flatPerStack).toBeGreaterThan(0);
      expect(dot.pctMaxHpPerStack).toBe(0);
    }
  });
});

describe("패시브 스킬 (학습+SP 슬롯해야 효과)", () => {
  it("기본 패시브 스킬 = category passive + 효과(근력/강건/총명/예기)", () => {
    expect(V2_SKILLS.v2c_warrior_might.category).toBe("passive");
    expect(V2_SKILLS.v2c_warrior_might.passive).toEqual({ stat: { str: 10 } });
    expect(V2_SKILLS.v2c_martial_fortitude.passive).toEqual({ stat: { vit: 10 } });
    expect(V2_SKILLS.v2c_mage_acumen.passive).toEqual({ stat: { int: 10 } });
    expect(V2_SKILLS.v2c_rogue_finesse.passive?.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("패시브 스킬도 SP 코스트 양수(액티브와 예산 경쟁)", () => {
    expect(spCostOf(V2_SKILLS.v2c_warrior_might)).toBeGreaterThan(0);
    expect(spCostOf(V2_SKILLS.v2c_rogue_finesse)).toBeGreaterThan(0);
  });

  it("aggregateEquippedPassives — 장착 패시브 합산(stat + atkPerDexCoef)", () => {
    const agg = aggregateEquippedPassives([
      "v2c_warrior_might", // str+10
      "v2c_rogue_finesse", // atkPerDexCoef
      "v2c_warrior_strike", // 액티브 → 무시
    ]);
    expect(agg.stat).toEqual({ str: 10 });
    expect(agg.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("효과 패시브 맵(V2_JOB_PASSIVES)은 비어 있음 — 기본은 패시브 스킬로 이관", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
    expect(jobPassive("warrior")).toEqual({});
  });
});
