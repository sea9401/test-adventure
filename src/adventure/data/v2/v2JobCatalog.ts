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
import { V2_LEVEL_CAP } from "./coreLoopConfig";

/**
 * 추가 해금 조건(cumLevel prereqs 외). isJobUnlocked 가 평가(#818 배선). 현 카탈로그 직업은
 * 아직 미사용 — 미래 직업(예: 퀘스트로 여는 히든 직업)이 선택적으로 단다.
 *  - statThreshold: 그 스탯의 cultivation cap(proficiency.caps) ≥ min. proficiency 만으로 평가(ctx 불요).
 *  - questCompleted: 수령 완료 가이드 퀘스트 집합에 포함(ctx.completedQuestIds 필요).
 *  - monsterKilled: per-monster 킬수 ≥ min(ctx.killCounts 필요). ⚠️ 킬 트래커 미신설 — 데이터
 *    소스 없어 현재 항상 미충족. 트래커 신설은 별도 작업.
 */
export type ExtraJobCondition =
  | { type: "questCompleted"; questId: string }
  | { type: "monsterKilled"; monsterId: string; minCount: number }
  | { type: "statThreshold"; stat: V2StatKey; min: number };

/** isJobUnlocked 의 추가 조건 평가용 컨텍스트(없으면 quest/kill 조건은 미충족 처리). */
export type JobUnlockContext = {
  /** 수령 완료 가이드 퀘스트 id 집합(questCompleted 용). */
  completedQuestIds?: ReadonlySet<string>;
  /** per-monster 킬수(monsterKilled 용). ⚠️ 킬 트래커 미신설 — 현재 미제공(별도 작업). */
  killCounts?: Readonly<Record<string, number>>;
};

/** 직업 해금 조건. */
export type V2JobUnlock = {
  /** 선행 직업별 최소 cumLevel. 빈 객체 = 전제 없음(모험가·기본 직업). */
  prereqs: Partial<Record<string, number>>;
  /** 선택적 추가 조건(퀘스트·킬수·스탯). isJobUnlocked 가 평가(#818). 현 카탈로그는 비어 있음. */
  extraConditions?: ExtraJobCondition[];
};

/** 직업 정의. id 는 proficiency.groups 의 키이기도 하다. */
export type V2JobDefinition = {
  id: string;
  name: string;
  /** 0=모험가, 1=기본, 2=상위, 3=고차, 4=심화, 5=상급 심화, 6=초월 심화. */
  tier: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  cultivateProfile: Partial<Record<V2StatKey, number>>;
  jobBonus: Partial<Record<V2StatKey, number>>;
  unlock: V2JobUnlock;
};

/**
 * 상위(Tier 2) 해금 임계 — 부모 "기본 직업의 직군 숙련도"(groups[base].cumLevel). 첫 전직이라
 * 베이스 직군 숙련도로 게이트(예: 견습 병사 숙련도 900 → 방패병/견습 기사). prereq 키 = tier-1 base id.
 * 숙련도는 사냥 승리당 +1 이므로, 900은 빠른 전투 기준으로도 최소 성장 시간을 확보하는 값이다.
 */
export const TIER2_UNLOCK_CUMLEVEL = 900;

/**
 * 고차(Tier 3) 해금 임계 — 🔑 2026-06-21 계보 게이팅 전환: 직군(base) 숙련도가 아니라 "그 직업의 바로
 *   아래 2차 직업"의 jobCumLevel 을 본다(예: 대사제 ← 사제 숙련도 1800, 마도사 ← 마법사 숙련도 1800).
 *   prereq 키 = tier-2 부모 직업 id → isJobUnlocked 가 jobCumLevel 로 분기. 조건 표시도 계보 직업명으로
 *   자연스러워짐. 값 1800 ≈ 그 2차 직업 2 루프. (옛 직군 게이팅 #925 supersede.)
 */
export const TIER3_UNLOCK_CUMLEVEL = 1800;

/**
 * 심화(Tier 4) 해금 임계 — 계보 게이팅(위 참조): "그 직업의 바로 아래 3차 직업"의 jobCumLevel
 *   (예: 정예 기사 ← 기사 숙련도 2700, 대마법사·원소술사 ← 마도사 숙련도 2700). prereq 키 = tier-3 부모 직업
 *   id. 값 2700 ≈ 그 3차 직업 3 루프. 계보 체인(2차→3차→4차)이라 직군 단일풀보다 자연스럽고 깊다.
 */
export const TIER4_UNLOCK_CUMLEVEL = 2700;

/**
 * 5차 해금 임계 — 바로 아래 4차 직업의 jobCumLevel. 5차는 빠른 전직 계단이 아니라 장기 엔드
 * 성장 목표라 4차보다 간격을 크게 둔다.
 */
export const TIER5_UNLOCK_CUMLEVEL = 7500;

/**
 * 6차 해금 임계 — 바로 아래 5차 직업의 jobCumLevel. 아이템 강화가 아니라 직업 숙련도 자체로
 * 스펙업하는 장기 목표.
 */
