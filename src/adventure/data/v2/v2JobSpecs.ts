// 직업 계파(스펙) 패시브 — docs/v2-job-spec-passives-plan.md.
// 4직군(전사/무도가/마법사/도적) 각각 ~3 계파, 계파당 패시브 3개 "고정 키트"(전직마다 1개씩 해금,
// 순서만 선택). 계파 패시브는 특정 무기 종류 착용 시에만 발동(완전 비활성 폴백 — requiredWeaponType).
//
// 이 파일 = 데이터 모델 + 순수 집계(P3a). 효과는 엔진/derive 개념에 매핑되는 정규화 필드.
// 일부 필드(atkPctAdd·damageTakenReductionPct·spdPctAdd·accuracyPctAdd)는 엔진 훅 신설 필요(P3b),
// 나머지(defPenetrationPct·critMultAdd·counterChancePct·reflectPct·extraAttackChancePct·
// bleedDmgPerStack)는 기존 엔진 훅 재사용. derive 통합 + save 필드(specChoice/unlockedPassives)는 P3c.
// 현재 inert — 아직 어떤 코드도 이걸 읽지 않음(라이브 무영향).

import type { V2WeaponType } from "./v2Equipment";

// 정규화된 계파 패시브 효과 — 합산 가능(같은 필드는 더함). 미지정 = 0/무효.
export type V2SpecPassiveEffect = {
  /** 물리 공격력 % 가산 (엔진 훅 P3b). */
  atkPctAdd?: number;
  /** 마법 공격력 % 가산 (derive 가 magicAtk 에 곱 — P4b, 마법사 계파용). */
  magicAtkPctAdd?: number;
  /** 방어 관통 %p (passiveDefPenetrationPct). */
  defPenetrationPct?: number;
  /** 치명 데미지 가산 (critMult 가산분). */
  critMultAdd?: number;
  /** 받는 피해 감소 % (엔진 훅 P3b). */
  damageTakenReductionPct?: number;
  /** 피격 후 확률 반격 %p (passiveCounterChancePct). */
  counterChancePct?: number;
  /** 받은 피해 반사 % (reflectPct). */
  reflectPct?: number;
  /** 추가타 확률 %p (extraAttackChancePct). */
  extraAttackChancePct?: number;
  /** 출혈 — 적중 시 스택, 스택당 고정 피해 (bleedDmgPerStack). */
  bleedDmgPerStack?: number;
  /** 속도 % 가산 (엔진/derive 훅 P3b). */
  spdPctAdd?: number;
  /** 명중 %p 가산 (라이브 PvE 무의미 — PvP용. handoff-review §2). */
  accuracyPctAdd?: number;
};

export type V2SpecPassive = {
  /** 해금 저장 키(unlockedPassives). 직군 전역 유일. */
  id: string;
  name: string;
  desc: string;
  effect: V2SpecPassiveEffect;
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
};

// 전사(warrior) 3계파 — docs §3-A 샘플. 수치 가안(balance 미정).
const WARRIOR_SPECS: readonly V2JobSpec[] = [
  {
    id: "gwang", // 광검류 — 극딜
    name: "광검류",
    job: "warrior",
    requiredWeaponType: "greatsword",
    passives: [
      { id: "gwang_cut", name: "절단의 자세", desc: "물리 공격력 증가", effect: { atkPctAdd: 20 } },
      { id: "gwang_pierce", name: "갑옷 가르기", desc: "적 방어 일부 관통", effect: { defPenetrationPct: 17 } },
      { id: "gwang_crit", name: "일격필살", desc: "치명 데미지 증가", effect: { critMultAdd: 0.35 } },
    ],
  },
  {
    id: "cheolbyeok", // 철벽검류 — 방어·반격
    name: "철벽검류",
    job: "warrior",
    requiredWeaponType: "sword_shield",
    passives: [
      { id: "cheol_guard", name: "방패 숙련", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 14 } },
      { id: "cheol_counter", name: "응수", desc: "피격 후 확률 반격", effect: { counterChancePct: 24 } },
      { id: "cheol_reflect", name: "검면 반사", desc: "받은 피해 일부 반사", effect: { reflectPct: 14 } },
    ],
  },
  {
    id: "hyeolpung", // 혈풍검류 — 속도·출혈
    name: "혈풍검류",
    job: "warrior",
    requiredWeaponType: "rapier",
    passives: [
      { id: "hyeol_combo", name: "찌르기 연계", desc: "추가타 확률", effect: { extraAttackChancePct: 18 } },
      { id: "hyeol_bleed", name: "개방상", desc: "적중 시 출혈", effect: { bleedDmgPerStack: 8 } },
      { id: "hyeol_swift", name: "빠른 검끝", desc: "속도·명중 증가", effect: { spdPctAdd: 14, accuracyPctAdd: 12 } },
    ],
  },
];

