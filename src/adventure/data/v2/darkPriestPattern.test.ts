import { describe, expect, it } from "vitest";
import { darkPriestPattern } from "./darkPriestPattern";
import { effectiveCombatPatternFromEquipped, smartDefaultPatternFromEquipped } from "./v2Skills";
import { parseCombatPattern } from "@/adventure/v2/combat/combatPattern";
const equipped = ["v2c_darkpriest_blessing", "v2c_confessor_absolution", "v2c_atonementbishop_sentence", "v2c_atonementbishop_cycle", "v2c_darksaint_sanctuary", "v2c_darksaint_officiant"];
describe("고통 추천 패턴", () => {
  it("장착한 스킬만 쓰는 다섯 우선순위를 저장/복원한다", () => {
    const p=darkPriestPattern(equipped)!;
    expect(p.blocks).toHaveLength(5);
    expect(parseCombatPattern(p)).toEqual(p);
    expect(smartDefaultPatternFromEquipped(equipped)).toEqual(p);
  });
  it("기존 사용자 패턴은 유지한다", () => {
    const saved={ blocks: [{ condition: { kind: "always" as const }, action: { kind: "skill" as const, skillId: "v2c_darkpriest_reap" } }] };
    expect(effectiveCombatPatternFromEquipped(equipped,saved)).toEqual(saved);
  });
});
