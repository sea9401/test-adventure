// v2 직업(class) 시스템. 설계: docs/v2-combat-redesign.md §5.
//
// PR-6 직업 확장 — 6 직업군(검·체·마·신·궁·인술)이 6 1차 스탯에 1:1 대응.
//   검술=힘 / 체술=활력 / 마술=지능 / 신술=정신 / 궁술=민첩 / 인술=행운.
// 직업이 주는 것: ① 앵커 스탯 +보정 ② 전용 스킬(선택 시 자동 학습, requireClass 게이트).
// 전직은 비용 전직(골드+쿨다운, respec.ts) — 첫 선택 무료, 변경만 비용.

import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";

export const V2_CLASSES = [
  "none",
  "swordsman",
  "archer",
  "martial",
  "mage",
  "priest",
  "ninja",
] as const;
export type V2Class = (typeof V2_CLASSES)[number];

export type V2ClassDef = {
  id: V2Class;
  /** 화면 표기명. */
  name: string;
  /** 직업군 (검술/체술/…). */
  group: string;
  /** 주 스탯 — 직업별 보정 대상. */
  anchorStat: V2StatKey;
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
  archer: {
    id: "archer",
    name: "궁수",
    group: "궁술",
    anchorStat: "dex",
    statBonusPct: 10,
    signatureSkill: "v2_skill_piercing_shot",
    description: "궁술 계열. 민첩(DEX) 기반 원거리 물리. 회피·명중·다중공격. 전용 스킬 관통 사격.",
  },
  martial: {
    id: "martial",
    name: "무도가",
    group: "체술",
    anchorStat: "vit",
    statBonusPct: 10,
    signatureSkill: "v2_skill_iron_fist",
    description: "체술 계열. 활력(VIT) 기반 맷집형 근접. 굳건히 버티며 친다. 전용 스킬 철권난타.",
  },
  mage: {
    id: "mage",
    name: "마법사",
    group: "마술",
    anchorStat: "int",
    statBonusPct: 10,
    signatureSkill: "v2_skill_arcane_nova",
    description: "마술 계열. 지능(INT) 기반 마법 화력. 마법 공격력으로 버스트. 전용 스킬 비전 폭발.",
  },
  priest: {
    id: "priest",
    name: "신관",
    group: "신술",
    anchorStat: "spi",
    statBonusPct: 10,
    signatureSkill: "v2_skill_divine_light",
    description: "신술 계열. 정신(SPI) 기반 회복·마법 방어. 치유와 정화. 전용 스킬 신성한 빛.",
  },
  ninja: {
    id: "ninja",
    name: "인술가",
    group: "인술",
    anchorStat: "luk",
    statBonusPct: 10,
    signatureSkill: "v2_skill_shadow_strike",
    description: "인술 계열. 행운(LUK) 기반 치명 일격. 크리티컬로 급소를 노린다. 전용 스킬 그림자 일격.",
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
