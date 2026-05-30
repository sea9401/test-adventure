// v2 직업(class) 시스템 (전투 재설계 PR-1 수직 슬라이스). 설계: docs/v2-combat-redesign.md §5.
//
// 6 직업군(검·체·마·신·궁·인술)이 6 1차 스탯에 1:1 대응하는 게 최종 그림이나,
// PR-1 은 "검사(검술·STR)" 1직업만 구현해 정체성 루프를 검증한다(과도 확장 금지).
// 직업이 주는 것: ① 앵커 스탯 보정 ② 전용 스킬(선택 시 자동 학습). 전직/비용전직은 PR-6+.

import type { StatKey } from "@/adventure/data/stats";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";

export const V2_CLASSES = ["none", "swordsman"] as const;
export type V2Class = (typeof V2_CLASSES)[number];

export type V2ClassDef = {
  id: V2Class;
  /** 화면 표기명. */
  name: string;
  /** 직업군 (검술/체술/…). */
  group: string;
  /** 주 스탯 — 직업별 보정 대상. */
  anchorStat: StatKey;
  /** 앵커 스탯 보정 %. 0 = 무보정(none). */
  statBonusPct: number;
  /** 전용 스킬 — 이 직업 선택 시 자동 학습, 타 직업은 학습 불가(requireClass 게이트). */
  signatureSkill?: V2SkillId;
  description: string;
};

export const V2_CLASS_DEFS: Record<V2Class, V2ClassDef> = {
  none: {
    id: "none",
    name: "무직",
    group: "-",
    anchorStat: "str",
    statBonusPct: 0,
    description: "직업 미선택.",
  },
  swordsman: {
    id: "swordsman",
    name: "검사",
    group: "검술",
    anchorStat: "str",
    statBonusPct: 10,
    signatureSkill: "v2_skill_blade_dance",
    description: "검술 계열. 힘(STR) 기반 물리 근접 전투. 전용 스킬 검무.",
  },
};

// 플레이어가 선택 가능한 직업 (none 제외 — "직업 선택"이 정체성).
export const V2_SELECTABLE_CLASSES: readonly V2Class[] = V2_CLASSES.filter(
  (c) => c !== "none",
);

export function parseV2Class(raw: unknown): V2Class {
  return typeof raw === "string" &&
    (V2_CLASSES as readonly string[]).includes(raw)
    ? (raw as V2Class)
    : "none";
}

export function v2ClassDef(c: V2Class): V2ClassDef {
  return V2_CLASS_DEFS[c] ?? V2_CLASS_DEFS.none;
}
