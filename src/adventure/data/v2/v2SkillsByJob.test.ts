import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_SKILLS } from "./v2Skills";
import { V2_SPEC_SKILLS_BY_SPEC } from "./v2SkillsSpecCatalog";
import { V2_COMMON_SKILLS_BY_JOB } from "./v2SkillsCommonCatalog";

const BASE = ["warrior", "martial", "mage", "rogue"] as const;
const ALL_JOBS = [
  ...BASE,
  "shieldman",
  "squire",
  "boxer",
  "monk",
  "caster",
  "acolyte",
  "assassin",
  "archer",
];

describe("V2_SKILLS_BY_JOB (직업별 스킬셋)", () => {
  it("모험가 제외 12직업을 정의한다", () => {
    expect(Object.keys(V2_SKILLS_BY_JOB).sort()).toEqual([...ALL_JOBS].sort());
  });

  it("모든 스킬 id 가 전투 카탈로그(V2_SKILLS)에 존재한다(고아 id·오타 차단)", () => {
    for (const [job, ids] of Object.entries(V2_SKILLS_BY_JOB)) {
      for (const id of ids) {
        expect(id in V2_SKILLS, `${job}:${id}`).toBe(true);
      }
    }
  });

  it("기본 직업은 공용 스킬만 가진다", () => {
    for (const base of BASE) {
      expect(skillsForJob(base)).toEqual(V2_COMMON_SKILLS_BY_JOB[base]);
    }
  });

  it("사라진 4계파 스킬이 흡수 직업에 편입된다(고아 재활용)", () => {
    const absorbs = (job: string, spec: string) =>
      V2_SPEC_SKILLS_BY_SPEC[spec].every((s) => skillsForJob(job).includes(s));
    expect(absorbs("squire", "gladiator")).toBe(true); // 검투사 → 견습 기사(출혈)
    expect(absorbs("boxer", "yeonhwan")).toBe(true); // 연환 → 권사(콤보)
    expect(absorbs("caster", "battlemage")).toBe(true); // 워메이지 → 술사(연사)
    expect(absorbs("assassin", "venom")).toBe(true); // 독사 → 자객(중독)
  });

  it("흡수 직업은 생존 계파 시그니처도 함께 포함한다", () => {
    expect(
      V2_SPEC_SKILLS_BY_SPEC.assassin.every((s) =>
        skillsForJob("assassin").includes(s),
      ),
    ).toBe(true);
    expect(
      V2_SPEC_SKILLS_BY_SPEC.gwang.every((s) =>
        skillsForJob("squire").includes(s),
      ),
    ).toBe(true);
  });

  it("흡수 없는 상위 직업은 자기 계파 스킬만(+공용)", () => {
    // 수도승 = cheolsan 만, 흡수 없음 → 공용(martial) + cheolsan 길이.
    expect(skillsForJob("monk").length).toBe(
      V2_COMMON_SKILLS_BY_JOB.martial.length +
        V2_SPEC_SKILLS_BY_SPEC.cheolsan.length,
    );
  });

  it("없는 jobId 는 빈 배열", () => {
    expect(skillsForJob("nope")).toEqual([]);
    expect(skillsForJob("none")).toEqual([]);
  });
});