// 무도가(martial) 3계파 — docs §3-B 스케치. P4b 뼈대(임시 수치, 밸런스 P6).
const MARTIAL_SPECS: readonly V2JobSpec[] = [
  {
    id: "cheolsan", // 철산류 — 맷집·반격
    name: "철산류",
    job: "martial",
    requiredWeaponType: "tonfa",
    passives: [
      { id: "cheolsan_guard", name: "철산고", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 16 } },
      { id: "cheolsan_counter", name: "반격세", desc: "피격 후 확률 반격", effect: { counterChancePct: 20 } },
      { id: "cheolsan_reflect", name: "강체", desc: "받은 피해 일부 반사", effect: { reflectPct: 12 } },
    ],
  },
  {
    id: "gigong", // 기공류 — 흡혈·지속
    name: "기공류",
    job: "martial",
    requiredWeaponType: "gauntlet",
    passives: [
      { id: "gigong_power", name: "기공권", desc: "물리 공격력 증가", effect: { atkPctAdd: 15 } },
      { id: "gigong_endure", name: "내공", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 10 } },
      { id: "gigong_burn", name: "발경", desc: "적중 시 지속 피해", effect: { bleedDmgPerStack: 6 } },
    ],
  },
  {
    id: "yeonhwan", // 연환권 — 연타
    name: "연환권",
    job: "martial",
    requiredWeaponType: "claw",
    passives: [
      { id: "yeonhwan_combo", name: "연환격", desc: "추가타 확률", effect: { extraAttackChancePct: 20 } },
      { id: "yeonhwan_power", name: "쾌권", desc: "물리 공격력 증가", effect: { atkPctAdd: 12 } },
      { id: "yeonhwan_swift", name: "보법", desc: "속도 증가", effect: { spdPctAdd: 12 } },
    ],
  },
];

// 마법사(mage) 3계파 — docs §3-C 스케치. P4b 뼈대. 신성·치유/제어 정밀 효과는 P6(현재 가용 필드로 placeholder).
const MAGE_SPECS: readonly V2JobSpec[] = [
  {
    id: "hwayeom", // 화염술 — 공격마법(INT)
    name: "화염술",
    job: "mage",
    requiredWeaponType: "staff",
    passives: [
      { id: "hwayeom_power", name: "주문 증폭", desc: "마법 공격력 증가", effect: { magicAtkPctAdd: 20 } },
      { id: "hwayeom_crit", name: "연소", desc: "치명 데미지 증가", effect: { critMultAdd: 0.3 } },
      { id: "hwayeom_burn", name: "소각", desc: "적중 시 지속 피해", effect: { bleedDmgPerStack: 8 } },
    ],
  },
  {
    id: "shinseong", // 신성술 — 가호·치유(SPI)
    name: "신성술",
    job: "mage",
    requiredWeaponType: "relic",
    passives: [
      { id: "shinseong_ward", name: "가호", desc: "받는 피해 감소", effect: { damageTakenReductionPct: 14 } },
      { id: "shinseong_power", name: "신성력", desc: "마법 공격력 증가", effect: { magicAtkPctAdd: 12 } },
      { id: "shinseong_reflect", name: "성역", desc: "받은 피해 일부 반사", effect: { reflectPct: 10 } },
    ],
  },
  {
    id: "binggyeol", // 빙결술 — 제어(INT)
    name: "빙결술",
    job: "mage",
    requiredWeaponType: "orb",
    passives: [
      { id: "binggyeol_power", name: "한기", desc: "마법 공격력 증가", effect: { magicAtkPctAdd: 16 } },
      { id: "binggyeol_acc", name: "빙정", desc: "명중 증가", effect: { accuracyPctAdd: 12 } },
      { id: "binggyeol_swift", name: "서리걸음", desc: "속도 증가", effect: { spdPctAdd: 12 } },
    ],
  },
];

// 도적(rogue) 3계파 — docs §3-D 스케치. P4b 뼈대. 궁수(DEX)·암살(LUK)·잠행.
const ROGUE_SPECS: readonly V2JobSpec[] = [
  {
    id: "gungsul", // 궁술 — 원거리·다타(DEX)
    name: "궁술",
    job: "rogue",
    requiredWeaponType: "bow",
    passives: [
      { id: "gungsul_volley", name: "연사", desc: "추가타 확률", effect: { extraAttackChancePct: 22 } },
      { id: "gungsul_aim", name: "정조준", desc: "명중 증가", effect: { accuracyPctAdd: 15 } },
      { id: "gungsul_pierce", name: "관통사격", desc: "적 방어 일부 관통", effect: { defPenetrationPct: 14 } },
    ],
  },
  {
    id: "amsal", // 암살 — 크리·중독(LUK)
    name: "암살",
    job: "rogue",
    requiredWeaponType: "dagger",
    passives: [
      { id: "amsal_crit", name: "급소", desc: "치명 데미지 증가", effect: { critMultAdd: 0.4 } },
      { id: "amsal_poison", name: "맹독", desc: "적중 시 지속 피해", effect: { bleedDmgPerStack: 8 } },
      { id: "amsal_edge", name: "암습", desc: "물리 공격력 증가", effect: { atkPctAdd: 12 } },
    ],
  },
  {
    id: "jamhaeng", // 잠행 — 속도·회피
    name: "잠행",
    job: "rogue",
    requiredWeaponType: "kunai",
    passives: [
      { id: "jamhaeng_swift", name: "축지", desc: "속도 증가", effect: { spdPctAdd: 16 } },
      { id: "jamhaeng_acc", name: "표적", desc: "명중 증가", effect: { accuracyPctAdd: 12 } },
      { id: "jamhaeng_combo", name: "기습", desc: "추가타 확률", effect: { extraAttackChancePct: 14 } },
    ],
  },
];

// 직군 → 계파 목록. 전사 구체화 + 나머지 3직군 뼈대(P4b, 밸런스 P6).
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
 * 선택 계파 + 해금한 패시브 ids + 장착 무기 종류 → 합산 효과.
 * 무기 게이트 불통과(종류 불일치)면 빈 효과(완전 비활성 폴백 — docs §4·§8-1).
 * 순수 함수 — derive(P3c)가 이 결과를 PlayerCombat 필드로 매핑한다.
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
