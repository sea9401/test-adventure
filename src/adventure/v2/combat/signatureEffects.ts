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
