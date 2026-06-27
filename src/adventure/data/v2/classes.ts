// v2 직업(class) 시스템. 설계: docs/v2-job-spec-passives-plan.md (P4 — 4직군 압축).
//
// 2026-06-04 P4 재설계 — 6직군 24-class-id 선형 체계 → **4직군(전사/무도가/마법사/도적)**.
//   · class id 는 직업 정체성만(warrior/martial/mage/rogue). 차수(tier)는 id 에서 떼어
//     proficiency.v2.groups[job].tier 로 이동. 전문화(spec)는 별도 축(character.v2.specChoice).
//   · 전직(advance) = class 변경이 아니라 groups[job].tier +1. 갈아타기(respec) = class=다른 job.
//   · 구 24 class id 리매핑은 폐지(DB 초기화 전제) — parseV2Class 는 현재 4직군/none 만 인식.
//   · 구 직업 패시브(v2Passives)는 은퇴 → 전문화 패시브가 대체(derive 가 specChoice 로 적용).
// 직업이 주는 것: ① 권장 앵커 스탯(자유 수행이 강제하진 않음) ② 차수별 앵커 보정(V2_TIER_STAT_BONUS_PCT).

import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";

export const V2_CLASSES = [
  "none",
  // 4직군 ───────────────────────────────────────────
  "warrior", // 전사 (구 검술)
  "martial", // 무도가 (구 체술)
  "mage", // 마법사 (구 마술 + 신술)
  "rogue", // 도적 (구 궁술 + 인술)
] as const;
export type V2Class = (typeof V2_CLASSES)[number];

export type V2ClassDef = {
  id: V2Class;
  /** 화면 표기명(직군명). */
  name: string;
  /** 직군 분류 표기(= name, 표시 호환). */
  group: string;
  /** 권장 수행 앵커 스탯 — 자유 수행이 강제하진 않되 floor/성장 가중·차수 보정 대상. */
  anchorStat: V2StatKey;
  description: string;
};

// 차수별 앵커 스탯 보정 % — 옛 per-class statBonusPct(t1 10·t2 18·t3 26·t4 35)를 차수 테이블로.
// tier(1~4)로 인덱스. derive 가 proficiency.groups[job].tier 로 조회. none = 보정 없음(guard).
export const V2_TIER_STAT_BONUS_PCT: Record<number, number> = {
  1: 10,
  2: 18,
  3: 26,
  4: 35,
};

// 전직 가능 레벨(차수 공통 최소). 만렙 100 안에 4단계 분산(참고 다이얼 — 실 게이트는
// proficiency.V2_ADVANCE_MIN_LEVEL + advanceCumLevelReq). 호환 위해 export 유지.
export const V2_TIER2_ADVANCE_LEVEL = 30;
export const V2_TIER3_ADVANCE_LEVEL = 50;
export const V2_TIER4_ADVANCE_LEVEL = 70;

// 차수별 전직 모험의 서 요건(재료 도감 등재 종 수) — 옛 per-class advanceCodexMin(t3=3·t4=5).
// 그 차수로 전직할 때 요구. 1·2차 = 요건 없음(undefined).
export const V2_TIER_CODEX_MIN: Record<number, number> = {
  3: 3,
  4: 5,
};

export function tierCodexMin(tier: number): number | undefined {
  return V2_TIER_CODEX_MIN[tier];
}

export const V2_CLASS_DEFS: Record<V2Class, V2ClassDef> = {
  none: {
    id: "none",
    name: "무직",
    group: "-",
    anchorStat: "str",
    description: "직업 미선택.",
  },
  warrior: {
    id: "warrior",
    name: "전사",
    group: "전사",
    anchorStat: "str",
    description:
      "힘(STR) 기반 물리 근접. 전문화에 따라 극딜(광검류)·방어 반격(철벽검류)·속도 출혈(혈풍검류)로 갈린다.",
  },
  martial: {
    id: "martial",
    name: "무도가",
    group: "무도가",
    anchorStat: "vit",
    description: "활력(VIT) 기반 맨몸 근접. 맷집과 흡혈·연타로 버티며 싸운다.",
  },
  mage: {
    id: "mage",
    name: "마법사",
    group: "마법사",
    anchorStat: "int",
    description:
      "지능(INT)·정신(SPI) 기반 마법. 공격 마법(INT)과 신성·치유(SPI) 갈래로 나뉜다.",
  },
  rogue: {
    id: "rogue",
    name: "도적",
    group: "도적",
    anchorStat: "dex",
    description:
      "민첩(DEX)·행운(LUK) 기반. 원거리 궁술(DEX)과 치명 암살(LUK) 갈래로 나뉜다.",
  },
};

