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
import type { V2Class } from "./classes";
import type { V2Element } from "./elements";
import { V2_DEBUFF_PRESETS, V2_DOT_PRESETS } from "./statusEffects";

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
  // ── Tier 1 학습형 — INT 기본 마법 공격 (교관 구매) ──────────────────
  // INT 는 물리 atk 가 안 붙어 평타가 무의미하므로, STR/DEX 의 평타 역할을 대신할
  // 기본 마법 공격이 필요. 스타터(자동지급)로 두면 비-INT 빌드가 1뎀 마법을 잘못
  // 시전하므로 학습형 + int 요구치로 게이트.
  | "int_magic_bolt_t1" // INT 마법 탄 (기본 마법 공격)
  // ── Tier 2 (교관 학습, PR-3 도입) ─────────────────────────────────
  | "str_cleave_t2" // STR 횡베기
  | "str_crushing_blow_t2" // STR 분쇄 강타
  | "str_intimidating_roar_t2" // STR 위압의 함성
  // ── 직업 전용 (PR-1 슬라이스) ─────────────────────────────────────
  | "v2_skill_blade_dance" // 검사 전용 — 검무
  // ── 직업 전용 (PR-6 직업 확장) — 5직업 시그니처 ──────────────────────
  | "v2_skill_piercing_shot" // 궁수 전용 — 관통 사격 (DEX)
  | "v2_skill_iron_fist" // 무도가 전용 — 철권난타 (VIT)
  | "v2_skill_arcane_nova" // 마법사 전용 — 비전 폭발 (INT)
  | "v2_skill_divine_light" // 신관 전용 — 신성한 빛 (SPI)
  | "v2_skill_shadow_strike" // 인술가 전용 — 그림자 일격 (LUK)
  // ── 직업 2차 전용 (PR-7 전직) — 6 2차 시그니처 ──────────────────────
  | "v2_skill_moonlight_slash" // 검성 전용 — 월광검 (STR)
  | "v2_skill_storm_arrows" // 명궁 전용 — 폭풍 화살 (DEX)
  | "v2_skill_collapsing_fist" // 권왕 전용 — 붕권 (VIT)
  | "v2_skill_meteor" // 대마법사 전용 — 메테오 (INT)
  | "v2_skill_blessing" // 주교 전용 — 축복의 빛 (SPI)
  | "v2_skill_shadow_clones" // 그림자 주인 전용 — 그림자 분신 (LUK)
  // ── 몬스터 전용 상태이상 (PR-9) — 플레이어 미학습, 몹 v2Skills 로만 ──────
  | "mob_venom_bite" // 독니 — 중독(DoT)
  | "mob_chilling_touch" // 한기 — 둔화(속도−)
  | "mob_rending_claw" // 살점 뜯기 — 출혈(DoT)
  // (위 3종은 V2MonsterStatusSkillId 로도 재노출 — 몹 부착 타입 안전)
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
  | "int_mana_burst_t2" // INT 마력 폭발
  | "int_mind_fog_t2"; // INT 정신 안개

// 스킬 효과 — 복합 가능 (효과 배열에 여러 개).
// 단위 규칙: pct·pctMaxHp 는 "정수 퍼센트 단위" (10 = 10%). 후속 전투 wiring 에서
// 0.10 으로 오해 금지. damage 의 statCoef 는 배율 (1.0 = 1×공격력).
// scaling (PR-magic): damage 가 어느 공격력으로 스케일하는지. 미지정/"physical" = 물리 atk,
// "magic" = 마법 공격력(magicAtk = INT 환산). INT 공격 스킬만 "magic" — 마법 빌드가
// 물리 atk 없이도 데미지를 내는 별도 경로. DEF 는 물리·마법 공유(마법저항 미신설).
// dot (PR-8) = 지속 피해 (DoT). label 은 UI 표시·중복 정책에 사용 (같은 label 박히면 turns refresh).
// dmgPerTurn 은 raw 정수 — DEF 무시. 매 target turn 진입 시 적용.
// PR-9 — 몬스터 전용 상태이상 스킬 id (DungeonEnemy.statusSkill 부착 타입 안전).
export type V2MonsterStatusSkillId =
  | "mob_venom_bite"
  | "mob_chilling_touch"
  | "mob_rending_claw";

