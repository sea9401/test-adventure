// 고유 아이템 발동형 시그니처 — 전투 엔진(PvE enemyPhase/playerPhase·PvP pvpPhase)이 공유하는
//   순수 헬퍼. docs/v2-signature-uniques-plan.md §10. 데이터는 PlayerCombat.equipSignatures
//   (derive.collectEquipSignatures 가 활성 세트/마퀴 단품에서 집계). 시그니처 없으면 전부 0/무발화
//   → 골든 byte-identical.
//
// 🔑 라이브 사냥=단일 적 1v1 → on-kill 무용(처치=전투 종료) → 전투 중 트리거만(low_hp/on_dodge/
//   on_crit/every_n_hits). PR-2a = low_hp(성물) PvE+PvP. 나머지 트리거는 PR-2b.

import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";

// 저체력(low_hp) 시그니처 — 현재 HP 가 maxHp 의 임계% 이하일 때 받는 피해 −% 합산.
//   조건 미충족/미장착 = 0. 여러 개면 합산(% 합).
export function lowHpDamageReductionPct(
  signatures: SignatureEffect[] | undefined,
  currentHp: number,
  maxHp: number,
): number {
  if (!signatures || signatures.length === 0 || maxHp <= 0) return 0;
  let pct = 0;
  for (const s of signatures) {
    if (s.trigger !== "low_hp" || !s.damageTakenReductionPct) continue;
    const threshold = ((s.hpThresholdPct ?? 0) / 100) * maxHp;
    if (currentHp <= threshold) pct += s.damageTakenReductionPct;
  }
  return pct;
}

// on_crit 독(독니 단검) — 크리 + 피해 발생 시 부여할 독 스택 magnitude(maxHp 비율/스택). 기존
//   poison 다이얼(~0.004) 동급. 시그니처는 발동 여부만, 강도는 이 상수(밸런스 다이얼).
export const SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK = 0.004;

// on_crit 속도 버프(군림목걸이) — 크리 + 피해 발생 시 발동할 속도 버프 {배수, 지속행동}.
//   여러 개면 가장 강한 배수. 미발동/미장착 = null.
export function onCritSpeedBuff(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): { mult: number; turns: number } | null {
  if (!critRoll || !dealtDamage || !signatures) return null;
  let best: { mult: number; turns: number } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_crit" || !s.spdBuffPct) continue;
    const mult = 1 + s.spdBuffPct / 100;
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult > best.mult) best = { mult, turns };
  }
  return best;
}

// on_crit 독 부여 여부(독니 단검) — 크리 + 피해 발생 시 poisonOnCrit 시그니처가 하나라도 있으면 true.
export function firesOnCritPoison(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): boolean {
  if (!critRoll || !dealtDamage || !signatures) return false;
  return signatures.some((s) => s.trigger === "on_crit" && s.poisonOnCrit);
}
