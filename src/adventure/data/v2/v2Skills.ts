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
  // ── Tier 1 스타터 (Lv1 자동 보유) ───────────────────────────────────
  | "v2_skill_strike" // STR 강타
  | "v2_skill_flurry" // DEX 연격
  | "v2_skill_recover" // VIT 회복
  | "v2_skill_dash" // SPD 질주
  | "v2_skill_fortune" // LUK 행운
  | "v2_skill_meditate" // INT 명상
  // ── Tier 2 (교관 학습, PR-3 도입) ─────────────────────────────────
  | "str_cleave_t2" // STR 횡베기
  | "str_crushing_blow_t2" // STR 분쇄 강타
  | "str_intimidating_roar_t2" // STR 위압의 함성
  | "dex_needle_flurry_t2" // DEX 바늘 연격
  | "dex_true_thrust_t2" // DEX 정밀 관통
  | "dex_mirage_step_t2" // DEX 잔영 보법
  | "vit_greater_recover_t2" // VIT 강화 회복
  | "vit_guard_shell_t2" // VIT 철벽 호흡
  | "vit_provoking_shout_t2" // VIT 도발의 외침
  | "spd_first_wind_t2" // SPD 선풍
  | "spd_afterimage_counter_t2" // SPD 역풍 자세
  | "spd_gale_cut_t2" // SPD 질풍 베기
  | "luk_critical_omen_t2" // LUK 치명 예감
  | "luk_curse_mark_t2" // LUK 불길한 표식
  | "luk_death_lottery_t2" // LUK 사신의 제비
  | "int_arcane_bolt_t2" // INT 비전 화살
  | "int_mana_burst_t2" // INT 마력 폭발
  | "int_mind_fog_t2"; // INT 정신 안개

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

  // === Tier 2 — 교관 NPC 학습 (PR-3) ────────────────────────────────
  // 18종 (스탯당 3종). 수치 범위: MP 60-100, CD 3-5, 효과 배율 1.35-1.75.
  // 학습 조건: 골드 1800-2600, 스탯 45-62, 레벨 18-25, 스타터 선행 필요.
  // selfBuff/enemyDebuff 의 pct 는 정수% (16 = 16%).

  // STR — 공격 강화 + 디버프
  str_cleave_t2: {
    id: "str_cleave_t2",
    name: "횡베기",
    stat: "str",
    category: "attack",
    tier: 2,
    description: "무거운 일격을 넓게 휘둘러 적의 전열을 무너뜨린다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "damage", statCoef: 1.45 }],
    learn: {
      goldCost: 1800,
      stat: { key: "str", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_strike"],
    },
  },
  str_crushing_blow_t2: {
    id: "str_crushing_blow_t2",
    name: "분쇄 강타",
    stat: "str",
    category: "attack",
    tier: 2,
    description: "강타의 흐름을 끝까지 밀어붙여 방어 자세를 깨뜨린다.",
    mpCost: 85,
    cooldown: 5,
    effects: [
      { kind: "damage", statCoef: 1.65 },
      { kind: "enemyDebuff", stat: "vit", pct: 14, turns: 3 },
    ],
    learn: {
      goldCost: 2400,
      stat: { key: "str", min: 60 },
      level: 24,
      prereqSkillIds: ["v2_skill_strike"],
    },
  },
  str_intimidating_roar_t2: {
    id: "str_intimidating_roar_t2",
    name: "위압의 함성",
    stat: "str",
    category: "debuff",
    tier: 2,
    description: "힘으로 전장을 짓눌러 적의 공격 의지를 꺾는다.",
    mpCost: 60,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 16, turns: 3 }],
    learn: {
      goldCost: 2000,
      stat: { key: "str", min: 50 },
      level: 20,
      prereqSkillIds: ["v2_skill_strike"],
    },
  },

  // DEX — 공격 + 회피 버프
  dex_needle_flurry_t2: {
    id: "dex_needle_flurry_t2",
    name: "바늘 연격",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "짧고 정확한 찌르기를 여러 번 이어 빈틈을 넓힌다.",
    mpCost: 65,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.35, baseFlat: 8 }],
    learn: {
      goldCost: 1800,
      stat: { key: "dex", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_flurry"],
    },
  },
  dex_true_thrust_t2: {
    id: "dex_true_thrust_t2",
    name: "정밀 관통",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "호흡을 멈추고 정확한 한 점을 꿰뚫는다.",
    mpCost: 80,
    cooldown: 4,
    effects: [{ kind: "damage", statCoef: 1.55, baseFlat: 10 }],
    learn: {
      goldCost: 2300,
      stat: { key: "dex", min: 58 },
      level: 23,
      prereqSkillIds: ["v2_skill_flurry"],
    },
  },
  dex_mirage_step_t2: {
    id: "dex_mirage_step_t2",
    name: "잔영 보법",
    stat: "dex",
    category: "buff",
    tier: 2,
    description: "잔상을 남기는 보법으로 공격을 흘린다.",
    mpCost: 75,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "dex", pct: 16, turns: 3 }],
    learn: {
      goldCost: 2100,
      stat: { key: "dex", min: 52 },
      level: 21,
      prereqSkillIds: ["v2_skill_flurry"],
    },
  },

  // VIT — 회복 강화 + 방벽 버프 + 도발
  vit_greater_recover_t2: {
    id: "vit_greater_recover_t2",
    name: "강화 회복",
    stat: "vit",
    category: "heal",
    tier: 2,
    description: "깊게 숨을 들이켜 흐트러진 몸을 크게 회복한다.",
    mpCost: 75,
    cooldown: 4,
    effects: [{ kind: "heal", pctMaxHp: 16 }],
    learn: {
      goldCost: 1900,
      stat: { key: "vit", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_recover"],
    },
  },
  vit_guard_shell_t2: {
    id: "vit_guard_shell_t2",
    name: "철벽 호흡",
    stat: "vit",
    category: "buff",
    tier: 2,
    description: "몸을 단단히 고정해 충격을 받아낼 자세를 만든다.",
    mpCost: 70,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "vit", pct: 17, turns: 3 }],
    learn: {
      goldCost: 2200,
      stat: { key: "vit", min: 55 },
      level: 22,
      prereqSkillIds: ["v2_skill_recover"],
    },
  },
  vit_provoking_shout_t2: {
    id: "vit_provoking_shout_t2",
    name: "도발의 외침",
    stat: "vit",
    category: "debuff",
    tier: 2,
    description: "적의 호흡을 흐트러뜨리는 거친 외침으로 공격 리듬을 끊는다.",
    mpCost: 60,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 14, turns: 3 }],
    learn: {
      goldCost: 2000,
      stat: { key: "vit", min: 50 },
      level: 20,
      prereqSkillIds: ["v2_skill_recover"],
    },
  },

  // SPD — 버프 + 반격 디버프 + 빠른 공격
  spd_first_wind_t2: {
    id: "spd_first_wind_t2",
    name: "선풍",
    stat: "spd",
    category: "buff",
    tier: 2,
    description: "전투 시작의 한 박자를 앞당기는 움직임을 익힌다.",
    mpCost: 65,
    cooldown: 4,
    effects: [{ kind: "selfBuff", stat: "spd", pct: 16, turns: 3 }],
    learn: {
      goldCost: 1800,
      stat: { key: "spd", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_dash"],
    },
  },
  spd_afterimage_counter_t2: {
    id: "spd_afterimage_counter_t2",
    name: "역풍 자세",
    stat: "spd",
    category: "debuff",
    tier: 2,
    description: "상대의 반격 타이밍을 비틀어 다음 움직임을 늦춘다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "spd", pct: 16, turns: 3 }],
    learn: {
      goldCost: 2100,
      stat: { key: "spd", min: 52 },
      level: 21,
      prereqSkillIds: ["v2_skill_dash"],
    },
  },
  spd_gale_cut_t2: {
    id: "spd_gale_cut_t2",
    name: "질풍 베기",
    stat: "spd",
    category: "attack",
    tier: 2,
    description: "속도를 실어 짧은 궤적으로 베어낸다.",
    mpCost: 80,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.5, baseFlat: 6 }],
    learn: {
      goldCost: 2300,
      stat: { key: "spd", min: 58 },
      level: 23,
      prereqSkillIds: ["v2_skill_dash"],
    },
  },

  // LUK — 치명 버프 + 디버프 + 즉사형 공격
  luk_critical_omen_t2: {
    id: "luk_critical_omen_t2",
    name: "치명 예감",
    stat: "luk",
    category: "buff",
    tier: 2,
    description: "승부가 기우는 순간을 읽어 행운을 끌어올린다.",
    mpCost: 65,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "luk", pct: 17, turns: 3 }],
    learn: {
      goldCost: 1900,
      stat: { key: "luk", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_fortune"],
    },
  },
  luk_curse_mark_t2: {
    id: "luk_curse_mark_t2",
    name: "불길한 표식",
    stat: "luk",
    category: "debuff",
    tier: 2,
    description: "적에게 불운의 흐름을 새겨 균형을 무너뜨린다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "luk", pct: 16, turns: 3 }],
    learn: {
      goldCost: 2100,
      stat: { key: "luk", min: 52 },
      level: 21,
      prereqSkillIds: ["v2_skill_fortune"],
    },
  },
  luk_death_lottery_t2: {
    id: "luk_death_lottery_t2",
    name: "사신의 제비",
    stat: "luk",
    category: "attack",
    tier: 2,
    description: "낮은 확률의 즉사 감각을 피해량으로 압축해 찌른다.",
    mpCost: 95,
    cooldown: 5,
    effects: [{ kind: "damage", statCoef: 1.75, baseFlat: 12 }],
    learn: {
      goldCost: 2600,
      stat: { key: "luk", min: 62 },
      level: 25,
      prereqSkillIds: ["v2_skill_fortune"],
    },
  },

  // INT — 마법 공격 + 디버프
  int_arcane_bolt_t2: {
    id: "int_arcane_bolt_t2",
    name: "비전 화살",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "응축한 마력을 한 점에 쏘아 단일 대상을 꿰뚫는다.",
    mpCost: 70,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.5, baseFlat: 10 }],
    learn: {
      goldCost: 1800,
      stat: { key: "int", min: 45 },
      level: 18,
      prereqSkillIds: ["v2_skill_meditate"],
    },
  },
  int_mana_burst_t2: {
    id: "int_mana_burst_t2",
    name: "마력 폭발",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "마력을 넓게 터뜨려 전장을 흔든다.",
    mpCost: 90,
    cooldown: 5,
    effects: [{ kind: "damage", statCoef: 1.7, baseFlat: 14 }],
    learn: {
      goldCost: 2500,
      stat: { key: "int", min: 60 },
      level: 24,
      prereqSkillIds: ["v2_skill_meditate"],
    },
  },
  int_mind_fog_t2: {
    id: "int_mind_fog_t2",
    name: "정신 안개",
    stat: "int",
    category: "debuff",
    tier: 2,
    description: "적의 판단을 흐리는 안개를 펼쳐 마력의 흐름을 끊는다.",
    mpCost: 65,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "int", pct: 16, turns: 3 }],
    learn: {
      goldCost: 2100,
      stat: { key: "int", min: 52 },
      level: 21,
      prereqSkillIds: ["v2_skill_meditate"],
    },
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