export type V2SkillEffect =
  | { kind: "damage"; statCoef: number; baseFlat?: number; scaling?: "physical" | "magic" }
  | { kind: "heal"; pctMaxHp?: number; flat?: number }
  | { kind: "selfBuff"; stat: StatKey; pct: number; turns: number }
  | { kind: "enemyDebuff"; stat: StatKey; pct: number; turns: number }
  | { kind: "dot"; label: string; dmgPerTurn: number; turns: number };

// 학습 조건 — 교관 화면에서 사용. 충족 안 되면 구매 차단.
export type V2SkillLearnRequirement = {
  goldCost: number;
  level?: number;
  stat?: { key: StatKey; min: number };
  /** 선행 스킬 — 모두 학습 보유해야. */
  prereqSkillIds?: readonly V2SkillId[];
  /** 직업 전용 — 이 직업일 때만 학습 가능. 미지정 = 직업 무관. */
  requireClass?: V2Class;
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
  /** PR-5b 스킬 속성 — 부여 시 이 스킬 데미지는 이 속성으로 상성 적용(없으면 캐릭 속성).
   *  무기 속성(평타)보다 우선 — 공허 마법사가 "불 마법"을 쓰면 그 스킬만 불 상성. */
  element?: V2Element;
  /** PR-9 — 몬스터 전용 스킬(상태이상 부착). 플레이어 교관/학습 UI 에서 제외, 몹만 v2Skills 로 보유. */
  monsterOnly?: boolean;
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
    element: "earth",
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
    element: "wind",
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

  // === Tier 1 학습형 — INT 기본 마법 공격 ───────────────────────────
  // 마법 빌드의 평타 대체. magicAtk(INT 환산)로 스케일하는 가장 싼 단발 마법.
  // 상위 마법 스킬(직업 시그니처 등) 을 얻기 전까지 INT 가 데미지를 낼 기본 수단. coef 1.0 으로
  // STR 강타와 같은 배율이되 마법 경로라 magicAtk 로 친다. int 20 요구치로 비-INT 빌드 차단.
  int_magic_bolt_t1: {
    id: "int_magic_bolt_t1",
    name: "마법 탄",
    stat: "int",
    category: "attack",
    tier: 1,
    description: "응축한 마력을 작게 뭉쳐 쏘아 보낸다. 익히기 쉬운 기초 마법.",
    mpCost: 14,
    cooldown: 0,
    element: "fire",
    // coef 0.45 + baseFlat 10 — flat 은 magicAtk 작은 초반엔 비중이 커 INT 초반을
    // 떠받치고, magicAtk 큰 후반엔 미미해 no-cd 필러가 지속 DPS 를 과하게 올리지
    // 않는다(자연 스케일링). sim-v2-progression --skills 캘리브: INT wr Lv10 36%→79%(공백
    // 해소), Lv25 91%·Lv50 83%(STR 동률) 유지. coef/flat 둘이 초반·후반 분리 다이얼.
    effects: [{ kind: "damage", statCoef: 0.45, baseFlat: 10, scaling: "magic" }],
    learn: {
      goldCost: 200,
      level: 1,
      stat: { key: "int", min: 20 },
    },
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
    element: "earth",
    effects: [{ kind: "damage", statCoef: 1.45 }],
    learn: {
      goldCost: 3600,
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
    element: "earth",
    effects: [
      { kind: "damage", statCoef: 1.65 },
      { kind: "enemyDebuff", stat: "vit", pct: 14, turns: 3 },
    ],
    learn: {
      goldCost: 4800,
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
      goldCost: 4000,
      stat: { key: "str", min: 50 },
      level: 20,
      prereqSkillIds: ["v2_skill_strike"],
    },
  },

  // DEX — 공격 + 회피 버프
  dex_true_thrust_t2: {
    id: "dex_true_thrust_t2",
    name: "정밀 관통",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "호흡을 멈추고 정확한 한 점을 꿰뚫는다.",
    mpCost: 80,
    cooldown: 4,
    element: "lightning",
    effects: [{ kind: "damage", statCoef: 1.55, baseFlat: 10 }],
    learn: {
      goldCost: 4600,
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
      goldCost: 4200,
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
      goldCost: 3800,
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
      goldCost: 4400,
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
      goldCost: 4000,
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
      goldCost: 3600,
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
      goldCost: 4200,
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
    element: "wind",
    effects: [{ kind: "damage", statCoef: 1.5, baseFlat: 6 }],
    learn: {
      goldCost: 4600,
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
      goldCost: 3800,
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
      goldCost: 4200,
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
    element: "void",
    effects: [{ kind: "damage", statCoef: 1.75, baseFlat: 12 }],
    learn: {
      goldCost: 5200,
      stat: { key: "luk", min: 62 },
      level: 25,
      prereqSkillIds: ["v2_skill_fortune"],
    },
  },

  // INT — 마법 공격 + 디버프
  int_mana_burst_t2: {
    id: "int_mana_burst_t2",
    name: "마력 폭발",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "마력을 넓게 터뜨려 전장을 흔든다.",
    mpCost: 90,
    cooldown: 5,
    element: "water",
    effects: [{ kind: "damage", statCoef: 1.7, baseFlat: 14, scaling: "magic" }],
    learn: {
      goldCost: 5000,
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
      goldCost: 4200,
      stat: { key: "int", min: 52 },
      level: 21,
      prereqSkillIds: ["v2_skill_meditate"],
    },
  },
  // ── 직업 전용 (PR-1) — 검사 검무 ──────────────────────────────────
  v2_skill_blade_dance: {
    id: "v2_skill_blade_dance",
    name: "검무",
    stat: "str",
    category: "attack",
    tier: 2,
    description: "검사 전용. 연속 검격으로 강한 물리 피해를 입힌다.",
    mpCost: 0,
    cooldown: 2,
    element: "fire",
    effects: [
      { kind: "damage", statCoef: 2.2, baseFlat: 12, scaling: "physical" },
    ],
    learn: { goldCost: 0, requireClass: "swordsman" },
  },

  // ── 직업 전용 (PR-6) — 5직업 시그니처. mpCost 0 (검무처럼 무료 시전), requireClass 게이트. ──
  v2_skill_piercing_shot: {
    id: "v2_skill_piercing_shot",
    name: "관통 사격",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "궁수 전용. 관통하는 일격으로 강한 물리 피해를 입힌다. 꿰뚫린 자리가 깊게 벌어져 한동안 피가 흐른다.",
    mpCost: 0,
    cooldown: 3,
    element: "wind",
    // 출혈(DoT) — 직격 후 매 턴 추가 피해. 궁수 계열 시그니처 상태이상.
    effects: [
      { kind: "damage", statCoef: 2.0, baseFlat: 12, scaling: "physical" },
      { kind: "dot", ...V2_DOT_PRESETS.출혈 },
    ],
    learn: { goldCost: 0, requireClass: "archer" },
  },
  v2_skill_iron_fist: {
    id: "v2_skill_iron_fist",
    name: "철권난타",
    stat: "vit",
    category: "attack",
    tier: 2,
    description: "무도가 전용. 묵직한 연타 후 자세를 굳혀 활력이 오른다.",
    mpCost: 0,
    cooldown: 3,
    element: "earth",
    effects: [
      { kind: "damage", statCoef: 1.6, baseFlat: 12, scaling: "physical" },
      { kind: "selfBuff", stat: "vit", pct: 20, turns: 3 },
    ],
    learn: { goldCost: 0, requireClass: "martial" },
  },
  v2_skill_arcane_nova: {
    id: "v2_skill_arcane_nova",
    name: "비전 폭발",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "마법사 전용. 마력을 터뜨려 강한 마법 피해를 입힌다. 터진 마력이 살에 옮겨붙어 한동안 타들어간다.",
    mpCost: 0,
    cooldown: 2,
    element: "void",
    // 소각(DoT) — 마법사 계열 시그니처 상태이상.
    effects: [
      { kind: "damage", statCoef: 2.2, baseFlat: 12, scaling: "magic" },
      { kind: "dot", ...V2_DOT_PRESETS.소각 },
    ],
    learn: { goldCost: 0, requireClass: "mage" },
  },
  v2_skill_divine_light: {
    id: "v2_skill_divine_light",
    name: "신성한 빛",
    // 신관은 정신(spi) 직업이나 스킬 stat 메타는 라이브 StatKey 라 spi 불가 → int 로 분류.
    // 회복은 healMult(정신 파생)로 자동 증폭되므로 정체성은 유지된다.
    stat: "int",
    category: "heal",
    tier: 2,
    description: "신관 전용. 성스러운 빛으로 자신을 치유하고 적을 정화한다.",
    mpCost: 0,
    cooldown: 3,
    element: "starlight",
    effects: [
      { kind: "heal", pctMaxHp: 22 },
      { kind: "damage", statCoef: 1.0, baseFlat: 8, scaling: "magic" },
    ],
    learn: { goldCost: 0, requireClass: "priest" },
  },
  v2_skill_shadow_strike: {
    id: "v2_skill_shadow_strike",
    name: "그림자 일격",
    stat: "luk",
    category: "attack",
    tier: 2,
    description: "인술가 전용. 그림자에서 급소를 노린다. 치명타에 강하다. 칼끝에 바른 독이 상처를 타고 천천히 퍼진다.",
    mpCost: 0,
    cooldown: 3,
    element: "void",
    // 중독(DoT) — 인술 계열 시그니처 상태이상. 약하지만 가장 오래 가는 지속 피해.
    effects: [
      { kind: "damage", statCoef: 2.0, baseFlat: 12, scaling: "physical" },
      { kind: "dot", ...V2_DOT_PRESETS.중독 },
    ],
    learn: { goldCost: 0, requireClass: "ninja" },
  },

  // ── 직업 2차 전용 (PR-7 전직) — 6 2차 시그니처. 1차보다 강한 coef, requireClass 2차직업. ──
  v2_skill_moonlight_slash: {
    id: "v2_skill_moonlight_slash",
    name: "월광검",
    stat: "str",
    category: "attack",
    tier: 3,
    description: "검성 전용. 달빛을 베어 가르는 절검. 강력한 물리 피해.",
    mpCost: 0,
    cooldown: 3,
    element: "starlight",
    effects: [
      { kind: "damage", statCoef: 2.8, baseFlat: 14, scaling: "physical" },
    ],
    learn: { goldCost: 0, requireClass: "swordmaster" },
  },
  v2_skill_storm_arrows: {
    id: "v2_skill_storm_arrows",
    name: "폭풍 화살",
    stat: "dex",
    category: "attack",
    tier: 3,
    description: "명궁 전용. 폭풍처럼 쏟아지는 화살. 강력한 물리 피해. 수많은 화살촉이 살을 찢어 피가 멎지 않는다.",
    mpCost: 0,
    cooldown: 3,
    element: "lightning",
    // 출혈(DoT) — 궁수 계열 시그니처 상태이상(2차).
    effects: [
      { kind: "damage", statCoef: 2.6, baseFlat: 14, scaling: "physical" },
      { kind: "dot", ...V2_DOT_PRESETS.출혈 },
    ],
    learn: { goldCost: 0, requireClass: "sharpshooter" },
  },
  v2_skill_collapsing_fist: {
    id: "v2_skill_collapsing_fist",
    name: "붕권",
    stat: "vit",
    category: "attack",
    tier: 3,
    description: "권왕 전용. 무너뜨리는 일권. 적의 방어를 깎고 강타한다.",
    mpCost: 0,
    cooldown: 3,
    element: "earth",
    effects: [
      { kind: "damage", statCoef: 2.4, baseFlat: 14, scaling: "physical" },
      { kind: "enemyDebuff", stat: "vit", pct: 15, turns: 3 },
    ],
    learn: { goldCost: 0, requireClass: "grandmaster" },
  },
  v2_skill_meteor: {
    id: "v2_skill_meteor",
    name: "메테오",
    stat: "int",
    category: "attack",
    tier: 3,
    description: "대마법사 전용. 별을 떨궈 강력한 마법 피해를 입힌다. 떨어진 불티가 남아 오래도록 타오른다.",
    mpCost: 0,
    cooldown: 3,
    element: "starlight", // 별을 떨구는 마법.
    // 소각(DoT) — 마법사 계열 시그니처 상태이상(2차).
    effects: [
      { kind: "damage", statCoef: 2.8, baseFlat: 14, scaling: "magic" },
      { kind: "dot", ...V2_DOT_PRESETS.소각 },
    ],
    learn: { goldCost: 0, requireClass: "archmage" },
  },
  v2_skill_blessing: {
    id: "v2_skill_blessing",
    name: "축복의 빛",
    // 주교는 정신(spi) 직업이나 스킬 stat 메타는 라이브 StatKey 라 int 로 분류(divine_light 동일).
    stat: "int",
    category: "heal",
    tier: 3,
    description: "주교 전용. 깊은 가호로 크게 치유하고 몸을 단단히 한다.",
    mpCost: 0,
    cooldown: 3,
    effects: [
      { kind: "heal", pctMaxHp: 30 },
      { kind: "selfBuff", stat: "vit", pct: 20, turns: 3 },
    ],
    learn: { goldCost: 0, requireClass: "bishop" },
  },
  v2_skill_shadow_clones: {
    id: "v2_skill_shadow_clones",
    name: "그림자 분신",
    stat: "luk",
    category: "attack",
    tier: 3,
    description: "그림자 주인 전용. 분신이 일제히 급소를 친다. 치명타에 강하다. 분신마다 다른 독이 발려 상처가 곪아 든다.",
    mpCost: 0,
    cooldown: 3,
    element: "void",
    // 중독(DoT) — 인술 계열 시그니처 상태이상(2차).
    effects: [
      { kind: "damage", statCoef: 2.6, baseFlat: 14, scaling: "physical" },
      { kind: "dot", ...V2_DOT_PRESETS.중독 },
    ],
    learn: { goldCost: 0, requireClass: "nightblade" },
  },

  // ── 몬스터 전용 상태이상 (PR-9) — monsterOnly, learn 없음(플레이어 미학습), mpCost 0. ──
  // 순수 상태이상 부착(직접 데미지 없음). 엔진 적 페이즈에서 플레이어에게 적용.
  mob_venom_bite: {
    id: "mob_venom_bite",
    name: "독니",
    stat: "vit",
    category: "attack",
    tier: 2,
    description: "독을 주입해 중독시킨다.",
    mpCost: 0,
    cooldown: 3,
    monsterOnly: true,
    effects: [{ kind: "dot", ...V2_DOT_PRESETS.중독 }],
  },
  mob_chilling_touch: {
    id: "mob_chilling_touch",
    name: "한기",
    stat: "vit",
    category: "attack",
    tier: 2,
    description: "냉기로 움직임을 둔하게 한다.",
    mpCost: 0,
    cooldown: 3,
    monsterOnly: true,
    effects: [{ kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.둔화 }],
  },
  mob_rending_claw: {
    id: "mob_rending_claw",
    name: "살점 뜯기",
    stat: "vit",
    category: "attack",
    tier: 2,
    description: "깊은 상처로 출혈시킨다.",
    mpCost: 0,
    cooldown: 3,
    monsterOnly: true,
    effects: [{ kind: "dot", ...V2_DOT_PRESETS.출혈 }],
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
