// v2 직업(class) 시스템. 설계: docs/v2-combat-redesign.md §5.
//
// PR-6 직업 확장 — 6 직업군(검·체·마·신·궁·인술)이 6 1차 스탯에 1:1 대응.
//   검술=힘 / 체술=활력 / 마술=지능 / 신술=정신 / 궁술=민첩 / 인술=행운.
// 직업이 주는 것: ① 앵커 스탯 +보정 ② 전용 스킬(선택 시 자동 학습, requireClass 게이트).
// 전직은 비용 전직(골드+쿨다운, respec.ts) — 첫 선택 무료, 변경만 비용.

import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  V2_ELEMENTAL_SKILLS_BY_CLASS,
  type V2SkillId,
  type V2ElementalGroupClass,
} from "@/adventure/data/v2/v2Skills";

export const V2_CLASSES = [
  "none",
  // 1차 (직업군별 입문) ─────────────────────────────
  "swordsman",
  "archer",
  "martial",
  "mage",
  "priest",
  "ninja",
  // 2차 (1차에서 레벨+골드 전직, PR-7) ───────────────
  "swordmaster",
  "sharpshooter",
  "grandmaster",
  "archmage",
  "bishop",
  "nightblade",
  // 3차 (2차에서 Lv50+ 전직) ─────────────────────────
  "swordking",
  "bowking",
  "fistemperor",
  "sage",
  "archbishop",
  "shadowlord",
  // 4차 (3차에서 Lv70+ 전직, 직업군 정점) ─────────────
  "swordgod",
  "bowgod",
  "warlord",
  "magus",
  "pope",
  "voidwalker",
] as const;
export type V2Class = (typeof V2_CLASSES)[number];

export type V2ClassDef = {
  id: V2Class;
  /** 화면 표기명. */
  name: string;
  /** 직업군 (검술/체술/…). */
  group: string;
  /** 전직 단계 — 1차(입문)~4차(정점). none 은 1. */
  tier: 1 | 2 | 3 | 4;
  /** 주 스탯 — 직업별 보정 대상. */
  anchorStat: V2StatKey;
  /** 앵커 스탯 보정 %. 0 = 무보정(none). 2차는 더 큼. */
  statBonusPct: number;
  /** 전용 스킬 — 이 직업 선택/전직 시 자동 학습, 타 직업은 학습 불가(requireClass 게이트). */
  signatureSkill?: V2SkillId;
  /** 상위 차수 전용 — 이 직업으로 전직하기 위한 직전 차수 직업. */
  advanceFrom?: V2Class;
  /** 상위 차수 전용 — 전직 가능 최소 레벨. */
  advanceLevel?: number;
  /** 3·4차 전용 — 전직에 필요한 모험의 서(재료 도감) 등재 종 수. 미지정 = 도감 요건 없음. */
  advanceCodexMin?: number;
  description: string;
};

// 전직 가능 레벨 — tier 별 공통(시작값, 다이얼). 만렙 100 안에 4단계 분산.
export const V2_TIER2_ADVANCE_LEVEL = 30;
export const V2_TIER3_ADVANCE_LEVEL = 50;
export const V2_TIER4_ADVANCE_LEVEL = 70;

