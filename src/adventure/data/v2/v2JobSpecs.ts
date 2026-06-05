// 직업 계파(스펙) 패시브 — docs/v2-job-spec-passives-plan.md.
// 4직군(전사/무도가/마법사/도적) 각각 3 계파, 계파당 패시브 3개 "고정 키트"(전직마다 1개씩 해금,
// 순서만 선택). 계파 패시브는 특정 무기 종류 착용 시에만 발동(완전 비활성 폴백 — requiredWeaponType).
//
// 이 파일 = 데이터 모델 + 순수 집계. 효과는 엔진/derive 개념에 매핑되는 정규화 필드.
// ⚠️ 재설계 데이터 적용(시그니처/개명) 완료. 신규 효과필드(아래 "신규" 구역)는 엔진/derive 훅이
//    아직 없어 **inert** — 훅 구현(별도 청크) 전까지 전투에 미반영. 기존 필드 일부도 훅 미완.
// derive 통합 + save 필드(specChoice/unlockedPassives)는 spec route.

import type { V2WeaponType } from "./v2Equipment";

// 정규화된 계파 패시브 효과 — 합산 가능(같은 필드는 더함). 미지정 = 0/무효.
export type V2SpecPassiveEffect = {
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
  // ── 레거시(현 계파 데이터 미사용 — derive 호환 위해 타입 보존) ─────────
  /** 받은 피해 반사 % (현 설계 미사용). */
  reflectPct?: number;
  /** 명중 %p (라이브 PvE 死축 — 현 설계 미사용). */
  accuracyPctAdd?: number;
  // ── 신규 (엔진/derive 훅 미구현 — 데이터만, 훅 전까지 inert) ──────────
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

export type V2SpecPassive = {
  /** 해금 저장 키(unlockedPassives). 직군 전역 유일. id 는 안정(개명돼도 유지). */
  id: string;
  name: string;
  desc: string;
  effect: V2SpecPassiveEffect;
};

// 직업 특성(trait) — 계파마다 1개, 전직 시 자동 부여(픽 아님). 값은 "차수당 기본값" 으로,
// resolveSpecTrait 가 차수(classTier)로 스케일한다: 2차=×1, 3차=×2, 4차=×3 (1차=계파 없음=0).
// 효과는 계파 시그니처와 같은 방향으로 강화 → 같은 직군 계파끼리 차별. 전부 기존 PlayerCombat
// 필드 재사용(절제 mpCostReductionPctAdd 만 신규 시전 훅). 수치 가안(balance P6).
export type V2SpecTraitEffect = {
  /** 광기 — 물리 공격력 +%(차수당). */
  atkPctAdd?: number;
  /** 강철 — 받는 피해 -%(차수당). */
  damageTakenReductionPctAdd?: number;
  /** 출혈숙련/맹독 — 출혈(중독) 피해/스택 +(차수당). */
  bleedDmgPerStackAdd?: number;
  /** 맹독 — 중독 강도 +(차수당), POISON_PCT_PER_POINT 로 최대HP 비례율에 환산. */
  poisonPctPerStackAdd?: number;
  /** 유연 — 회피 +%(차수당). */
  evasionPctAdd?: number;
  /** 흡정 — 흡혈 +%(차수당). */
  lifestealPctAdd?: number;
  /** 연계 — 추가 공격 확률 +%p(차수당). */
  extraAttackChancePctAdd?: number;
  /** 원소통달 — 마법 공격력 +%(차수당). */
  magicAtkPctAdd?: number;
  /** 절제 — 스킬 마나 소모 -%(차수당). */
  mpCostReductionPctAdd?: number;
  /** 신성 — 매 턴 maxHp 회복 +%(차수당). */
  turnHealPctMaxHpAdd?: number;
  /** 정밀 — 치명타 확률 +%p(차수당). */
  critChancePctAdd?: number;
  /** 암살 — 치명타 피해 배율 +(차수당). */
  critMultAdd?: number;
};

export type V2SpecTrait = {
  name: string;
  desc: string;
  /** 차수당 효과(2차=×1·3차=×2·4차=×3). resolveSpecTrait 가 스케일. */
  effect: V2SpecTraitEffect;
};

export type V2JobSpec = {
  /** specChoice 저장 키. */
  id: string;
  name: string;
  /** 소속 직군(4직군 id). */
  job: string;
  /** 무기 게이트 — 이 종류 착용 시에만 계파 패시브 발동. */
  requiredWeaponType: V2WeaponType;
  /** 3개 고정 키트(전직마다 1개씩 해금). */
  passives: readonly [V2SpecPassive, V2SpecPassive, V2SpecPassive];
  /** 직업 특성 — 전직 시 자동 부여, 차수 성장. 무기 게이트 무관(계파 정체성 보강). */
  trait?: V2SpecTrait;
};

// 전사(warrior) 3계파 — 극딜/탱/출혈. 수치 가안(balance P6).
const WARRIOR_SPECS: readonly V2JobSpec[] = [
  {
    id: "gwang", // 광검 — 유리대포 극딜
    name: "광검",
    job: "warrior",
    requiredWeaponType: "greatsword",
    passives: [
      { id: "gwang_cut", name: "전투태세", desc: "물리 공격력 증가", effect: { atkPctAdd: 20 } },
      { id: "gwang_pierce", name: "갑옷 가르기", desc: "적 방어 일부 관통", effect: { defPenetrationPct: 17 } },
      { id: "gwang_crit", name: "광폭", desc: "방어를 버려 가하는 피해 증가", effect: { selfDefReductionPct: 20, dmgDealtPctAdd: 30 } },
    ],
    trait: { name: "광기", desc: "공격력 증가(차수 성장)", effect: { atkPctAdd: 4 } },
  },
  {
    id: "knight", // 기사 — 몸빵 깡딜 탱
    name: "기사",
    job: "warrior",
    requiredWeaponType: "sword_shield",
    passives: [
      { id: "knight_guard", name: "방패 숙련", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 14 } },
      { id: "knight_counter", name: "방패치기", desc: "공격력에 방어력의 일부를 더함", effect: { atkFromDefPct: 40 } },
      { id: "knight_reflect", name: "흘려막기", desc: "낮은 확률로 피해를 완전히 무시", effect: { damageNullifyChancePct: 10 } },
    ],
    trait: { name: "강철", desc: "받는 피해 감소(차수 성장)", effect: { damageTakenReductionPctAdd: 4 } },
  },
  {
    id: "gladiator", // 검투사 — 출혈 듀얼리스트
    name: "검투사",
    job: "warrior",
    requiredWeaponType: "rapier",
    passives: [
      { id: "gladiator_combo", name: "찌르기 연계", desc: "추가타 확률", effect: { extraAttackChancePct: 18 } },
      { id: "gladiator_bleed", name: "유혈", desc: "적중 시 출혈", effect: { bleedDmgPerStack: 8 } },
      { id: "gladiator_swift", name: "혈광", desc: "적이 출혈 중이면 추가 공격 확률 증가", effect: { extraAttackChancePctWhileEnemyBleeding: 15 } },
    ],
    trait: { name: "출혈숙련", desc: "출혈 피해 증가(차수 성장)", effect: { bleedDmgPerStackAdd: 3 } },
  },
];