export const TIER6_UNLOCK_CUMLEVEL = 12000;

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
  survivor: {
    id: "survivor",
    name: "생존자",
    tier: 0,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: {}, // HP/회복 정체성은 착용형 패시브로 제공
    unlock: { prereqs: {} },
  },

  // ─── Tier 1: 기본 직업(견습) — 모험가/생존자 루트가 레벨 한계에 도달하면 전직 패널에 노출 ───
  warrior: {
    id: "warrior",
    name: "견습 병사",
    tier: 1,
    cultivateProfile: { str: 2, vit: 1, dex: 1 },
    jobBonus: { str: 5 }, // 내장 보너스(현재 직업 1개분, 소량) — 패시브 근력과 별개 누적
    unlock: { prereqs: {} },
  },
  martial: {
    id: "martial",
    name: "견습 무인",
    tier: 1,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { vit: 5 },
    unlock: { prereqs: {} },
  },
  mage: {
    id: "mage",
    name: "견습 마법사",
    tier: 1,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 5 },
    unlock: { prereqs: {} },
  },
  rogue: {
    id: "rogue",
    name: "견습 도적",
    tier: 1,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 5 }, // 내장 보너스(소량) — 예기 패시브(DEX→공격력)와 별개
    unlock: { prereqs: {} },
  },
  camper: {
    id: "camper",
    name: "야영꾼",
    tier: 2,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: { spi: 3, vit: 2 }, // 회복/휴식 루트 입문 — 딜 보너스 없이 생존 보강
    unlock: { prereqs: { survivor: TIER2_UNLOCK_CUMLEVEL } },
  },
  ironman: {
    id: "ironman",
    name: "철인",
    tier: 2,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: { vit: 5 }, // 최대 HP·보호막 루트 입문
    unlock: { prereqs: { survivor: TIER2_UNLOCK_CUMLEVEL } },
  },
  fisher: {
    id: "fisher",
    name: "낚시꾼",
    tier: 2,
    cultivateProfile: { luk: 2, spi: 1, vit: 1 },
    jobBonus: { luk: 3, spi: 2 }, // 생활 루트 입문 — 낚시 보너스는 장착 패시브가 담당
    unlock: { prereqs: { survivor: TIER2_UNLOCK_CUMLEVEL } },
  },

  // ─── Tier 2: 상위 직업 — 부모 cumLevel ≥ TIER2_UNLOCK_CUMLEVEL ───
  // 전사 갈래
  shieldman: {
    id: "shieldman",
    name: "방패병",
    tier: 2,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 12, str: 6 }, // 방어 탱 (← 옛 knight)
    unlock: { prereqs: { warrior: TIER2_UNLOCK_CUMLEVEL } },
  },
  squire: {
    id: "squire",
    name: "견습 기사",
    tier: 2,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 12, dex: 5 }, // 돌격 딜 (← 옛 gwang)
    unlock: { prereqs: { warrior: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 무도가 갈래
  boxer: {
    id: "boxer",
    name: "권사",
    tier: 2,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 11, dex: 5, vit: 4 }, // 연격 입문 — 때리고 피하는 권법 라인
    unlock: { prereqs: { martial: TIER2_UNLOCK_CUMLEVEL } },
  },
  monk: {
    id: "monk",
    name: "수도승",
    tier: 2,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { vit: 14, spi: 4 }, // 회피 지속탱 (← 옛 cheolsan)
    unlock: { prereqs: { martial: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 마법사 갈래
  caster: {
    id: "caster",
    name: "마법사",
    tier: 2,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 14, spi: 4 }, // 버스트 원소 (← 옛 arcane)
    unlock: { prereqs: { mage: TIER2_UNLOCK_CUMLEVEL } },
  },
  acolyte: {
    id: "acolyte",
    name: "사제",
    tier: 2,
    cultivateProfile: { int: 1, spi: 2, vit: 1 },
    jobBonus: { int: 7, vit: 7, spi: 5 }, // 자힐 탱 (← 옛 cleric)
    unlock: { prereqs: { mage: TIER2_UNLOCK_CUMLEVEL } },
  },
  // 도적 갈래
  assassin: {
    id: "assassin",
    name: "자객",
    tier: 2,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 10, luk: 10 }, // 크리 폭발 (id 유지)
    unlock: { prereqs: { rogue: TIER2_UNLOCK_CUMLEVEL } },
  },
  archer: {
    id: "archer",
    name: "궁수",
    tier: 2,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 12, str: 5 }, // 다단 물량 (← 옛 archery)
    unlock: { prereqs: { rogue: TIER2_UNLOCK_CUMLEVEL } },
  },
  venomist: {
    id: "venomist",
    name: "독술사",
    tier: 2,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { luk: 12, dex: 8 }, // 중독 누적·부식 특화
    unlock: { prereqs: { rogue: TIER2_UNLOCK_CUMLEVEL } },
  },

  // ─── Tier 3: 고차 직업 — 🔑 계보 게이팅: 바로 아래 2차 직업의 jobCumLevel ≥ TIER3_UNLOCK_CUMLEVEL ───
  //   (견습 기사→기사·마법사→마도사·사제→대사제 …). 직군 단일풀이 아니라 계보 직업을 키워야 열린다.
  //   트리 성장(A 메타 PR-3). 작은 이중 내장 보너스 + 액티브 1(강) + III티어 % 패시브(직군 축).
  paladin: {
    id: "paladin",
    name: "기사",
    tier: 3,
    cultivateProfile: { str: 2, vit: 1, dex: 1 },
    jobBonus: { str: 10, vit: 10 }, // 전사 고차 — 힘·활력 균형
    unlock: { prereqs: { squire: TIER3_UNLOCK_CUMLEVEL } }, // 견습 기사 계보
  },
  brawler: {
    id: "brawler",
    name: "격투가",
    tier: 3,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 12, dex: 6, vit: 4 }, // 권사 계승 — 연격·보법 심화
    unlock: { prereqs: { boxer: TIER3_UNLOCK_CUMLEVEL } }, // 권사 계보
  },
  magus: {
    id: "magus",
    name: "마도사",
    tier: 3,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 13, spi: 7 }, // 마법 고차 — 지능 중심
    unlock: { prereqs: { caster: TIER3_UNLOCK_CUMLEVEL } }, // 마법사 계보
  },
  shaman: {
    id: "shaman",
    name: "주술사",
    tier: 3,
    cultivateProfile: { int: 2, spi: 1, luk: 1 },
    jobBonus: { int: 14, spi: 4, luk: 2 }, // 마법 고차(마법사 분기) — 저주·취약 누적
    unlock: { prereqs: { caster: TIER3_UNLOCK_CUMLEVEL } }, // 마법사 계보의 저주 분기
  },
  ranger: {
    id: "ranger",
    name: "궁사",
    tier: 3,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 13, luk: 7 }, // 도적 고차 — 민첩 중심
    unlock: { prereqs: { archer: TIER3_UNLOCK_CUMLEVEL } }, // 궁수 계보
  },
  // 3차 두 번째 갈래 — 방패병/수도승/사제/자객 계보. 각자 자기 2차 부모의 jobCumLevel TIER3 해금,
  //   정체성은 형제와 다른 축(받피감/회피/회복/치명피해)으로 차별.
  guardian: {
    id: "guardian",
    name: "가디언",
    tier: 3,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 15, str: 5 }, // 전사 고차(방패병 계승) — 활력 탱
    unlock: { prereqs: { shieldman: TIER3_UNLOCK_CUMLEVEL } }, // 방패병 계보
  },
  berserker: {
    id: "berserker",
    name: "광전사",
    tier: 3,
    cultivateProfile: { str: 2, vit: 1, luk: 1 },
    jobBonus: { str: 16, vit: 4 }, // 전사 고차(견습 기사 분기) — 저HP 화력
    unlock: { prereqs: { squire: TIER3_UNLOCK_CUMLEVEL } }, // 견습 기사 계보의 공격 분기
  },
  warmonk: {
    id: "warmonk",
    name: "무승",
    tier: 3,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: { vit: 13, spi: 7 }, // 무도 고차(수도승 계승) — 회피/유연
    unlock: { prereqs: { monk: TIER3_UNLOCK_CUMLEVEL } }, // 수도승 계보
  },
  bishop: {
    id: "bishop",
    name: "대사제",
    tier: 3,
    cultivateProfile: { spi: 2, int: 2 },
    jobBonus: { spi: 15, int: 5 }, // 마법 고차(사제 계승) — 정신/지원
    unlock: { prereqs: { acolyte: TIER3_UNLOCK_CUMLEVEL } }, // 사제 계보
  },
  shadow: {
    id: "shadow",
    name: "그림자",
    tier: 3,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 15, dex: 5 }, // 도적 고차(자객 계승) — 행운/치명
    unlock: { prereqs: { assassin: TIER3_UNLOCK_CUMLEVEL } }, // 자객 계보
  },
  venomancer: {
    id: "venomancer",
    name: "맹독술사",
    tier: 3,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 15, dex: 7 }, // 독술사 계승 — 중독 누적·부식 심화
    unlock: { prereqs: { venomist: TIER3_UNLOCK_CUMLEVEL } }, // 독술사 계보
  },
  // 생존자 갈래
  fieldmedic: {
    id: "fieldmedic",
    name: "탐험대 의무병",
    tier: 3,
    cultivateProfile: { vit: 2, spi: 1, int: 1 },
    jobBonus: { spi: 8, vit: 7 },
    unlock: { prereqs: { camper: TIER3_UNLOCK_CUMLEVEL } },
  },
  extremesurvivor: {
    id: "extremesurvivor",
    name: "극한 생존가",
    tier: 3,
    cultivateProfile: { vit: 2, str: 1, luk: 1 },
    jobBonus: { vit: 12, str: 3 },
    unlock: { prereqs: { ironman: TIER3_UNLOCK_CUMLEVEL } },
  },
  angler: {
    id: "angler",
    name: "명인 낚시꾼",
    tier: 3,
    cultivateProfile: { luk: 2, spi: 1, vit: 1 },
    jobBonus: { luk: 10, spi: 5 },
    unlock: { prereqs: { fisher: TIER3_UNLOCK_CUMLEVEL } },
  },
  // 하이브리드(tier 3·교차 직업) — 단일 3차와 달리 부모가 둘. ⚠️ 직군이 아니라 특정 상위 직업
  //   (기사·사제)을 각각 jobCumLevel ≥ TIER3_UNLOCK_CUMLEVEL 키워야 열린다. 직업별 숙련도
  //   (jobCumLevel)을 본다 — isJobUnlocked 가 prereq 키의 tier 로 분기(tier1=직군 groups, 상위=
  //   jobCumLevel). 기사·사제 중 한쪽만 TIER3 채워선 안 열림(둘 다 거쳐야).
  //   class 저장은 첫 prereq 의 직군(기사→전사), spec 은 고유 id — jobIdFromLegacy 가 왕복. 정체성=양쪽 결합.
  templar: {
    id: "templar",
    name: "성기사",
    tier: 3,
    cultivateProfile: { str: 2, vit: 1, spi: 1 }, // 기사의 힘·활력 + 사제의 정신
    // 이중 내장(기사+사제 결합). 3축으로 분산해 단일 3차(주스탯 8~12)보다 축당 영향은 낮다(파워크립
    //   차단). 합 18 — 프레스티지 게이트(기사 + 사제) 보정.
    jobBonus: { str: 7, vit: 7, spi: 6 },
    unlock: {
      prereqs: {
        paladin: TIER3_UNLOCK_CUMLEVEL, // 기사(전사 3차) — 첫 키 = 저장 class(전사)의 직업
        acolyte: TIER3_UNLOCK_CUMLEVEL, // 사제(마법 2차)
      },
    },
  },
  // 하이브리드 2호 마검사 — 기사(전사 3차) + 마도사(마법 3차). 검(str)+마법(int) 이중 딜러.
  //   성기사와 동일 구조(직업별 jobCumLevel 게이트). 둘 다 3차라 기사·마도사를 각각 TIER3 키워야.
  spellblade: {
    id: "spellblade",
    name: "마검사",
    tier: 3,
    cultivateProfile: { str: 2, int: 2 }, // 검(str) + 마법(int)
    // 이중 내장(검+마법) 합 20 — 성기사(하이브리드, 합 18)와 정렬 + 이중 공격축(str·int 둘 다 오펜스)
    //   분산 세금 보상. 두 축에 다 투자해야 양쪽 딜이 살아 자연 throttle(파워크립 차단). 오너 결정
    //   2026-06-20(STR+10·INT+10): 단일 3차(합 16)·성기사(합 18)보다 +프리미엄(더 어려운 해금·2오펜스축).
    jobBonus: { str: 10, int: 10 },
    unlock: {
      prereqs: {
        paladin: TIER3_UNLOCK_CUMLEVEL, // 기사(전사 3차) — 첫 키 = 저장 class(전사)의 직업
        magus: TIER3_UNLOCK_CUMLEVEL, // 마도사(마법 3차)
      },
    },
  },
  bloodtemplar: {
    id: "bloodtemplar",
    name: "혈성기사",
    tier: 3,
    cultivateProfile: { str: 2, vit: 1, spi: 1 },
    jobBonus: { str: 9, vit: 6, spi: 5 }, // 광전사+사제 — HP 소모·자힐 탱딜
    unlock: {
      prereqs: {
        berserker: TIER3_UNLOCK_CUMLEVEL, // 광전사(전사 3차) — 첫 키 = 저장 class(전사)
        acolyte: TIER3_UNLOCK_CUMLEVEL, // 사제(마법 2차)
      },
    },
  },
  darkpriest: {
    id: "darkpriest",
    name: "암흑사제",
    tier: 3,
    cultivateProfile: { luk: 2, spi: 1, int: 1 },
    jobBonus: { luk: 9, spi: 6, int: 5 }, // 그림자+사제 — 처형·흡수·회복 강화
    unlock: {
      prereqs: {
        shadow: TIER3_UNLOCK_CUMLEVEL, // 그림자(도적 3차) — 첫 키 = 저장 class(도적)
        acolyte: TIER3_UNLOCK_CUMLEVEL, // 사제(마법 2차)
      },
    },
  },

  // ─── Tier 4: 심화 직업 — 🔑 계보 게이팅: 바로 아래 3차 직업의 jobCumLevel ≥ TIER4_UNLOCK_CUMLEVEL ───
  //   (기사→정예 기사·마도사→대마법사/원소술사·궁사→신궁 …). 직군당 1종(마법만 2종, 둘 다 마도사 계보).
  //   이중 내장 보너스 + 액티브 1(강) + 패시브. 새 derive 배선 없음 — 기존 효과 어휘 재사용.
  veteran: {
    id: "veteran",
    name: "정예 기사",
    tier: 4,
    cultivateProfile: { str: 2, vit: 1, dex: 1 },
    jobBonus: { str: 11, vit: 11 }, // 전사 심화(기사 라인 정점)
    unlock: { prereqs: { paladin: TIER4_UNLOCK_CUMLEVEL } }, // 기사 계보
  },
  sensei: {
    id: "sensei",
    name: "권룡",
    tier: 4,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 15, dex: 7, vit: 4 }, // 권룡 — 회피 연격 딜러 정점
    unlock: { prereqs: { brawler: TIER4_UNLOCK_CUMLEVEL } }, // 격투가 계보
  },
  sage: {
    id: "sage",
    name: "대마법사",
    tier: 4,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 15, spi: 7 }, // 마법 심화(마도사 라인 정점)
    unlock: { prereqs: { magus: TIER4_UNLOCK_CUMLEVEL } }, // 마도사 계보
  },
  // 마법 직군 4차 두 번째 갈래 — 대마법사와 같은 마도사 계보(magus jobCumLevel TIER4). 속성 마법 특화.
  //   액티브가 캐릭터 속성에 따라 효과 분기(속성 마법)·패시브=원소 통달(상성 양방향 강화).
  elementalist: {
    id: "elementalist",
    name: "원소술사",
    tier: 4,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 15, spi: 7 }, // 마법 심화(속성 라인) — 대마법사와 동급
    unlock: { prereqs: { magus: TIER4_UNLOCK_CUMLEVEL } }, // 마도사 계보
  },
  runecaster: {
    id: "runecaster",
    name: "문장술사",
    tier: 4,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 14, spi: 8 }, // 마법 심화(문장 라인) — 저차 패시브 장착 보상
    unlock: { prereqs: { magus: TIER4_UNLOCK_CUMLEVEL } }, // 마도사 계보
  },
  archshaman: {
    id: "archshaman",
    name: "대주술사",
    tier: 4,
    cultivateProfile: { int: 2, spi: 1, luk: 1 },
    jobBonus: { int: 17, spi: 4, luk: 3 }, // 마법 심화(주술사 계승) — 취약 누적·폭발
    unlock: { prereqs: { shaman: TIER4_UNLOCK_CUMLEVEL } }, // 주술사 계보
  },
  archbishop: {
    id: "archbishop",
    name: "주교",
    tier: 4,
    cultivateProfile: { spi: 2, int: 1, vit: 1 },
    jobBonus: { spi: 15, vit: 5, int: 2 }, // 사제 심화(대사제 계승) — 낮은 회복 + 보호 축
    unlock: { prereqs: { bishop: TIER4_UNLOCK_CUMLEVEL } }, // 대사제 계보
  },
  chief: {
    id: "chief",
    name: "신궁",
    tier: 4,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 15, luk: 7 }, // 도적 심화(궁술 라인 정점)
    unlock: { prereqs: { ranger: TIER4_UNLOCK_CUMLEVEL } }, // 궁사 계보
  },
  // 전사 직군 4차 두 번째 갈래 — 가디언(전사 3차 두 번째 갈래) 계승. 방어 탱 정점.
  //   액티브=보호막(생존), 패시브=피격 시 방어력만큼 반사(방어=딜 전환). 가디언 jobCumLevel TIER4 해금.
  warden: {
    id: "warden",
    name: "수호자",
    tier: 4,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 15, str: 7 }, // 전사 심화(가디언 계승) — 방어 탱 라인 정점
    unlock: { prereqs: { guardian: TIER4_UNLOCK_CUMLEVEL } }, // 가디언 계보
  },
  warlord: {
    id: "warlord",
    name: "광왕",
    tier: 4,
    cultivateProfile: { str: 2, vit: 1, luk: 1 },
    jobBonus: { str: 17, vit: 5 }, // 전사 심화(광전사 계승) — HP를 걸고 밀어붙이는 딜 정점
    unlock: { prereqs: { berserker: TIER4_UNLOCK_CUMLEVEL } }, // 광전사 계보
  },
  // 도적 직군 4차 두 번째 갈래 — 그림자 계보(자객→그림자 행운/크리 라인의 정점). 신궁(궁술·DEX)과
  //   같은 도적 4차지만 축이 다르다: 신궁=DEX 정조준, 암살자=LUK 행운/기습. 액티브 "기습"은 처형의
  //   역(풀피 적에게 큰 오프너)·패시브 "은신"은 회피(은신 정체성).
  phantom: {
    id: "phantom",
    name: "암살자",
    tier: 4,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 15, dex: 7 }, // 도적 심화(암살 라인 정점) — 행운 중심(신궁의 DEX 거울상)
    unlock: { prereqs: { shadow: TIER4_UNLOCK_CUMLEVEL } }, // 그림자 계보
  },
  venomlord: {
    id: "venomlord",
    name: "독왕",
    tier: 4,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 15, dex: 7 }, // 도적 심화(독술 라인 정점) — 조건부 부식·중독 폭발
    unlock: { prereqs: { venomancer: TIER4_UNLOCK_CUMLEVEL } }, // 맹독술사 계보
  },
  // 무도 직군 4차 두 번째 갈래 — 무승(무도 3차 두 번째 갈래·수도승 계승) 계보. 권룡(격투가 라인)과
  //   같은 무도 4차지만 정체성이 다르다: 권룡=회피·연격(보법·권룡연파), 투승=순수 탱(강건·반격·철신).
  //   무승 jobCumLevel TIER4 해금. 옛 절정 탱 킷(반격+철신)을 상속.
  battlemonk: {
    id: "battlemonk",
    name: "투승",
    tier: 4,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: { vit: 15, spi: 7 }, // 무도 심화(무승 계승) — 탱 라인 정점(권룡과 동급·spi/str 갈래 차이)
    unlock: { prereqs: { warmonk: TIER4_UNLOCK_CUMLEVEL } }, // 무승 계보
  },
  rescueexpert: {
    id: "rescueexpert",
    name: "구조 전문가",
    tier: 4,
    cultivateProfile: { vit: 2, spi: 1, int: 1 },
    jobBonus: { spi: 12, vit: 10 },
    unlock: { prereqs: { fieldmedic: TIER4_UNLOCK_CUMLEVEL } },
  },
  returner: {
    id: "returner",
    name: "불굴의 생환자",
    tier: 4,
    cultivateProfile: { vit: 2, str: 1, luk: 1 },
    jobBonus: { vit: 17, str: 5 },
    unlock: { prereqs: { extremesurvivor: TIER4_UNLOCK_CUMLEVEL } },
  },
  masterangler: {
    id: "masterangler",
    name: "강태공",
    tier: 4,
    cultivateProfile: { luk: 2, spi: 1, vit: 1 },
    jobBonus: { luk: 15, spi: 7 },
    unlock: { prereqs: { angler: TIER4_UNLOCK_CUMLEVEL } },
  },
  crusader: {
    id: "crusader",
    name: "성전사",
    tier: 4,
    cultivateProfile: { str: 2, vit: 1, spi: 1 },
    jobBonus: { str: 8, vit: 8, spi: 7 }, // 성기사 심화 — 방어·회복 축을 유지한 탱딜
    unlock: { prereqs: { templar: TIER4_UNLOCK_CUMLEVEL } },
  },
  runeknight: {
    id: "runeknight",
    name: "룬 기사",
    tier: 4,
    cultivateProfile: { str: 2, int: 2 },
    jobBonus: { str: 12, int: 12 }, // 마검사 심화 — 검+마법 이중 공격축 강화
    unlock: { prereqs: { spellblade: TIER4_UNLOCK_CUMLEVEL } },
  },
  crimsontemplar: {
    id: "crimsontemplar",
    name: "진홍성기사",
    tier: 4,
    cultivateProfile: { str: 2, vit: 1, spi: 1 },
    jobBonus: { str: 10, vit: 9, spi: 5 }, // 혈성기사 심화 — 피를 쓰고 회복으로 버티는 탱딜
    unlock: { prereqs: { bloodtemplar: TIER4_UNLOCK_CUMLEVEL } },
  },

  // ─── Tier 5: 상급 심화 직업 — 4차 직업 숙련도 7500 + 도감 요건으로 여는 장기 목표 ───
  swordmaster: {
    id: "swordmaster",
    name: "검호",
    tier: 5,
    cultivateProfile: { str: 2, vit: 1, dex: 1 },
    jobBonus: { str: 18, vit: 8 },
    unlock: { prereqs: { veteran: TIER5_UNLOCK_CUMLEVEL } },
  },
  ironknight: {
    id: "ironknight",
    name: "철벽기사",
    tier: 5,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 18, str: 8 },
    unlock: { prereqs: { warden: TIER5_UNLOCK_CUMLEVEL } },
  },
  overlord: {
    id: "overlord",
    name: "패왕",
    tier: 5,
    cultivateProfile: { str: 2, vit: 1, luk: 1 },
    jobBonus: { str: 22, vit: 4 },
    unlock: { prereqs: { warlord: TIER5_UNLOCK_CUMLEVEL } },
  },
  arcanist: {
    id: "arcanist",
    name: "비전술사",
    tier: 5,
    cultivateProfile: { int: 2, spi: 2 },
    jobBonus: { int: 18, spi: 8 },
    unlock: { prereqs: { sage: TIER5_UNLOCK_CUMLEVEL } },
  },
  marksman: {
    id: "marksman",
    name: "명궁",
    tier: 5,
    cultivateProfile: { dex: 2, luk: 2 },
    jobBonus: { dex: 18, luk: 8 },
    unlock: { prereqs: { chief: TIER5_UNLOCK_CUMLEVEL } },
  },
  nightshade: {
    id: "nightshade",
    name: "밤그림자",
    tier: 5,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 18, dex: 8 },
    unlock: { prereqs: { phantom: TIER5_UNLOCK_CUMLEVEL } },
  },
  saint: {
    id: "saint",
    name: "성자",
    tier: 5,
    cultivateProfile: { spi: 2, int: 1, vit: 1 },
    jobBonus: { spi: 18, vit: 6, int: 2 },
    unlock: { prereqs: { archbishop: TIER5_UNLOCK_CUMLEVEL } },
  },
  plaguebringer: {
    id: "plaguebringer",
    name: "역병 군주",
    tier: 5,
    cultivateProfile: { luk: 2, dex: 2 },
    jobBonus: { luk: 19, dex: 7 },
    unlock: { prereqs: { venomlord: TIER5_UNLOCK_CUMLEVEL } },
  },
  dragonfist: {
    id: "dragonfist",
    name: "권황",
    tier: 5,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 20, dex: 6, vit: 4 },
    unlock: { prereqs: { sensei: TIER5_UNLOCK_CUMLEVEL } },
  },
  adamantmonk: {
    id: "adamantmonk",
    name: "금강승",
    tier: 5,
    cultivateProfile: { vit: 2, spi: 1, str: 1 },
    jobBonus: { vit: 20, spi: 6 },
    unlock: { prereqs: { battlemonk: TIER5_UNLOCK_CUMLEVEL } },
  },
  immortal: {
    id: "immortal",
    name: "불멸자",
    tier: 5,
    cultivateProfile: { vit: 2, str: 1, spi: 1 },
    jobBonus: { vit: 22, str: 4 },
    unlock: { prereqs: { returner: TIER5_UNLOCK_CUMLEVEL } },
  },
  transcendent: {
    id: "transcendent",
    name: "초월자",
    tier: 5,
    cultivateProfile: { str: 1, vit: 1, dex: 1, int: 1, spi: 1, luk: 1 },
    jobBonus: { str: 4, vit: 4, dex: 4, int: 4, spi: 4, luk: 4 },
    unlock: {
      prereqs: {
        crusader: TIER5_UNLOCK_CUMLEVEL,
        runeknight: TIER5_UNLOCK_CUMLEVEL,
      },
    },
  },
  bloodlord: {
    id: "bloodlord",
    name: "혈성군주",
    tier: 5,
    cultivateProfile: { str: 2, vit: 1, spi: 1 },
    jobBonus: { str: 13, vit: 9, spi: 4 },
    unlock: { prereqs: { crimsontemplar: TIER5_UNLOCK_CUMLEVEL } },
  },

  // ─── Tier 6: 초월 심화 직업 — 5차 직업 숙련도 기반 엔드 성장 ───
  fortressknight: {
    id: "fortressknight",
    name: "성채기사",
    tier: 6,
    cultivateProfile: { vit: 2, str: 1, dex: 1 },
    jobBonus: { vit: 28, str: 8 },
    unlock: { prereqs: { ironknight: TIER6_UNLOCK_CUMLEVEL } },
  },
  celestialdragon: {
    id: "celestialdragon",
    name: "천룡권성",
    tier: 6,
    cultivateProfile: { str: 2, dex: 1, vit: 1 },
    jobBonus: { str: 27, dex: 9, vit: 4 },
    unlock: { prereqs: { dragonfist: TIER6_UNLOCK_CUMLEVEL } },
  },
};