export const V2_CLASS_DEFS: Record<V2Class, V2ClassDef> = {
  none: {
    id: "none",
    name: "무직",
    group: "-",
    tier: 1,
    anchorStat: "str",
    statBonusPct: 0,
    description: "직업 미선택.",
  },
  // ── 1차 (직업군 입문, 앵커 +10%) ──────────────────────────────────
  swordsman: {
    id: "swordsman",
    name: "견습 검사",
    group: "검술",
    tier: 1,
    anchorStat: "str",
    statBonusPct: 10,
    signatureSkill: "v2_skill_blade_dance",
    description: "검술 계열. 힘(STR) 기반 물리 근접 전투. 전용 스킬 검무.",
  },
  archer: {
    id: "archer",
    name: "견습 궁수",
    group: "궁술",
    tier: 1,
    anchorStat: "dex",
    statBonusPct: 10,
    signatureSkill: "v2_skill_piercing_shot",
    description: "궁술 계열. 민첩(DEX) 기반 원거리 물리. 회피·명중·다중공격. 전용 스킬 관통 사격.",
  },
  martial: {
    id: "martial",
    name: "견습 무도가",
    group: "체술",
    tier: 1,
    anchorStat: "vit",
    statBonusPct: 10,
    signatureSkill: "v2_skill_iron_fist",
    description: "체술 계열. 활력(VIT) 기반 맷집형 근접. 굳건히 버티며 친다. 전용 스킬 철권난타.",
  },
  mage: {
    id: "mage",
    name: "견습 마법사",
    group: "마술",
    tier: 1,
    anchorStat: "int",
    statBonusPct: 10,
    signatureSkill: "v2_skill_arcane_nova",
    description: "마술 계열. 지능(INT) 기반 마법 화력. 마법 공격력으로 버스트. 전용 스킬 비전 폭발.",
  },
  priest: {
    id: "priest",
    name: "견습 사제",
    group: "신술",
    tier: 1,
    anchorStat: "spi",
    statBonusPct: 10,
    signatureSkill: "v2_skill_divine_light",
    description: "신술 계열. 정신(SPI) 기반 회복·마법 방어. 치유와 정화. 전용 스킬 신성한 빛.",
  },
  ninja: {
    id: "ninja",
    name: "견습 인술가",
    group: "인술",
    tier: 1,
    anchorStat: "luk",
    statBonusPct: 10,
    signatureSkill: "v2_skill_shadow_strike",
    description: "인술 계열. 행운(LUK) 기반 치명 일격. 크리티컬로 급소를 노린다. 전용 스킬 그림자 일격.",
  },
  // ── 2차 (1차에서 Lv30+ 골드 전직, 앵커 +18% + 2차 전용 스킬) ──────────
  swordmaster: {
    id: "swordmaster",
    name: "검사",
    group: "검술",
    tier: 2,
    anchorStat: "str",
    statBonusPct: 18,
    signatureSkill: "v2_skill_moonlight_slash",
    advanceFrom: "swordsman",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "검술 2차. 검을 제법 다룬다. 힘 보정이 깊어진다. 전용 스킬 월광검.",
  },
  sharpshooter: {
    id: "sharpshooter",
    name: "궁수",
    group: "궁술",
    tier: 2,
    anchorStat: "dex",
    statBonusPct: 18,
    signatureSkill: "v2_skill_storm_arrows",
    advanceFrom: "archer",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "궁술 2차. 빗나가지 않는 사격. 민첩 보정이 깊어진다. 전용 스킬 폭풍 화살.",
  },
  grandmaster: {
    id: "grandmaster",
    name: "무도가",
    group: "체술",
    tier: 2,
    anchorStat: "vit",
    statBonusPct: 18,
    signatureSkill: "v2_skill_collapsing_fist",
    advanceFrom: "martial",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "체술 2차. 무너지지 않는 몸. 활력 보정이 깊어진다. 전용 스킬 붕권.",
  },
  archmage: {
    id: "archmage",
    name: "마법사",
    group: "마술",
    tier: 2,
    anchorStat: "int",
    statBonusPct: 18,
    signatureSkill: "v2_skill_meteor",
    advanceFrom: "mage",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "마술 2차. 별을 떨구는 화력. 지능 보정이 깊어진다. 전용 스킬 메테오.",
  },
  bishop: {
    id: "bishop",
    name: "사제",
    group: "신술",
    tier: 2,
    anchorStat: "spi",
    statBonusPct: 18,
    signatureSkill: "v2_skill_blessing",
    advanceFrom: "priest",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "신술 2차. 깊은 가호. 정신 보정이 깊어진다. 전용 스킬 축복의 빛.",
  },
  nightblade: {
    id: "nightblade",
    name: "인술가",
    group: "인술",
    tier: 2,
    anchorStat: "luk",
    statBonusPct: 18,
    signatureSkill: "v2_skill_shadow_clones",
    advanceFrom: "ninja",
    advanceLevel: V2_TIER2_ADVANCE_LEVEL,
    description: "인술 2차. 그림자를 부린다. 행운 보정이 깊어진다. 전용 스킬 그림자 분신.",
  },
  // ── 3차 (2차에서 Lv50+ 전직, 앵커 +26% + 3차 전용 스킬) ──────────────
  swordking: {
    id: "swordking",
    name: "검호",
    group: "검술",
    tier: 3,
    anchorStat: "str",
    statBonusPct: 26,
    signatureSkill: "v2_skill_heaven_sword",
    advanceFrom: "swordmaster",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "검술 3차. 검이 손에 익는다. 힘 보정이 한층 깊어진다. 전용 스킬 쾌검.",
  },
  bowking: {
    id: "bowking",
    name: "명궁",
    group: "궁술",
    tier: 3,
    anchorStat: "dex",
    statBonusPct: 26,
    signatureSkill: "v2_skill_sky_volley",
    advanceFrom: "sharpshooter",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "궁술 3차. 좀처럼 빗나가지 않는다. 민첩 보정이 한층 깊어진다. 전용 스킬 연사.",
  },
  fistemperor: {
    id: "fistemperor",
    name: "권사",
    group: "체술",
    tier: 3,
    anchorStat: "vit",
    statBonusPct: 26,
    signatureSkill: "v2_skill_mountain_breaker",
    advanceFrom: "grandmaster",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "체술 3차. 주먹에 무게가 실린다. 활력 보정이 한층 깊어진다. 전용 스킬 붕격.",
  },
  sage: {
    id: "sage",
    name: "마도사",
    group: "마술",
    tier: 3,
    anchorStat: "int",
    statBonusPct: 26,
    signatureSkill: "v2_skill_void_eclipse",
    advanceFrom: "archmage",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "마술 3차. 마력을 더 깊이 다룬다. 지능 보정이 한층 깊어진다. 전용 스킬 공허탄.",
  },
  archbishop: {
    id: "archbishop",
    name: "신관",
    group: "신술",
    tier: 3,
    anchorStat: "spi",
    statBonusPct: 26,
    signatureSkill: "v2_skill_grand_heal",
    advanceFrom: "bishop",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "신술 3차. 가호가 넓어진다. 정신 보정이 한층 깊어진다. 전용 스킬 치유의 빛.",
  },
  shadowlord: {
    id: "shadowlord",
    name: "그림자 자객",
    group: "인술",
    tier: 3,
    anchorStat: "luk",
    statBonusPct: 26,
    signatureSkill: "v2_skill_shadow_swarm",
    advanceFrom: "nightblade",
    advanceLevel: V2_TIER3_ADVANCE_LEVEL,
    advanceCodexMin: 3,
    description: "인술 3차. 그림자를 다루기 시작한다. 행운 보정이 한층 깊어진다. 전용 스킬 암습.",
  },
  // ── 4차 (3차에서 Lv70+ 전직, 직업군 정점, 앵커 +35% + 4차 전용 스킬) ──
  swordgod: {
    id: "swordgod",
    name: "검왕",
    group: "검술",
    tier: 4,
    anchorStat: "str",
    statBonusPct: 35,
    signatureSkill: "v2_skill_infinity_blade",
    advanceFrom: "swordking",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "검술 정점. 검을 제 손발처럼 부린다. 힘 보정이 극에 달한다. 전용 스킬 절검.",
  },
  bowgod: {
    id: "bowgod",
    name: "궁왕",
    group: "궁술",
    tier: 4,
    anchorStat: "dex",
    statBonusPct: 35,
    signatureSkill: "v2_skill_divine_arrow",
    advanceFrom: "bowking",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "궁술 정점. 노린 곳을 반드시 맞힌다. 민첩 보정이 극에 달한다. 전용 스킬 일점사.",
  },
  warlord: {
    id: "warlord",
    name: "권왕",
    group: "체술",
    tier: 4,
    anchorStat: "vit",
    statBonusPct: 35,
    signatureSkill: "v2_skill_titan_collapse",
    advanceFrom: "fistemperor",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "체술 정점. 무너지지 않는 몸과 주먹. 활력 보정이 극에 달한다. 전용 스킬 붕산권.",
  },
  magus: {
    id: "magus",
    name: "현자",
    group: "마술",
    tier: 4,
    anchorStat: "int",
    statBonusPct: 35,
    signatureSkill: "v2_skill_apocalypse_flame",
    advanceFrom: "sage",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "마술 정점. 마력의 이치를 꿰뚫는다. 지능 보정이 극에 달한다. 전용 스킬 업화.",
  },
  pope: {
    id: "pope",
    name: "주교",
    group: "신술",
    tier: 4,
    anchorStat: "spi",
    statBonusPct: 35,
    signatureSkill: "v2_skill_holy_descent",
    advanceFrom: "archbishop",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "신술 정점. 가장 깊은 가호. 정신 보정이 극에 달한다. 전용 스킬 심판의 빛.",
  },
  voidwalker: {
    id: "voidwalker",
    name: "그림자 주인",
    group: "인술",
    tier: 4,
    anchorStat: "luk",
    statBonusPct: 35,
    signatureSkill: "v2_skill_void_assassinate",
    advanceFrom: "shadowlord",
    advanceLevel: V2_TIER4_ADVANCE_LEVEL,
    advanceCodexMin: 5,
    description: "인술 정점. 그림자에서 급소만 끊는다. 행운 보정이 극에 달한다. 전용 스킬 절명.",
  },
};