// 무도가(martial) 3계파 — 회피탱/흡혈/콤보. 수치 가안(balance P6).
const MARTIAL_SPECS: readonly V2JobSpec[] = [
  {
    id: "cheolsan", // 금강 — 회피·버팀 탱
    name: "금강",
    job: "martial",
    requiredWeaponType: "gauntlet",
    passives: [
      { id: "cheolsan_guard", name: "금강신", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 16 } },
      { id: "cheolsan_counter", name: "반격세", desc: "피격 후 확률 반격", effect: { counterChancePct: 20 } },
      { id: "cheolsan_reflect", name: "강체", desc: "받은 피해만큼 방어력 누적", effect: { defGainOnHitPct: 15 } },
    ],
    trait: { name: "유연", desc: "회피 증가(차수 성장)", effect: { evasionPctAdd: 4 } },
  },
  {
    id: "gigong", // 혈권 — 흡혈 브루저
    name: "혈권",
    job: "martial",
    requiredWeaponType: "gauntlet",
    passives: [
      { id: "gigong_power", name: "기공권", desc: "물리 공격력 증가", effect: { atkPctAdd: 15 } },
      { id: "gigong_endure", name: "흡정공", desc: "가한 피해의 일부만큼 체력 흡수", effect: { lifestealPct: 10 } },
      { id: "gigong_burn", name: "내상", desc: "적중 시 지속 피해", effect: { bleedDmgPerStack: 6 } },
    ],
    trait: { name: "흡정", desc: "흡혈 증가(차수 성장)", effect: { lifestealPctAdd: 3 } },
  },
  {
    id: "yeonhwan", // 연환 — 콤보 격투가
    name: "연환",
    job: "martial",
    requiredWeaponType: "claw",
    passives: [
      { id: "yeonhwan_combo", name: "연환격", desc: "추가타 확률", effect: { extraAttackChancePct: 20 } },
      { id: "yeonhwan_power", name: "연격세", desc: "적중할 때마다 공격력 누적", effect: { comboAtkPctPerHit: 4 } },
      { id: "yeonhwan_swift", name: "절초", desc: "연속 N타째 마무리 강타", effect: { comboFinisherBonusPct: 150 } },
    ],
    trait: { name: "연계", desc: "추가 공격 확률 증가(차수 성장)", effect: { extraAttackChancePctAdd: 5 } },
  },
];

