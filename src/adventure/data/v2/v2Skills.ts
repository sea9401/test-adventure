// v2 스킬 시스템 — 카탈로그 + 타입 + 슬롯/파싱 헬퍼.
//
// 디자인 (2026-05-28 사용자 spec):
// - 6개 스탯 (STR/DEX/VIT/SPD/LUK/INT) 통일된 액티브 스킬 시스템.
// - MP 단일 자원, MP 비용 + 쿨다운 이중 게이트.
// - 4 카테고리: 공격/회복/버프/디버프 (복합 효과 가능).
// - 학습 = 교관 NPC 골드 구매 (영구 인벤토리), 장착 = 슬롯 (Lv 33렙당 +1, 1→100 = 3→6).
// - 자동 발동 우선순위 = equipped 배열 순서.
// - 수치는 의도적으로 낮게 시작 — 성장 요소 후속 PR.
//
// 이 모듈은 카탈로그/타입/파싱 헬퍼만 — DB/UI/전투 wiring 은 후속 PR.

import type { StatKey } from "@/adventure/data/stats";

export type V2SkillCategory = "attack" | "heal" | "buff" | "debuff";

// 스킬 카탈로그 id — union 으로 컴파일타임 검증.
export type V2SkillId =
  // ── 스타터 (Lv1 자동 보유) ────────────────────────────────────────
  | "v2_skill_strike" // STR 강타
  | "v2_skill_flurry" // DEX 연격
  | "v2_skill_recover" // VIT 회복
  | "v2_skill_dash" // SPD 질주
  | "v2_skill_fortune" // LUK 행운
  | "v2_skill_meditate"; // INT 명상

// 스킬 효과 — 복합 가능 (효과 배열에 여러 개).
// 단위 규칙: pct·pctMaxHp 는 "정수 퍼센트 단위" (10 = 10%). 후속 전투 wiring 에서
// 0.10 으로 오해 금지. damage 의 statCoef 는 배율 (1.0 = 1×stat).
export type V2SkillEffect =
  | { kind: "damage"; statCoef: number; baseFlat?: number }
  | { kind: "heal"; pctMaxHp?: number; flat?: number }
  | { kind: "selfBuff"; stat: StatKey; pct: number; turns: number }
  | { kind: "enemyDebuff"; stat: StatKey; pct: number; turns: number };

// 학습 조건 — 교관 화면에서 사용. 충족 안 되면 구매 차단.
export type V2SkillLearnRequirement = {
  goldCost: number;
  level?: number;
  stat?: { key: StatKey; min: number };
  /** 선행 스킬 — 모두 학습 보유해야. */
  prereqSkillIds?: readonly V2SkillId[];
};

export type V2SkillDefinition = {
  id: V2SkillId;
  name: string;
  /** 분류 메타데이터 — 교관 NPC 그룹화 + 데미지 스케일링 기본 stat. selfBuff/enemyDebuff
   *  effect 는 자체 stat 필드를 가지므로 그쪽은 이 값과 무관. */
  stat: StatKey;
  category: V2SkillCategory;
  /** 1=입문 (스타터), 2=중급, 3=상급. 카탈로그 정렬·교관 화면 그룹화. */
  tier: 1 | 2 | 3;
  description: string;
  mpCost: number;
  /** 발동 후 N턴 동안 재발동 불가. 0 = 매 턴 가능. */
  cooldown: number;
  effects: readonly V2SkillEffect[];
  /** 스타터 (자동 보유) 는 learn 미사용. tier>=2 부터 교관 구매. */
  learn?: V2SkillLearnRequirement;
};

// === 카탈로그 — 스타터 6종 (Tier 1) ──────────────────────────────────
// 수치는 의도적으로 낮게 (사용자 spec "성장형 느낌"). 후속 PR 에서 강화 요소 도입.