// 플레이어가 직접 "선택(respec)"할 수 있는 직업 = 1차만 (none·2차 제외).
// 2차는 직접 선택이 아니라 1차에서 전직(advance)으로 도달.
export const V2_SELECTABLE_CLASSES: readonly V2Class[] = V2_CLASSES.filter(
  (c) => c !== "none" && V2_CLASS_DEFS[c].tier === 1,
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

// 직업 c 의 직업군 1차 직업 (advanceFrom 체인을 1차까지 거슬러 올라간다 — 2·3·4차 모두 대응).
// respec 피커가 상위 차수 캐릭의 "현재 직업군"을 1차로 매핑할 때 사용.
export function tier1ClassOf(c: V2Class): V2Class {
  let cur = c;
  // V2_CLASSES.length 만큼만 — 순환/끊긴 체인 안전장치.
  for (let i = 0; i < V2_CLASSES.length; i++) {
    const def = V2_CLASS_DEFS[cur];
    if (def.tier === 1 || !def.advanceFrom) return cur;
    cur = def.advanceFrom;
  }
  return cur;
}

// 직업 c 가 전직 가능한 바로 다음 차수 직업 (advanceFrom === c 인 직업). 없으면 null.
// 1→2→3→4 어느 단계든 다음 단계를 반환. none/정점(4차)은 null.
export function nextTierClassOf(c: V2Class): V2Class | null {
  if (c === "none") return null;
  for (const id of V2_CLASSES) {
    if (V2_CLASS_DEFS[id].advanceFrom === c) return id;
  }
  return null;
}

// 직업군(1차 직업 id) + 차수 → 그 차수의 직업 id. "도달 차수 복귀"(respec)·아이콘 표시용.
// tier 1 = 그 1차 직업 자신. 1~4 밖은 클램프, 체인이 끊기면 마지막 유효 차수.
export function classOfGroupTier(tier1: V2Class, tier: number): V2Class {
  let cur: V2Class = tier1;
  const target = Math.max(1, Math.min(4, Math.floor(tier)));
  for (let t = 1; t < target; t++) {
    const next = nextTierClassOf(cur);
    if (!next) break;
    cur = next;
  }
  return cur;
}

// 1차 직업 c 가 전직 가능한 2차 직업 (없으면 null). c 가 1차가 아니면 null.
// (tier2ClassOf 는 1차→2차 전용 — 테스트/하위호환. 일반 다음차수는 nextTierClassOf.)
export function tier2ClassOf(c: V2Class): V2Class | null {
  if (V2_CLASS_DEFS[c].tier !== 1 || c === "none") return null;
  return nextTierClassOf(c);
}

// 직업 c 가 보유하는 시그니처 스킬 체인 — 직업군 1차부터 c 차수까지 각 단계의 전용 스킬.
// 학습 가능 시그니처 목록(=그 차수 도달분)이자 equipped reconcile 의 기준 체인. none = 빈 배열.
// 시그니처 스킬 id → 그 시그니처를 보유한 직업 (역참조). 차수/학습비용 산출용.
const SIGNATURE_TO_CLASS: Record<string, V2Class> = (() => {
  const m: Record<string, V2Class> = {};
  for (const def of Object.values(V2_CLASS_DEFS)) {
    if (def.signatureSkill) m[def.signatureSkill] = def.id;
  }
  return m;
})();

export function signatureClassOf(skillId: string): V2Class | null {
  return SIGNATURE_TO_CLASS[skillId] ?? null;
}

// 직업군 속성 스킬 풀 — 현 직업의 1차 직업군(검술/궁술/…)에 속한 7속성 스킬 id.
// 시그니처와 별개로 숙련도 학습 가능한 풀. none·매핑 없으면 빈 배열.
export function elementalSkillsForClass(c: V2Class): V2SkillId[] {
  const group = tier1ClassOf(c);
  if (group === "none") return [];
  return V2_ELEMENTAL_SKILLS_BY_CLASS[group as V2ElementalGroupClass] ?? [];
}

export function signaturesForClass(c: V2Class): V2SkillId[] {
  if (c === "none") return [];
  const out: V2SkillId[] = [];
  const targetTier = V2_CLASS_DEFS[c].tier;
  let cur: V2Class | null = tier1ClassOf(c);
  // 1차 → c 까지 nextTierClassOf 로 거슬러 올라가며 각 차수 시그니처 수집 (bounded).
  for (let i = 0; i < V2_CLASSES.length && cur; i++) {
    const def = V2_CLASS_DEFS[cur];
    if (def.tier > targetTier) break;
    if (def.signatureSkill) out.push(def.signatureSkill);
    if (cur === c) break;
    cur = nextTierClassOf(cur);
  }
  return out;
}
