// v2 직업 시스템 재설계 PR-1 — 직업 카탈로그(데이터 only, 기존 코드 0 배선).
// 설계 문서: docs/v2-skill-job-redesign.md
//
// 직업 정체성은 세 축뿐이다:
//   1) cultivateProfile — 수행으로 cap 을 올릴 수 있는 스탯(개념상 V2_CULTIVATE_PROFILE 와 동일 축).
//   2) jobBonus        — 전직해 있는 동안 항상 적용되는 플랫 스탯 보너스(옛 계파 % 트레이트 대체).
//   3) unlock          — 트리 위치(어떤 직업을 cumLevel 만큼 쌓아야 해금되는가).
//
// 스킬 역학은 별도 레이어(SP 로드아웃)이며 이 재설계 범위 밖이다.
// ⚠️ 이 파일은 의도적으로 어떤 라우트/엔진도 아직 import 하지 않는다(PR-1 = 데이터 신설만).
//    타입 전용 import 만 사용하므로 런타임 의존성은 0.

import type { V2StatKey } from "./v2StatKeys";
import type { V2ProficiencyState } from "./proficiency";

/** 추가 해금 조건(확장 포인트 — 현재 카탈로그엔 미사용, 후속 PR 에서 배선). */
export type ExtraJobCondition =
  | { type: "questCompleted"; questId: string }
  | { type: "monsterKilled"; monsterId: string; minCount: number }
  | { type: "statThreshold"; stat: V2StatKey; min: number };

/** 직업 해금 조건. */
export type V2JobUnlock = {
  /** 선행 직업별 최소 cumLevel. 빈 객체 = 전제 없음(모험가·기본 직업). */
  prereqs: Partial<Record<string, number>>;
  /** 선택적 추가 조건(퀘스트·킬수·스탯). 기본 미사용. */
  extraConditions?: ExtraJobCondition[];
};

/** 직업 정의. id 는 proficiency.groups 의 키이기도 하다. */
export type V2JobDefinition = {
  id: string;
  name: string;
  /** 0=모험가, 1=기본, 2=상위, 3=하이브리드/특수(후속). */
  tier: 0 | 1 | 2 | 3;
  cultivateProfile: Partial<Record<V2StatKey, number>>;
  jobBonus: Partial<Record<V2StatKey, number>>;
  unlock: V2JobUnlock;
};

/**
 * 직업 시스템 v2 마스터 플래그(env 구동, 빌드타임).
 * off(기본) = 옛 직군/계파 스탯게이트(SPEC_STAT_GATE) 유지. on = 카탈로그 cumLevel 해금.
 * V2_CORE_LOOP_V2 와 같은 NEXT_PUBLIC_ 패턴(서버·클라 공용, PR-3 UI 에서도 참조).
 */
export const V2_JOB_SYSTEM_V2 =
  process.env.NEXT_PUBLIC_V2_JOB_SYSTEM_V2 === "true";

/**
 * 상위(Tier 2) 기본 해금 임계 — 부모 기본 직업의 cumLevel(≈ Lv50 루프 2회).
 * 후속으로 추가될 고차/특수 직업은 개별 override 가능.
 */
export const TIER2_UNLOCK_CUMLEVEL = 100;