/**
 * 플레이어에게 보여줄 "현재 직업명" — 캐릭터 카드·전투 부제·전직 화면이 공유한다(단일 해석).
 * 직업 시스템 on 이면 직업 카탈로그 이름(견습 병사·방패병 등, jobIdFromLegacy 로 (class,spec)→
 * jobId 해석, 상위 직업 반영), 카탈로그 미존재/직업 시스템 off 면 옛 직군명(전사 등)·모험가 폴백.
 * core-loop off 시 null 표기 여부는 호출부가 결정(여기선 항상 문자열).
 */
export function jobDisplayName(cls: V2Class, spec: string | null): string {
  const name = V2_JOB_CATALOG[jobIdFromLegacy(cls, spec)]?.name;
  if (name) return name;
  return cls === "none" ? "모험가" : (V2_CLASS_DEFS[cls]?.name ?? "모험가");
}

// 플레이어가 직접 선택할 수 있는 직업 = 4직군(none 제외).
export const V2_SELECTABLE_CLASSES: readonly V2Class[] = V2_CLASSES.filter(
  (c) => c !== "none",
);

export function parseV2Class(raw: unknown): V2Class {
  if (typeof raw !== "string") return "none";
  if ((V2_CLASSES as readonly string[]).includes(raw)) return raw as V2Class;
  // 알 수 없는 값(옛 24-class id 포함, DB 초기화로 더는 존재 안 함) = none.
  return "none";
}

export function v2ClassDef(c: V2Class): V2ClassDef {
  return V2_CLASS_DEFS[c] ?? V2_CLASS_DEFS.none;
}

// 직업의 숙련도 그룹 키 — 4직군에선 class id 자체가 그룹. none 은 none.
// (옛 체계의 tier1ClassOf 자리 — 이름 유지해 그룹키 추출 호출부 전부 유효.)
export function tier1ClassOf(c: V2Class): V2Class {
  return c === "none" ? "none" : c;
}

// 현재 차수에서 전직 가능한 다음 차수(2/3/4). 정점(4)·없음이면 null.
// 전직은 class 를 바꾸지 않고 proficiency.groups[job].tier 를 이 값으로 올린다.
export function nextAdvanceTier(curTier: number): 2 | 3 | 4 | null {
  const t = Math.floor(curTier);
  if (t < 1) return 2;
  if (t === 1) return 2;
  if (t === 2) return 3;
  if (t === 3) return 4;
  return null;
}

// 학습/장착 가능 스킬 풀 — jobId 기준 시그니처 스킬셋(직업 킷). 차수 게이팅 없음.
// 함수명 elementalSkillsForClass 는 호출부(라우트 5곳) 호환 위해 유지(레거시 명칭). 호출부는 raw
// specChoice 문자열을 넘기면 jobIdFromLegacy 가 (class,spec)→jobId 로 해석한다. 3번째 인자
// (옛 차수)는 더는 쓰지 않지만 호출부 시그니처 호환 위해 남긴다.
export function elementalSkillsForClass(
  c: V2Class,
  specId?: string | null,
  _specTier?: number,
): V2SkillId[] {
  // 모험가(무직)도 자기 킷(착용형 패시브 2종)을 학습/장착할 수 있다 — 차수 게이트 없이 둘 다.
  if (c === "none") return [...skillsForJob("none")];
  return [...skillsForJob(jobIdFromLegacy(c, specId ?? null))];
}
