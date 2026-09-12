import type { V2CombatPattern, V2CombatCondition, V2CombatBlock } from "@/adventure/v2/combat/combatPattern";
/** 장착된 의식만 추천한다. 저장된 사용자 패턴은 호출자가 명시적으로 적용할 때만 변경한다. */
export function darkPriestPattern(equipped: readonly string[]): V2CombatPattern | null {
  if (!equipped.includes("v2c_darkpriest_blessing")) return null;
  const blocks: V2CombatBlock[] = [];
  const add = (skillId: string, condition: V2CombatCondition) => { if (equipped.includes(skillId)) blocks.push({ condition, action: { kind: "skill", skillId } }); };
  const resource = (name: "pain" | "darkSanctuary" | "painAbsolution" | "darkSanctuaryUsed", value: number, op: "atLeast" | "atMost" = "atLeast"): V2CombatCondition => ({ kind: "self_resource", resource: name, op, value });
  const all = (...conditions: V2CombatCondition[]): V2CombatCondition => ({ kind: "all", conditions });
  add("v2c_confessor_absolution", { kind: "self_hp", op: "below", pct: 40 });
  if (equipped.includes("v2c_darksaint_sanctuary")) {
    add("v2c_confessor_absolution", all(resource("darkSanctuary", 1), resource("darkSanctuary", 1, "atMost"), resource("pain", 8)));
    add("v2c_darksaint_sanctuary", all({ kind: "self_hp", op: "above", pct: 41 }, resource("pain", 12), resource("darkSanctuaryUsed", 0, "atMost")));
  }
  if (equipped.includes("v2c_atonementbishop_cycle")) add("v2c_confessor_absolution", all(resource("pain", 5), resource("painAbsolution", 1), { kind: "self_hp", op: "below", pct: 80 }));
  const attack = ["v2c_atonementbishop_sentence", "v2c_confessor_condemnation", "v2c_darkpriest_reap"].find(id => equipped.includes(id));
  if (attack) add(attack, { kind: "always" });
  return blocks.length ? { blocks } : null;
}