// 마법사(mage) 3계파 — 버스트 나커/시전 난사/자힐 탱. 수치 가안(balance P6).
const MAGE_SPECS: readonly V2JobSpec[] = [
  {
    id: "arcane", // 마도사 — 버스트 원소 나커
    name: "마도사",
    job: "mage",
    requiredWeaponType: "staff",
    passives: [
      { id: "arcane_power", name: "주문 증폭", desc: "마법 공격력 증가", effect: { magicAtkPctAdd: 20 } },
      { id: "arcane_burst", name: "원소 폭발", desc: "치명 데미지 증가", effect: { critMultAdd: 0.3 } },
      { id: "arcane_ignite", name: "약점 노출", desc: "스킬 적중 시 대상 받는 마법피해 증가(중첩)", effect: { enemyMagicVulnPctPerStack: 5 } },
    ],
    trait: { name: "원소통달", desc: "마법 공격력 증가(차수 성장)", effect: { magicAtkPctAdd: 5 } },
  },
  {
    id: "battlemage", // 워메이지 — 시전 누적 난사
    name: "워메이지",
    job: "mage",
    requiredWeaponType: "staff",
    passives: [
      { id: "battlemage_power", name: "주문 중첩", desc: "스킬 시전마다 스킬 데미지 누적", effect: { skillDmgPctPerCast: 6 } },
      { id: "battlemage_ward", name: "마력 순환", desc: "매 턴 마나 회복", effect: { mpRegenPerTurn: 8 } },
      { id: "battlemage_blade", name: "주문 연사", desc: "스킬 발동 확률 증가", effect: { skillProcChanceAdd: 15 } },
    ],
    trait: { name: "절제", desc: "스킬 마나 소모 감소(차수 성장)", effect: { mpCostReductionPctAdd: 8 } },
  },
  {
    id: "cleric", // 사제 — 자힐 신성 탱
    name: "사제",
    job: "mage",
    requiredWeaponType: "staff",
    passives: [
      { id: "cleric_ward", name: "가호", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 14 } },
      { id: "cleric_power", name: "신성력", desc: "마법 공격력 증가", effect: { magicAtkPctAdd: 12 } },
      { id: "cleric_reflect", name: "신성 회복", desc: "매 턴 체력 회복(자힐)", effect: { hpRegenPctPerTurn: 4 } },
    ],
    trait: { name: "신성", desc: "매 턴 체력 회복 증가(차수 성장)", effect: { turnHealPctMaxHpAdd: 2 } },
  },
];

// 도적(rogue) 3계파 — 물량 다단/크리 폭발/독 부식. 수치 가안(balance P6).
const ROGUE_SPECS: readonly V2JobSpec[] = [
  {
    id: "archery", // 궁사 — 물량 다단
    name: "궁사",
    job: "rogue",
    requiredWeaponType: "bow",
    passives: [
      { id: "archery_volley", name: "연사", desc: "추가타 확률", effect: { extraAttackChancePct: 22 } },
      { id: "archery_aim", name: "난사", desc: "추가타로 적중 시 그 타격 피해 증가", effect: { extraHitDmgPct: 20 } },
      { id: "archery_pierce", name: "관통사격", desc: "적 방어 일부 관통", effect: { defPenetrationPct: 14 } },
    ],
    trait: { name: "정밀", desc: "치명타 확률 증가(차수 성장)", effect: { critChancePctAdd: 3 } },
  },
  {
    id: "assassin", // 자객 — 크리 폭발
    name: "자객",
    job: "rogue",
    requiredWeaponType: "dagger",
    passives: [
      { id: "assassin_crit", name: "급소", desc: "치명 데미지 증가", effect: { critMultAdd: 0.4 } },
      { id: "assassin_flurry", name: "그림자 연격", desc: "추가타 확률", effect: { extraAttackChancePct: 18 } },
      { id: "assassin_edge", name: "급습", desc: "치명타 확률 증가", effect: { critChancePctAdd: 15 } },
    ],
    trait: { name: "암살", desc: "치명타 피해 증가(차수 성장)", effect: { critMultAdd: 0.15 } },
  },
  {
    id: "venom", // 독사 — 독 부식
    name: "독사",
    job: "rogue",
    requiredWeaponType: "dagger",
    passives: [
      { id: "venom_toxin", name: "맹독", desc: "적중 시 중독", effect: { poisonPctPerStackBase: 10 } },
      { id: "venom_flurry", name: "연속 독격", desc: "추가타 확률(독 적중 증가)", effect: { extraAttackChancePct: 16 } },
      { id: "venom_corrode", name: "부식", desc: "중독된 적 방어력 감소", effect: { poisonedEnemyDefReductionPct: 20 } },
    ],
    trait: { name: "맹독", desc: "중독 피해 증가(차수 성장)", effect: { poisonPctPerStackAdd: 4 } },
  },
];