export const V2_SKILLS: Record<V2SkillId, V2SkillDefinition> = {
  v2_skill_strike: {
    id: "v2_skill_strike",
    name: "강타",
    stat: "str",
    category: "attack",
    tier: 1,
    description: "힘을 실어 적에게 추가 피해를 준다.",
    mpCost: 30,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.0 }],
  },
  v2_skill_flurry: {
    id: "v2_skill_flurry",
    name: "연격",
    stat: "dex",
    category: "attack",
    tier: 1,
    description: "빠르게 빈틈을 찔러 추가 피해를 준다.",
    mpCost: 25,
    cooldown: 2,
    effects: [{ kind: "damage", statCoef: 0.85 }],
  },
  v2_skill_recover: {
    id: "v2_skill_recover",
    name: "회복",
    stat: "vit",
    category: "heal",
    tier: 1,
    description: "전투 중 자신의 HP 를 조금 회복한다.",
    mpCost: 35,
    cooldown: 4,
    effects: [{ kind: "heal", pctMaxHp: 10 }],
  },
  v2_skill_dash: {
    id: "v2_skill_dash",
    name: "질주",
    stat: "spd",
    category: "buff",
    tier: 1,
    description: "잠시 동안 속도가 오른다.",
    mpCost: 30,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "spd", pct: 10, turns: 3 }],
  },
  v2_skill_fortune: {
    id: "v2_skill_fortune",
    name: "행운",
    stat: "luk",
    category: "buff",
    tier: 1,
    description: "잠시 행운이 올라 좋은 결과를 노린다.",
    mpCost: 30,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "luk", pct: 10, turns: 3 }],
  },
  v2_skill_meditate: {
    id: "v2_skill_meditate",
    name: "명상",
    stat: "int",
    category: "buff",
    tier: 1,
    description: "정신을 가다듬어 지능이 오른다.",
    mpCost: 30,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "int", pct: 10, turns: 3 }],
  },
};

// 모든 스타터 id — PR-2 스타터 지급/백필에서 사용.
export const V2_STARTER_SKILL_IDS: readonly V2SkillId[] = [
  "v2_skill_strike",
  "v2_skill_flurry",
  "v2_skill_recover",
  "v2_skill_dash",
  "v2_skill_fortune",
  "v2_skill_meditate",
] as const;

const VALID_SKILL_IDS: ReadonlySet<string> = new Set(Object.keys(V2_SKILLS));

// === 슬롯 수 ─────────────────────────────────────────────────────────
// 균등 33렙당 +1. Lv1-33: 3, Lv34-66: 4, Lv67-99: 5, Lv100: 6.
// v2 전용 — 기존 라이브 skillLayout 재사용 폐기 (별 곡선).
export function v2SkillSlotsForLevel(level: number): number {
  if (level >= 100) return 6;
  if (level >= 67) return 5;
  if (level >= 34) return 4;
  return 3;
}

// === 저장 형태 ───────────────────────────────────────────────────────
// saves_kv 키 "skills.v2" — 서버 권위 (equipment.v2 와 동일 패턴, SYNCED_KEYS 외).
// 학습: 교관 NPC API 만 변경 가능. 장착: equip API 만 변경 가능.

export type V2SkillsState = {
  /** 학습 보유 스킬 id 목록 (영구, 중복 없음). */
  learned: V2SkillId[];
  /** 슬롯 장착 스킬 id 목록 (배열 순서 = 자동 발동 우선순위, learned 의 부분집합). */
  equipped: V2SkillId[];
};

export function emptyV2SkillsState(): V2SkillsState {
  return { learned: [], equipped: [] };
}

// 손상/누락 raw 도 안전하게 정규화. learned 의 부분집합인 equipped 만 유지하고
// equipped 길이는 caller (호출자가 슬롯 수 알고 있을 때) 잘라야 한다.
export function parseV2SkillsState(raw: unknown): V2SkillsState {
  if (!raw || typeof raw !== "object") return emptyV2SkillsState();
  const r = raw as { learned?: unknown; equipped?: unknown };
  const learned: V2SkillId[] = [];
  const learnedSet = new Set<string>();
  const learnedRaw = Array.isArray(r.learned) ? r.learned : [];
  for (const id of learnedRaw) {
    if (typeof id !== "string" || !VALID_SKILL_IDS.has(id)) continue;
    if (learnedSet.has(id)) continue;
    learnedSet.add(id);
    learned.push(id as V2SkillId);
  }
  const equipped: V2SkillId[] = [];
  const equippedSet = new Set<string>();
  const equippedRaw = Array.isArray(r.equipped) ? r.equipped : [];
  for (const id of equippedRaw) {
    if (typeof id !== "string" || !VALID_SKILL_IDS.has(id)) continue;
    if (equippedSet.has(id)) continue;
    // 장착하려면 학습 보유 필요 (race 보정).
    if (!learnedSet.has(id)) continue;
    equippedSet.add(id);
    equipped.push(id as V2SkillId);
  }
  return { learned, equipped };
}