/** 카탈로그의 모든 직업(정의 순서). */
export const V2_JOB_LIST: V2JobDefinition[] = Object.values(V2_JOB_CATALOG);

/**
 * 카탈로그에 questCompleted 추가조건을 쓰는 직업이 하나라도 있나. false 면 호출부가 quest
 * 세이브를 읽을 필요 없음(현 카탈로그=false → 핫패스 state/codex 에 추가 쿼리 0). 미래 직업이
 * questCompleted 를 다는 순간 자동 true → 호출부가 ctx.completedQuestIds 를 로드.
 */
export const CATALOG_USES_QUEST_CONDITION: boolean = V2_JOB_LIST.some((job) =>
  (job.unlock.extraConditions ?? []).some((c) => c.type === "questCompleted"),
);

/** id → 정의 조회(없으면 undefined). */
export function jobById(id: string): V2JobDefinition | undefined {
  return V2_JOB_CATALOG[id];
}

/**
 * 카탈로그 직업이 현재 숙련도로 해금됐는지 — cumLevel prereqs + extraConditions(stat/quest/kill)
 * 둘 다 검사(#818). 현 카탈로그 직업은 extraConditions 가 비어 prereqs 만 실질 작동.
 */
// 추가 조건 1개 충족 여부(순수). statThreshold=proficiency 만으로, quest/kill=ctx 필요(없으면 미충족).
function extraConditionMet(
  cond: ExtraJobCondition,
  proficiency: V2ProficiencyState,
  ctx: JobUnlockContext | undefined,
): boolean {
  switch (cond.type) {
    case "statThreshold":
      // 그 스탯의 cultivation cap(투자 천장) — 장비/버프 무관·안정적 해금 게이트.
      return (proficiency.caps[cond.stat] ?? 0) >= cond.min;
    case "questCompleted":
      return ctx?.completedQuestIds?.has(cond.questId) ?? false;
    case "monsterKilled":
      return (ctx?.killCounts?.[cond.monsterId] ?? 0) >= cond.minCount;
  }
}