// 직군 → 계파 목록. 12계파 재설계 데이터 적용(수치 가안, balance P6).
export const V2_JOB_SPECS: Record<string, readonly V2JobSpec[]> = {
  warrior: WARRIOR_SPECS,
  martial: MARTIAL_SPECS,
  mage: MAGE_SPECS,
  rogue: ROGUE_SPECS,
};

/** 계파 조회 — 직군·계파 id 로. 없으면 undefined. */
export function getJobSpec(
  job: string,
  specId: string,
): V2JobSpec | undefined {
  return V2_JOB_SPECS[job]?.find((s) => s.id === specId);
}

/** 계파 id 만으로 전역 조회(save 의 specChoice 해석용 — 직군 무관, id 전역 유일). */
export function getSpecById(specId: string): V2JobSpec | undefined {
  for (const specs of Object.values(V2_JOB_SPECS)) {
    const found = specs.find((s) => s.id === specId);
    if (found) return found;
  }
  return undefined;
}

/**
 * 직업 특성을 차수(classTier)로 스케일한 효과를 반환한다.
 * trait.effect 는 "차수당 기본값" — 2차=×1, 3차=×2, 4차=×3 (steps = classTier-1).
 * spec/trait 없음·1차(steps≤0)면 빈 효과(inert). 무기 게이트와 무관(계파 정체성 보강).
 * 순수 함수 — derive 가 이 결과를 PlayerCombat 필드에 합산한다.
 */
export function resolveSpecTrait(
  spec: V2JobSpec | undefined,
  classTier: number | undefined,
): V2SpecTraitEffect {
  if (!spec?.trait) return {};
  const steps = Math.max(0, Math.floor(classTier ?? 1) - 1);
  if (steps <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(spec.trait.effect)) {
    // 반올림(4자리) — critMultAdd 0.15×3 같은 float 드리프트 제거(0.4499… → 0.45).
    if (typeof v === "number" && v !== 0) {
      out[k] = Math.round(v * steps * 10000) / 10000;
    }
  }
  return out as V2SpecTraitEffect;
}

/** 직업 특성 효과(스케일된 값)를 한 줄 텍스트로. UI 표기용. 빈 효과면 "". */
export function describeSpecTraitEffect(e: V2SpecTraitEffect): string {
  const parts: string[] = [];
  if (e.atkPctAdd) parts.push(`공격력 +${e.atkPctAdd}%`);
  if (e.magicAtkPctAdd) parts.push(`마법 공격력 +${e.magicAtkPctAdd}%`);
  if (e.damageTakenReductionPctAdd)
    parts.push(`받는 피해 -${e.damageTakenReductionPctAdd}%`);
  if (e.bleedDmgPerStackAdd) parts.push(`출혈 피해 +${e.bleedDmgPerStackAdd}`);
  if (e.evasionPctAdd) parts.push(`회피 +${e.evasionPctAdd}%`);
  if (e.lifestealPctAdd) parts.push(`흡혈 +${e.lifestealPctAdd}%`);
  if (e.extraAttackChancePctAdd)
    parts.push(`추가 공격 확률 +${e.extraAttackChancePctAdd}%`);
  if (e.mpCostReductionPctAdd)
    parts.push(`마나 소모 -${e.mpCostReductionPctAdd}%`);
  if (e.turnHealPctMaxHpAdd) parts.push(`매 턴 HP +${e.turnHealPctMaxHpAdd}%`);
  if (e.critChancePctAdd) parts.push(`치명타 확률 +${e.critChancePctAdd}%`);
  if (e.critMultAdd) parts.push(`치명타 피해 +${e.critMultAdd}배`);
  return parts.join(" · ");
}

/**
 * 선택 계파 + 해금한 패시브 ids + 장착 무기 종류 → 합산 효과.
 * 무기 게이트 불통과(종류 불일치)면 빈 효과(완전 비활성 폴백 — docs §4·§8-1).
 * 순수 함수 — derive 가 이 결과를 PlayerCombat 필드로 매핑한다.
 */
export function aggregateSpecPassives(
  spec: V2JobSpec | undefined,
  unlockedPassiveIds: readonly string[],
  equippedWeaponType: V2WeaponType | undefined,
): V2SpecPassiveEffect {
  if (!spec) return {};
  // 무기 게이트 — 완전 비활성. 종류 불일치/미장착이면 계파 패시브 전부 OFF.
  if (equippedWeaponType !== spec.requiredWeaponType) return {};
  const unlocked = new Set(unlockedPassiveIds);
  const out: V2SpecPassiveEffect = {};
  for (const p of spec.passives) {
    if (!unlocked.has(p.id)) continue;
    for (const [k, v] of Object.entries(p.effect) as [
      keyof V2SpecPassiveEffect,
      number,
    ][]) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}
