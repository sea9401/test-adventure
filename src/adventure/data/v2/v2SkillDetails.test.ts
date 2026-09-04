import { describe, expect, it } from "vitest";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import { V2_SKILLS_BY_JOB } from "./v2SkillsByJob";
import { isLifestyleSkill, V2_SKILLS } from "./v2Skills";

const catalogedCombatSkills = Object.entries(V2_SKILLS_BY_JOB).flatMap(
  ([jobId, skillIds]) => {
    const jobTier = V2_JOB_CATALOG[jobId]?.tier;
    return skillIds.map((id) => ({
      id,
      jobId,
      jobTier,
      definition: V2_SKILLS[id],
    }));
  },
).filter(
  (entry) =>
    entry.definition != null &&
    !entry.definition.monsterOnly &&
    !isLifestyleSkill(entry.definition),
);

const tierSixOrLaterCombatSkills = catalogedCombatSkills.filter(
  (entry) => entry.jobTier != null && entry.jobTier >= 6,
);

type DetailPolicyEntry = {
  id: string;
  jobId: string;
  jobTier: number | undefined;
  definition: {
    detail?: {
      mechanics: readonly string[];
    };
  };
};

function missingRequiredDetail(
  entries: readonly DetailPolicyEntry[],
): string[] {
  return entries
    .filter(
      (entry) =>
        entry.jobTier != null &&
        entry.jobTier >= 6 &&
        !entry.definition.detail?.mechanics.some(
          (item) => item.trim().length > 0,
        ),
    )
    .map((entry) => `${entry.jobId}:${entry.id}`)
    .sort();
}

function detailText(skillId: keyof typeof V2_SKILLS): string {
  const detail = V2_SKILLS[skillId].detail;
  return [
    ...(detail?.mechanics ?? []),
    ...(detail?.synergies ?? []),
    ...(detail?.limitations ?? []),
    ...(detail?.pvp ?? []),
  ].join("\n");
}