// 모험가의 HP +10% 패시브는 플랫 스탯이 아니라 별도(전투 derive)에서 적용되므로 jobBonus 에 담지 않는다.
// 기본 직업(tier 1)의 cultivateProfile 은 V2_CULTIVATE_PROFILE(proficiency.ts)과 동일해야 하며,
// 동기화 여부는 v2JobCatalog.test.ts 가 deep-equal 로 보증한다.
export const V2_JOB_CATALOG: Record<string, V2JobDefinition> = {
  // ─── Tier 0: 모험가(시작 직업) ───
  none: {
    id: "none",
    name: "모험가",
    tier: 0,
    cultivateProfile: { str: 1, vit: 1, dex: 1, int: 1, spi: 1, luk: 1 }, // 균등(명목값)
    jobBonus: {}, // HP +10% 패시브는 별도 적용
    unlock: { prereqs: {} },
  },

  // ─── Tier 1: 기본 직업(견습) — 모험가 Lv50 도달 시 전직 패널에서 4종 노출 ───
  warrior: {
    id: "warrior",
    name: "견습 병사",
    tier: 1,
    cultivateProfile: { str: 2, vit: 1, dex: 1 },
    jobBonus: { str: 10, vit: 10 },
    unlock: { prereqs: {} },
  },
  martial: {
    id: "martial",
    name: "견습 무인",
    tier: 1,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { vit: 10, str: 5, spi: 5 },
    unlock: { prereqs: {} },
  },
  mage: {
    id: "mage",
    name: "견습 마법사",
    tier: 1,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 15, spi: 5 },
    unlock: { prereqs: {} },
  },
  rogue: {
    id: "rogue",
    name: "견습 도적",
    tier: 1,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 15, luk: 5 },
    unlock: { prereqs: {} },
  },

  // ─── Tier 2: 상위 직업(직군당 2종) — 부모 cumLevel ≥ TIER2_UNLOCK_CUMLEVEL ───
  // 전사 갈래
  shieldman: {
    id: "shieldman",
    name: "방패병",
    tier: 2,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 25, str: 15 }, // 방어 탱 (← 옛 knight)
    unlock: { prereqs: { warrior: TIER2_UNLOCK_CUMLEVEL } },
  },
  squire: {
    id: "squire",
    name: "견습 기사",
    tier: 2,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 25, dex: 10 }, // 돌격 딜 (← 옛 gwang)
    unlock: { prereqs: { warrior: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 무도가 갈래
  boxer: {
    id: "boxer",
    name: "권사",
    tier: 2,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { str: 20, vit: 15 }, // 흡혈 브루저 (← 옛 gigong)
    unlock: { prereqs: { martial: TIER2_UNLOCK_CUMLEVEL } },
  },
  monk: {
    id: "monk",
    name: "수도승",
    tier: 2,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { vit: 30, spi: 5 }, // 회피 지속탱 (← 옛 cheolsan)
    unlock: { prereqs: { martial: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 마법사 갈래
  caster: {
    id: "caster",
    name: "술사",
    tier: 2,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 30, spi: 5 }, // 버스트 원소 (← 옛 arcane)
    unlock: { prereqs: { mage: TIER2_UNLOCK_CUMLEVEL } },
  },
  acolyte: {
    id: "acolyte",
    name: "사제",
    tier: 2,
    cultivateProfile: { int: 1, spi: 2, vit: 1 },
    jobBonus: { int: 15, vit: 15, spi: 10 }, // 자힐 탱 (← 옛 cleric)
    unlock: { prereqs: { mage: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 도적 갈래
  assassin: {
    id: "assassin",
    name: "자객",
    tier: 2,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 20, luk: 20 }, // 크리 폭발 (id 유지)
    unlock: { prereqs: { rogue: TIER2_UNLOCK_CUMLEVEL } },
  },
  archer: {
    id: "archer",
    name: "궁수",
    tier: 2,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 25, str: 10 }, // 다단 물량 (← 옛 archery)
    unlock: { prereqs: { rogue: TIER2_UNLOCK_CUMLEVEL } },
  },
};

/** 카탈로그의 모든 직업(정의 순서). */
export const V2_JOB_LIST: V2JobDefinition[] = Object.values(V2_JOB_CATALOG);

/** id → 정의 조회(없으면 undefined). */
export function jobById(id: string): V2JobDefinition | undefined {
  return V2_JOB_CATALOG[id];
}

/**
 * 카탈로그 직업이 현재 숙련도로 해금됐는지(cumLevel 게이트).
 * extraConditions(퀘스트·킬수)는 후속 PR 에서 배선 — 현재는 prereqs 만 검사한다.
 */
export function isJobUnlocked(
  job: V2JobDefinition,
  proficiency: V2ProficiencyState,
): boolean {
  for (const [prereqJobId, minCumLevel] of Object.entries(job.unlock.prereqs)) {
    const actual = proficiency.groups[prereqJobId]?.cumLevel ?? 0;
    if (actual < (minCumLevel ?? 0)) return false;
  }
  return true;
}

/** 현재 숙련도로 전직 가능한 비(非)모험가 직업 목록(전직 UI 용). */
export function unlockedJobs(
  proficiency: V2ProficiencyState,
): V2JobDefinition[] {
  return V2_JOB_LIST.filter(
    (job) => job.tier > 0 && isJobUnlocked(job, proficiency),
  );
}

/**
 * 전환 브리지 — 새 직업 id → 옛 (class, specChoice) 저장쌍.
 * 새 카탈로그로 해금 게이트(isJobUnlocked)는 하되, 세이브와 스킬 체인
 * (elementalSkillsForClass)은 PR-5 마이그레이션 전까지 옛 class+specChoice 모델을 그대로
 * 쓰므로 그 변환을 담는다. 옛 spec id 들은 모두 v2JobSpecs.ts 에 실재해 기존 write 경로가
 * 그대로 처리한다. PR-5(마이그레이션)/PR-6(구 계파 삭제)에서 제거 대상.
 *  - tier 1(기본): spec = null (id 동일, warrior/martial/mage/rogue)
 *  - tier 2(상위): 옛 계파 spec id 로 매핑(방패병→knight, 견습기사→gwang …)
 */
export const LEGACY_CLASS_SPEC_BY_JOB: Record<
  string,
  { class: string; spec: string | null }
> = {
  warrior: { class: "warrior", spec: null },
  martial: { class: "martial", spec: null },
  mage: { class: "mage", spec: null },
  rogue: { class: "rogue", spec: null },
  shieldman: { class: "warrior", spec: "knight" },
  squire: { class: "warrior", spec: "gwang" },
  boxer: { class: "martial", spec: "gigong" },
  monk: { class: "martial", spec: "cheolsan" },
  caster: { class: "mage", spec: "arcane" },
  acolyte: { class: "mage", spec: "cleric" },
  assassin: { class: "rogue", spec: "assassin" },
  archer: { class: "rogue", spec: "archery" },
};
