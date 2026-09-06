import { describe, expect, it } from "vitest";
import { describeV2Skill, V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { buildSkillCardModel } from "./skillCardModel";

describe("skill card summary", () => {
  it("파공 자원은 노출하고 연속 타격 계수는 상세에 묶는다", () => {
    const model = buildSkillCardModel("v2c_skyascendant_voidbreak")!;
    expect(model.resources).toEqual(["발동 50%", "MP 119"]);
    expect(model.meta).toEqual(["체술", "4회 공격"]);
    expect(model.details).toContain("1~3타 · 피해 공격력×0.3 + 민첩×0.43");
    expect(model.details).toContain("4타 · 피해 공격력×0.3 + 민첩×0.86");
    expect(model.synergy?.condition).toBe("교차 장착 + 원거리→체술 교대 공격 적중 시");
    expect(model.synergy?.effects).toContain("추가 피해 40%");
    expect(model.synergy?.pvp).toContain("추가 피해 25%");
  });

  it("낙성은 체술에서 원거리로 교대하는 조건과 포획 효과를 표시한다", () => {
    const model = buildSkillCardModel("v2c_skyascendant_fallingstar")!;
    expect(model.synergy?.condition).toBe("교차 장착 + 체술→원거리 교대 공격 적중 시");
    expect(model.synergy?.effects).toContain("최종 피해 +20%");
    expect(model.synergy?.effects).toContain("관통 45%");
  });

  it("전체 카탈로그의 기존 효과를 요약 또는 상세에 보존한다", () => {
    for (const [id, skill] of Object.entries(V2_SKILLS)) {
      const model = buildSkillCardModel(id)!;
      const all = [...model.meta, ...model.resources, ...model.highlights, ...model.details].join("\n");
      for (const chip of describeV2Skill(skill)) {
        expect(all, `${id}: ${chip}`).toContain(chip.replace(/^교차 계열: /, ""));
      }
    }
  });

  it("패시브에 액티브 비용이나 교차 연계를 만들어내지 않는다", () => {
    const model = buildSkillCardModel("v2c_primalpredator_apex")!;
    expect(model.kind).toBe("패시브");
    expect(model.synergy).toBeNull();
    expect(model.resources).toEqual([]);
    expect(buildSkillCardModel("missing")).toBeNull();
  });

  it("교차 이외 스킬의 PvP 전용 설명도 상세에서 확인할 수 있다", () => {
    for (const [id, skill] of Object.entries(V2_SKILLS)) {
      if (!skill.detail?.pvp?.length || skill.tier7Mechanic?.kind === "crossStrike") continue;
      expect(buildSkillCardModel(id)?.pvp).toEqual(skill.detail.pvp);
    }
  });
});