export function isJobUnlocked(
  job: V2JobDefinition,
  proficiency: V2ProficiencyState,
  ctx?: JobUnlockContext,
): boolean {
  for (const [prereqJobId, minCumLevel] of Object.entries(job.unlock.prereqs)) {
    // 직군 키(tier-1 직업 id, 예: warrior)=직군 숙련도(groups.cumLevel). 특정 상위 직업
    //   키(예: paladin·acolyte)=직업별 숙련도(jobCumLevel·하이브리드 게이트). prereq 키의 tier 로 분기.
    const prereqTier = V2_JOB_CATALOG[prereqJobId]?.tier ?? 1;
    const actual =
      prereqTier <= 1
        ? (proficiency.groups[prereqJobId]?.cumLevel ?? 0)
        : (proficiency.jobCumLevel?.[prereqJobId] ?? 0);
    if (actual < (minCumLevel ?? 0)) return false;
  }
  // 추가 조건(quest/stat/kill) — 카탈로그 직업은 아직 미사용이라 현행 직업엔 무영향(빈 배열).
  for (const cond of job.unlock.extraConditions ?? []) {
    if (!extraConditionMet(cond, proficiency, ctx)) return false;
  }
  return true;
}

// 직업 해금 조건 텍스트(공유 — 전직 화면·직업 도감). 기본 직업=Lv 캡 달성, 상위/하이브리드=부모 숙련도 임계.
//   예: "Lv 100 달성" / "사제 숙련도 1800" / "기사 숙련도 1800, 사제 숙련도 1800"(하이브리드).
export function jobUnlockConditionText(job: V2JobDefinition): string {
  const prereqs = Object.entries(job.unlock.prereqs);
  if (prereqs.length === 0) return `Lv ${V2_LEVEL_CAP} 달성`;
  return prereqs
    .map(([pid, lv]) => `${V2_JOB_CATALOG[pid]?.name ?? pid} 숙련도 ${lv ?? 0}`)
    .join(", ");
}

