import { V2_SKILLS, type V2SkillDefinition, type V2SkillId } from "@/adventure/data/v2/v2Skills";

// 전격 계보(뇌전술사·뇌천제)와 계보 주문 MP 감소의 순수 판정. PvE·PvP·시전 해석이 같은 함수를 쓴다.
// 패시브는 현재 직업과 무관하게 장착한 스킬 정의에서 직접 읽는다.

type SkillFlags = Pick<
  V2SkillDefinition,
  | "fireMageSpell"
  | "lightningMageSpell"
  | "skillCritChancePct"
  | "vulnerableTargetCritChancePct"
  | "vulnerableTargetPiercePct"
>;

function equippedPassiveMax(
  equipped: Iterable<string>,
  key: "vulnDurationBonusTurns" | "lightningCritHastePct",
): number {
  let max = 0;
  for (const id of equipped) {
    max = Math.max(max, V2_SKILLS[id as V2SkillId]?.passive?.[key] ?? 0);
  }
  return max;
}

export type LineageSpellMpReductions = { fire: number; lightning: number };

/** 장착(그리고 학습)한 계보 패시브의 주문 MP 감소 합. 시전 해석 1회당 한 번만 계산한다. */
export function lineageSpellMpReductions(
  equipped: ReadonlySet<string>,
  learned: ReadonlySet<V2SkillId>,
): LineageSpellMpReductions {
  let fire = 0;
  let lightning = 0;
  for (const id of equipped) {
    if (!learned.has(id as V2SkillId)) continue;
    const passive = V2_SKILLS[id as V2SkillId]?.passive;
    fire += passive?.fireSpellMpCostReductionPct ?? 0;
    lightning += passive?.lightningSpellMpCostReductionPct ?? 0;
  }
  return { fire: Math.max(0, fire), lightning: Math.max(0, lightning) };
}

/** 이 주문이 받는 계보 MP 감소(%). 화염 주문은 화염 감소, 전격 주문은 전격 감소만 받는다. */
export function lineageSpellMpReductionFor(
  def: SkillFlags,
  reductions: LineageSpellMpReductions,
): number {
  return (def.fireMageSpell ? reductions.fire : 0) + (def.lightningMageSpell ? reductions.lightning : 0);
}

/** 전도 — 시전자가 새로 거는 취약의 추가 지속(행동). */
export function vulnDurationBonusTurns(equipped: Iterable<string>): number {
  return Math.max(0, Math.floor(equippedPassiveMax(equipped, "vulnDurationBonusTurns")));
}

/** 만뢰 강림 — 시전 전 대상이 취약 상태일 때만 더하는 관통(%). */
export function vulnerableTargetPiercePct(
  def: SkillFlags,
  targetVulnerable: boolean | undefined,
): number {
  return targetVulnerable ? Math.max(0, def.vulnerableTargetPiercePct ?? 0) : 0;
}

/** 이 액티브의 치명타 확률 가산(%p). 연쇄 뇌격의 취약 대상 보너스를 기존 가산과 합친다. */
export function skillCritChanceBonusPct(
  def: SkillFlags | null | undefined,
  targetVulnerable: boolean,
): number {
  if (!def) return 0;
  return (
    (def.skillCritChancePct ?? 0) +
    (targetVulnerable ? Math.max(0, def.vulnerableTargetCritChancePct ?? 0) : 0)
  );
}

/** 뇌신의 심장 — 전격 주문이 치명타로 적중했을 때의 다음 행동 가속(%). */
export function lightningCritHastePct(input: {
  def: SkillFlags | null | undefined;
  equipped: Iterable<string>;
  critical: boolean;
  landed: boolean;
}): number {
  if (!input.def?.lightningMageSpell || !input.critical || !input.landed) return 0;
  return Math.max(0, equippedPassiveMax(input.equipped, "lightningCritHastePct"));
}
