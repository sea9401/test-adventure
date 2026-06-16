import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_JOB_PASSIVES, jobPassive } from "./v2JobPassives";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import { V2_SKILLS } from "./v2Skills";

describe("직업 킷 — 스킬셋", () => {
  it("기본 4직업 = 확정 시그니처 1개", () => {
    expect(skillsForJob("warrior")).toEqual(["v2c_warrior_strike"]); // 강타
    expect(skillsForJob("martial")).toEqual(["v2c_martial_steelguard"]); // 철포
    expect(skillsForJob("mage")).toEqual(["v2c_mage_boltcast"]); // 마력탄
    expect(skillsForJob("rogue")).toEqual(["v2c_rogue_poison"]); // 독침
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

describe("직업 킷 — 신규/변경 스킬", () => {
  it("철포 = 받피감 버프(selfBuffPct damageReduction)", () => {
    const eff = V2_SKILLS.v2c_martial_steelguard.effects[0];
    expect(eff).toMatchObject({ kind: "selfBuffPct", target: "damageReduction" });
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
      expect(dot.flatPerStack).toBeGreaterThan(0); // 고정 수치
      expect(dot.pctMaxHpPerStack).toBe(0); // % 아님
    }
  });
});

describe("직업 킷 — 패시브/보너스", () => {
  it("기본직업 패시브 = 단일 스탯(jobBonus 단순화)", () => {
    expect(V2_JOB_CATALOG.warrior.jobBonus).toEqual({ str: 10 });
    expect(V2_JOB_CATALOG.martial.jobBonus).toEqual({ vit: 10 });
    expect(V2_JOB_CATALOG.mage.jobBonus).toEqual({ int: 10 });
    expect(V2_JOB_CATALOG.rogue.jobBonus).toEqual({}); // 도적은 효과 패시브(spd)
  });

  it("효과 패시브 맵은 비어 있음 — 기본직업 패시브는 jobBonus(스탯) 또는 직군 베이스라인(예기·마력구)", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
  });

  it("패시브 미정의 직업 = {} (효과 없음)", () => {
    expect(jobPassive("warrior")).toEqual({});
    expect(jobPassive("rogue")).toEqual({}); // 도적 패시브 = 예기(derive 직군 베이스라인)
    expect(jobPassive("nope")).toEqual({});
  });
});