// 그 직업에 쌓은 숙련도(표시용) — tier1 직업=직군 숙련도(groups), tier2+=직업별 숙련도(jobCumLevel).
//   isJobUnlocked 의 prereq 분기와 같은 기준. 미적립=0.
export function cumLevelForJob(
  prof: V2ProficiencyState,
  job: V2JobDefinition,
): number {
  return job.tier <= 1
    ? (prof.groups[job.id]?.cumLevel ?? 0)
    : (prof.jobCumLevel?.[job.id] ?? 0);
}

const V2_FISHING_JOB_IDS = new Set(["fisher", "angler", "masterangler"]);

export function isFishingJobId(jobId: string): boolean {
  return V2_FISHING_JOB_IDS.has(jobId);
}

export function isRootJobSelectable(job: V2JobDefinition): boolean {
  return job.tier > 0 || job.id === "none" || job.id === "survivor";
}

/** 현재 숙련도로 전직 가능한 직업 목록(전직 UI 용). */
export function unlockedJobs(
  proficiency: V2ProficiencyState,
  ctx?: JobUnlockContext,
): V2JobDefinition[] {
  return V2_JOB_LIST.filter(
    (job) => isRootJobSelectable(job) && isJobUnlocked(job, proficiency, ctx),
  );
}

/**
 * 전환 브리지 — 새 직업 id → 옛 (class, specChoice) 저장쌍.
 * 새 카탈로그로 해금 게이트(isJobUnlocked)는 하되, 세이브와 스킬 체인
 * (elementalSkillsForClass)은 PR-5 마이그레이션 전까지 옛 class+specChoice 모델을 그대로
 * 쓰므로 그 변환을 담는다. 옛 spec id 들은 specChoice 브리지 토큰으로만 쓰여 기존 write
 * 경로가 그대로 처리한다. PR-5(마이그레이션)에서 제거 대상.
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
  survivor: { class: "survivor", spec: null },
  camper: { class: "survivor", spec: "camper" },
  ironman: { class: "survivor", spec: "ironman" },
  fisher: { class: "survivor", spec: "fisher" },
  fieldmedic: { class: "survivor", spec: "fieldmedic" },
  extremesurvivor: { class: "survivor", spec: "extremesurvivor" },
  angler: { class: "survivor", spec: "angler" },
  shieldman: { class: "warrior", spec: "knight" },
  squire: { class: "warrior", spec: "gwang" },
  boxer: { class: "martial", spec: "gigong" },
  monk: { class: "martial", spec: "cheolsan" },
  caster: { class: "mage", spec: "arcane" },
  acolyte: { class: "mage", spec: "cleric" },
  assassin: { class: "rogue", spec: "assassin" },
  archer: { class: "rogue", spec: "archery" },
  venomist: { class: "rogue", spec: "venomist" },
  // tier 3 — 새 spec id(옛 계파 아님, 식별 전용). jobIdFromLegacy 가 (class,spec)→jobId 로 왕복.
  paladin: { class: "warrior", spec: "paladin" },
  brawler: { class: "martial", spec: "brawler" },
  magus: { class: "mage", spec: "magus" },
  shaman: { class: "mage", spec: "shaman" },
  ranger: { class: "rogue", spec: "ranger" },
  // tier 3 두 번째 갈래 — 새 unique spec id(= jobId).
  guardian: { class: "warrior", spec: "guardian" },
  berserker: { class: "warrior", spec: "berserker" },
  warmonk: { class: "martial", spec: "warmonk" },
  bishop: { class: "mage", spec: "bishop" },
  shadow: { class: "rogue", spec: "shadow" },
  venomancer: { class: "rogue", spec: "venomancer" },
  // tier 3 하이브리드(전사×마법) — 저장 class=전사(첫 prereq), spec=고유 id. 마법 prereq 은
  //   해금 게이트일 뿐 저장 class 가 아니다(왕복 = jobIdFromLegacy("warrior","templar")→templar).
  templar: { class: "warrior", spec: "templar" },
  // 하이브리드 2호 마검사 — 저장 class=전사(첫 prereq=기사의 직군), spec=고유 id. magus prereq 은
  //   해금 게이트일 뿐 저장 class 아님. 왕복 = jobIdFromLegacy("warrior","spellblade")→spellblade.
  spellblade: { class: "warrior", spec: "spellblade" },
  bloodtemplar: { class: "warrior", spec: "bloodtemplar" }, // 광전사×사제 하이브리드
  darkpriest: { class: "rogue", spec: "darkpriest" }, // 그림자×사제 하이브리드
  // tier 4 — 새 unique spec id.
  veteran: { class: "warrior", spec: "veteran" },
  sensei: { class: "martial", spec: "sensei" },
  sage: { class: "mage", spec: "sage" },
  elementalist: { class: "mage", spec: "elementalist" }, // 마법 4차 두 번째 갈래(속성 마법)
  runecaster: { class: "mage", spec: "runecaster" }, // 마법 4차 세 번째 갈래(문장 시너지)
  archshaman: { class: "mage", spec: "archshaman" }, // 마법 4차 네 번째 갈래(주술사 계승·마법취약)
  archbishop: { class: "mage", spec: "archbishop" }, // 마법 4차 다섯 번째 갈래(대사제 계승·성직자)
  chief: { class: "rogue", spec: "chief" },
  warden: { class: "warrior", spec: "warden" }, // 전사 4차 두 번째 갈래(가디언 계승·방어 탱)
  warlord: { class: "warrior", spec: "warlord" }, // 전사 4차 세 번째 갈래(광전사 계승·저HP 딜)
  phantom: { class: "rogue", spec: "phantom" }, // 도적 4차 두 번째 갈래(그림자 계보·기습)
  venomlord: { class: "rogue", spec: "venomlord" }, // 도적 4차 세 번째 갈래(독술 계보·부식)
  battlemonk: { class: "martial", spec: "battlemonk" }, // 무도 4차 두 번째 갈래(무승 계승·탱)
  rescueexpert: { class: "survivor", spec: "rescueexpert" },
  returner: { class: "survivor", spec: "returner" },
  masterangler: { class: "survivor", spec: "masterangler" },
  crusader: { class: "warrior", spec: "crusader" }, // 성기사 4차 — 저장 class=전사, spec=고유 id
  runeknight: { class: "warrior", spec: "runeknight" }, // 마검사 4차 — 저장 class=전사, spec=고유 id
  crimsontemplar: { class: "warrior", spec: "crimsontemplar" }, // 혈성기사 4차 — 피와 회복의 탱딜
  // tier 5 — 핵심 5개 상급 심화 직업.
  swordmaster: { class: "warrior", spec: "swordmaster" },
  ironknight: { class: "warrior", spec: "ironknight" },
  overlord: { class: "warrior", spec: "overlord" },
  arcanist: { class: "mage", spec: "arcanist" },
  marksman: { class: "rogue", spec: "marksman" },
  nightshade: { class: "rogue", spec: "nightshade" },
  saint: { class: "mage", spec: "saint" },
  plaguebringer: { class: "rogue", spec: "plaguebringer" },
  dragonfist: { class: "martial", spec: "dragonfist" },
  adamantmonk: { class: "martial", spec: "adamantmonk" },
  immortal: { class: "survivor", spec: "immortal" },
  transcendent: { class: "warrior", spec: "transcendent" },
  bloodlord: { class: "warrior", spec: "bloodlord" },
  // tier 6 — 5차 직업 계승.
  fortressknight: { class: "warrior", spec: "fortressknight" },
  celestialdragon: { class: "martial", spec: "celestialdragon" },
};

/**
 * 사라진 옛 계파(상위 3→2 압축에서 흡수) → 같은 직업의 생존 계파 id.
 * PR-5 마이그레이션 — 세이브는 안 건드리고 로드/해석 시점에만 정규화한다(브리지 영구 유지·
 * 저위험). 예: 검투사(gladiator) 세이브 → 견습 기사(squire) 로 해석. 흡수 매핑은 docs §7.
 */
