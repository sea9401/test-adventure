import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_JOB_PASSIVES, jobPassive } from "./v2JobPassives";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";

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

  it("상위 8직업 = 액티브 1 + 고유 % 패시브 1", () => {
    const UPPER: Record<string, [V2SkillId, V2SkillId]> = {
      shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"],
      squire: ["v2c_squire_cleave", "v2c_squire_might"],
      boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"],
      monk: ["v2c_monk_palm", "v2c_monk_spirit"],
      caster: ["v2c_caster_bolt", "v2c_caster_acumen"],
      acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"],
      assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"],
      archer: ["v2c_archer_volley", "v2c_archer_agility"],
    };
    for (const [job, kit] of Object.entries(UPPER)) {
      expect(skillsForJob(job), job).toEqual(kit);
      const [active, passive] = kit;
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
  });

  it("상위 8직업 패시브는 서로 다른 축(고유 — 순회 메리트)", () => {
    const passiveIds = [
      "v2c_shieldman_vitality", "v2c_squire_might", "v2c_boxer_fortitude",
      "v2c_monk_spirit", "v2c_caster_acumen", "v2c_acolyte_mana",
      "v2c_assassin_fortune", "v2c_archer_agility",
    ] as const;
    // 각 패시브가 건드리는 "축"을 키로 직렬화 → 8개 모두 유일해야 한다.
    const axes = passiveIds.map((id) => {
      const p = V2_SKILLS[id].passive!;
      const keys: string[] = [];
      for (const k of Object.keys(p.statPct ?? {})) keys.push(`statPct.${k}`);
      if (p.maxHpPct) keys.push("maxHpPct");
      if (p.maxMpPct) keys.push("maxMpPct");
      return keys.sort().join(",");
    });
    expect(new Set(axes).size).toBe(passiveIds.length);
  });

  it("고차 4직업(tier 3) = 액티브 1(강) + III티어 % 패시브 1", () => {
    // III티어는 직군 축을 한 단계 더 깊게(% 가산) — 같은 축 심화(고유 축 아님, 의도적).
    const TIER3: Record<string, [V2SkillId, V2SkillId, string, number]> = {
      paladin: ["v2c_paladin_cleave", "v2c_paladin_might3", "str", 20],
      brawler: ["v2c_brawler_combo", "v2c_brawler_fortitude3", "vit", 20],
      magus: ["v2c_magus_bolt", "v2c_magus_acumen3", "int", 20],
      ranger: ["v2c_ranger_ambush", "v2c_ranger_finesse3", "dex", 20],
    };
    for (const [job, [active, passive, axis, pct]] of Object.entries(TIER3)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[active].tier, active).toBe(3);
      const p = V2_SKILLS[passive];
      expect(p.category, passive).toBe("passive");
      expect(p.passive?.statPct?.[axis as "str"], passive).toBe(pct);
    }
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

  it("aggregateEquippedPassives — % 패시브(statPct/maxHpPct/maxMpPct) 합산", () => {
    const agg = aggregateEquippedPassives([
      "v2c_warrior_might", // 플랫 str+10
      "v2c_squire_might", // statPct str+15
      "v2c_shieldman_vitality", // maxHpPct 12
      "v2c_acolyte_mana", // maxMpPct 12
      "v2c_monk_spirit", // statPct spi+15
    ]);
    expect(agg.stat).toEqual({ str: 10 }); // 플랫과 % 는 분리
    expect(agg.statPct).toEqual({ str: 15, spi: 15 });
    expect(agg.maxHpPct).toBe(12);
    expect(agg.maxMpPct).toBe(12);
  });

  it("효과 패시브 맵(V2_JOB_PASSIVES)은 비어 있음 — 기본은 패시브 스킬로 이관", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
    expect(jobPassive("warrior")).toEqual({});
  });
});
