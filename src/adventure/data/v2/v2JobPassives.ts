// 직업 시스템 v2 — jobId 별 always-on 효과 패시브(스탯 아닌 효과 훅:
//   받피감·흡혈·관통·spd·중독 등). derive 가 specEff 경로로 주입(직업 킷 재설계 2026-06-17).
// 기본 4직업 패시브는 "패시브 스킬"(근력·강건·총명·예기 — v2SkillsByJob, 학습+SP 슬롯)로 이관됨.
//   그래서 이 맵은 현재 비어 있다. 상위 8직업 정식 킷에서 채운다(미정의 jobId = {} 효과 없음).

// 정규화된 직업 패시브 효과 — 합산 가능(같은 필드는 더함). 미지정 = 0/무효.
// derive 가 PlayerCombat 필드로 매핑(일부 필드는 엔진/derive 훅 미구현 — 채워지기 전까지 inert).
export type V2JobPassiveEffect = {
  // ── 기존 엔진 훅 (재사용/일부 훅 미완) ───────────────────────────────
  /** 물리 공격력 % 가산. */
  atkPctAdd?: number;
  /** 마법 공격력 % 가산 (derive 가 magicAtk 에 곱). */
  magicAtkPctAdd?: number;
  /** 방어 관통 %p. */
  defPenetrationPct?: number;
  /** 치명 데미지 가산 (critMult 가산분). */
  critMultAdd?: number;
  /** 받는 피해 감소 %. */
  damageTakenReductionPct?: number;
  /** 피격 후 확률 반격 %p. */
  counterChancePct?: number;
  /** 추가타 확률 %p. */
  extraAttackChancePct?: number;
  /** 출혈/지속 — 적중 시 스택, 스택당 고정 피해. */
  bleedDmgPerStack?: number;
  /** 중독 — 적중 시 스택, 값은 POISON_PCT_PER_POINT 로 최대HP 비례율에 환산. */
  poisonPctPerStackBase?: number;
  /** 속도 % 가산. */
  spdPctAdd?: number;
  // ── 현 데이터 미사용 — derive 호환 위해 타입 보존 ─────────────────────
  /** 받은 피해 반사 % (현 설계 미사용). */
  reflectPct?: number;
  /** 명중 %p (라이브 PvE 死축 — 현 설계 미사용). */
  accuracyPctAdd?: number;
  // ── derive 매핑 — 일부는 엔진 훅 미구현(데이터만, 훅 전까지 inert) ─────
  /** 광폭 — 자신 방어력 감소 %p (유리대포 트레이드오프). */
  selfDefReductionPct?: number;
  /** 광폭 — 가하는 피해 % 가산(최종 배수). */
  dmgDealtPctAdd?: number;
  /** 방패치기 — 공격력에 방어력의 % 가산(derive). */
  atkFromDefPct?: number;
  /** 흘려막기 — 피격 시 % 확률로 피해 완전 무시. */
  damageNullifyChancePct?: number;
  /** 혈광 — 적 출혈 중이면 추가 공격 확률 %p 가산(속도 = 연타). */
  extraAttackChancePctWhileEnemyBleeding?: number;
  /** 강체 — 받은 피해의 % 만큼 방어력 누적(전투 내, 상한). */
  defGainOnHitPct?: number;
  /** 흡정공 — 가한 피해의 % 만큼 HP 회복(흡혈). */
  lifestealPct?: number;
  /** 연격세 — 적중당 공격력 % 누적(전투 내, 상한). */
  comboAtkPctPerHit?: number;
  /** 절초 — N타째 마무리 일격 추가 피해 %(N=엔진 상수). */
  comboFinisherBonusPct?: number;
  /** 약점 노출 — 스킬 적중 시 대상 받는 마법피해 %/스택(상한). */
  enemyMagicVulnPctPerStack?: number;
  /** 주문 중첩 — 스킬 시전마다 스킬 데미지 % 누적(전투 내, 상한). */
  skillDmgPctPerCast?: number;
  /** 마력 순환 — 매 턴 MP 회복(flat). */
  mpRegenPerTurn?: number;
  /** 주문 연사 — 스킬 발동 확률 %p 가산(스킬 procChance 에 합산). */
  skillProcChanceAdd?: number;
  /** 신성 회복 — 매 턴 maxHp 의 % 만큼 HP 회복(자힐). */
  hpRegenPctPerTurn?: number;
  /** 난사 — 추가타로 적중 시 그 타격 피해 % 가산. */
  extraHitDmgPct?: number;
  /** 급습 — 치명타 확률 %p 가산. */
  critChancePctAdd?: number;
  /** 부식 — 중독된 적 방어력 % 감소(디버프). */
  poisonedEnemyDefReductionPct?: number;
};

export const V2_JOB_PASSIVES: Record<string, V2JobPassiveEffect> = {};

/** jobId 의 효과 패시브. 미정의 = {} (효과 없음). */
export function jobPassive(jobId: string): V2JobPassiveEffect {
  return V2_JOB_PASSIVES[jobId] ?? {};
}
