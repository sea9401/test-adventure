import { describe, expect, it } from "vitest";
import { V2_SKILLS, spCostOf, type V2SkillId } from "./v2Skills";
import { V2_JOB_CATALOG } from "./v2JobCatalog";

describe("암흑사제 계보", () => {
  it("기존 스킬 ID로 흡혈 없는 의식과 코어를 복원한다", () => {
    expect(V2_SKILLS.v2c_darkpriest_reap.name).toBe("고통의 기도");
    expect(V2_SKILLS.v2c_darkpriest_reap.effects.some(e => e.kind === "healFromDamage" || e.kind === "executeDamage")).toBe(false);
    expect(V2_SKILLS.v2c_darkpriest_blessing.passive).toEqual({});
  });
  it("3차에서 6차까지 직업을 연결한다", () => {
    expect(V2_JOB_CATALOG.confessor.unlock.prereqs).toHaveProperty("darkpriest");
    expect(V2_JOB_CATALOG.atonementbishop.unlock.prereqs).toHaveProperty("confessor");
    expect(V2_JOB_CATALOG.darksaint.unlock.prereqs).toHaveProperty("atonementbishop");
  });
});

it("6차 기본 의식 여섯 개는 시작 SP 40 안에 장착할 수 있다", () => {
  const ids: V2SkillId[] = ["v2c_darkpriest_blessing", "v2c_confessor_absolution", "v2c_atonementbishop_sentence", "v2c_atonementbishop_cycle", "v2c_darksaint_sanctuary", "v2c_darksaint_officiant"];
  expect(ids.reduce((sum, id) => sum + spCostOf(V2_SKILLS[id]), 0)).toBe(38);
});