describe("6차 전투 스킬 상세 원문", () => {
  it("requires usable manual detail for every tier-6-or-later combat skill", () => {
    expect(missingRequiredDetail(catalogedCombatSkills)).toEqual([]);
  });

  it("does not let a future tier bypass the manual-detail requirement", () => {
    const futureSkill = {
      id: "future_skill",
      jobId: "future_job",
      jobTier: 7,
      definition: {
        ...V2_SKILLS.v2_skill_strike,
        detail: undefined,
      },
    } satisfies DetailPolicyEntry;

    expect(missingRequiredDetail([futureSkill])).toEqual([
      "future_job:future_skill",
    ]);
  });

  it("treats whitespace-only mechanics as missing manual detail", () => {
    const blankMechanics = {
      id: "blank_skill",
      jobId: "blank_job",
      jobTier: 6,
      definition: {
        ...V2_SKILLS.v2_skill_strike,
        detail: { mechanics: [" \t"] },
      },
    } satisfies DetailPolicyEntry;

    expect(missingRequiredDetail([blankMechanics])).toEqual([
      "blank_job:blank_skill",
    ]);
  });

  it("freezes the legacy combat skills that still use automatic-only detail", () => {
    const legacyFallbackIds = [...new Set(catalogedCombatSkills
      .filter((entry) => (entry.jobTier ?? 0) < 6 && !entry.definition.detail)
      .map((entry) => entry.id))]
      .sort();

    expect(legacyFallbackIds).toMatchSnapshot();
  });

  it("excludes monster-only and lifestyle skills from tier-6-or-later detail requirements", () => {
    expect(
      tierSixOrLaterCombatSkills.every(
        (entry) => !entry.definition.monsterOnly,
      ),
    ).toBe(true);
    expect(
      tierSixOrLaterCombatSkills.every(
        (entry) => !isLifestyleSkill(entry.definition),
      ),
    ).toBe(true);
  });

  it("uses canonical berserker states and documents the annihilation recharge", () => {
    const annihilation = detailText("v2c_hegemon_annihilation");
    const dominion = detailText("v2c_hegemon_dominion");

    expect(annihilation).toContain("혈전 준비");
    expect(annihilation).toContain("사망 극복");
    expect(annihilation).toContain("1회 재충전");
    expect(annihilation).toContain("최대 2회");
    expect(`${annihilation}\n${dominion}`).not.toMatch(/혈기 준비|사선 극복/);
    expect(annihilation).not.toContain("다시 발동할 수 없다");
  });

  it("describes law inscriptions as generator-cast material rewards with canonical labels", () => {
    const inscription = detailText("v2c_lawweaver_inscription");
    const release = detailText("v2c_lawweaver_release");

    expect(inscription).toContain("대문장 해방");
    expect(inscription).toContain("각인 해방");
    expect(inscription).toContain("장착한 문장 재료");
    expect(inscription).not.toContain("직접 피해·회복·약화·보호 효과");
    expect(`${inscription}\n${release}`).toContain("환류");
    expect(`${inscription}\n${release}`).not.toContain("역류");
  });

  it("limits the grand-champion instinct copy to its actual critical cap", () => {
    expect(V2_SKILLS.v2c_grandchampion_instinct.detail?.mechanics).toEqual([
      "기본 공격의 치명타 확률 상한을 85%로 확장한다.",
    ]);
  });

  it("names the black-moon flurry's real post-hit effects", () => {
    const flurry = detailText("v2c_blackmoon_flurry");

    expect(flurry).toContain("대상의 명중을 낮추고 자신에게 회피 증가를 적용한다");
    expect(flurry).not.toContain("흑월난무");
  });

  it("separates fortress impact gain from counterattack effects", () => {
    const ram = detailText("v2c_fortressknight_ram");

    expect(ram).toContain("적의 직접 공격이 명중할 때");
    expect(ram).not.toContain("반격 효과");
  });

  it("describes sword transcendence as an exactly-one-direct-hit rule", () => {
    const transcendence = detailText("v2c_swordsaint_transcendence");

    expect(transcendence).toContain("직접 피해 효과가 정확히 하나");
    expect(transcendence).toContain("직접 피해 효과가 둘 이상인 다단 공격 전체");
  });

  it("uses the actual primordial catalyst and critical-only amplification", () => {
    const resonance = detailText("v2c_primordialmage_resonance");
    const amplification = detailText("v2c_primordialmage_amplification");

    expect(resonance).toContain("오원소 폭주");
    expect(resonance).not.toContain("원소 쇄도");
    expect(amplification).toContain("치명타가 발생한 직접 마법 스킬");
    expect(amplification).toContain("마법 피해분");
    expect(amplification).toContain("치명타가 아닌 피해");
  });

  it("distinguishes base and domain triple-ward behavior", () => {
    const inviolable = detailText("v2c_lawguardian_inviolable");
    const domain = detailText("v2c_lawguardian_domain");

    expect(inviolable).toContain("만법수호영역을 장착한 상태에서만");
    expect(inviolable).toContain("미장착 시 30% · 장착 시 40%");
    expect(inviolable).toContain("이미 쌓인 영역 안정은 유지");
    expect(inviolable).toContain("별도로 함께 적용");
    expect(domain).toContain("전투 시작부터");
    expect(domain).toContain("각각 3회");
    expect(domain).toContain("소비한 다음 피해부터");
    expect(domain).toContain("일반 액티브·패시브 받는 피해 감소와 별도로 적용");
    expect(domain).toContain("영역 안정 스택을 유지한 채");
    expect(domain).not.toContain("기본 결계 단계까지만 갱신");
  });

  it("uses magic-vulnerability stacks and the once-per-cast revelation rule", () => {
    const sentence = detailText("v2c_doomprophet_sentence");
    const revelation = detailText("v2c_doomprophet_revelation");

    expect(`${sentence}\n${revelation}`).not.toContain("계시 중첩");
    expect(sentence).toContain("마법취약 중첩");
    expect(revelation).toContain("시전당 최대 1스택");
  });

  it("describes star-path speed as an attack conversion, not a speed buff", () => {
    const starpath = detailText("v2c_heavenlybow_starpath");

    expect(starpath).toContain("현재 속도를 공격력 증가로 전환");
    expect(starpath).not.toContain("공격 속도 보정을 강화");
  });

  it("describes archmage theory as bonuses rather than coefficient changes", () => {
    const theory = detailText("v2c_archmage_theory");

    expect(theory).toContain("지능");
    expect(theory).toContain("마법 스킬 피해");
    expect(theory).not.toContain("능력치 계수");
  });

  it("limits the vajra seal boost to supported reflect sources", () => {
    const seal = detailText("v2c_vajraarhat_seal");

    expect(seal).toContain("일반 반사 피해");
    expect(seal).toContain("철벽 태세의 전용 반사 피해에는 적용되지 않는다");
  });
});