export const DROPPED_SPEC_TO_SURVIVING: Record<string, string> = {
  gladiator: "gwang", // 검투사 → 견습 기사
  yeonhwan: "gigong", // 연환 → 권사
  battlemage: "arcane", // 워메이지 → 술사
  venom: "assassin", // 독사 → 자객
};

/**
 * 역브리지 — 옛 (class, specChoice) → 새 직업 id. 현재 직업 식별/표시용(전직 UI·derive).
 * LEGACY_CLASS_SPEC_BY_JOB 의 역. 사라진 계파는 DROPPED_SPEC_TO_SURVIVING 으로 정규화 후
 * 조회(세이브 불변). 그래도 못 찾으면 base class id 폴백(알 수 없는 옛 id·none). 브리지 영구 유지.
 */
export function jobIdFromLegacy(cls: string, spec: string | null): string {
  // 사라진 계파는 흡수처 생존 계파로 정규화(세이브 불변, 해석 시점만).
  const normSpec =
    spec != null ? (DROPPED_SPEC_TO_SURVIVING[spec] ?? spec) : null;
  for (const [jobId, m] of Object.entries(LEGACY_CLASS_SPEC_BY_JOB)) {
    if (m.class === cls && m.spec === normSpec) return jobId;
  }
  return cls; // 폴백 — 기본 직업 id(또는 none)
}
