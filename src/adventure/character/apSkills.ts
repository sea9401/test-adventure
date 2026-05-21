// AP 스킬 시스템 — 스킬북으로 학습해 슬롯 장착, 전투 중 AP 소비해 발동.
// 기존 스탯 임계 스킬(STAT_SKILL) 과 별개 카테고리. 같은 equippedSkills 슬롯 풀 공유.
// AP 회복: 매 플레이어 행동 +1. cap 도달 시 정지. 매 전투 시작 시 AP_BATTLE_START 로 리셋.
// AI 발동: 매 턴 슬롯 순서로 첫 발동 가능한 AP 스킬 1개 발동 (한 턴 최대 1개).

export const AP_CAP = 5;
export const AP_BATTLE_START = 3;

export type APSkillId =
  | "shadow_cut"
  | "extra_evade"
  | "mending"
  | "heaven_slay"
  | "deep_wound"
  | "resolve"
  | "expose_weakness"
  | "madness"
  | "slow"
  | "frenzy"
  | "focused_breath"
  | "combo_strike"
  | "storm_strike"
  | "mad_slash"
  | "thunder_strike"
  | "light_glide"
  | "purify"
  | "afterimage"
  | "lifesteal"
  // 5막 「빈 옥좌의 시대」 — 별빛 깃든 기예 6종. 노수호자 유성의 그릇 빚기 의뢰 보상.
  | "starlit_mending"
  | "starlit_cut"
  | "starlit_knot"
  | "starlit_chill"
  | "starlit_sever"
  | "starlit_scatter";

export type APSkillEffect =
  // 본타 데미지를 ATK × atkMult 로 갱신. ignoresDef = true 면 적 DEF 무시.
  // ignoresEvasion = true 면 적 회피 굴림 자체를 스킵 — 첫 공격은 100% 명중.
  | {
      kind: "atk_multiplier";
      atkMult: number;
      ignoresDef?: boolean;
      ignoresEvasion?: boolean;
    }
  // 발동 즉시 자가 회복 — maxHp × pct/100 만큼 (현재 HP 위에 누적, maxHp 클램프).
  | { kind: "heal_pct"; pct: number }
  // 발동 즉시 적에게 출혈 스택 N 부여 (기존 stacks 와 누적).
  | { kind: "apply_bleed"; stacks: number }
  // 발동 즉시 보장 회피 횟수 +N (회피 강화 패시브와 누적).
  | { kind: "add_guaranteed_evades"; count: number }
  // 다음 N 라운드 동안 받는 피해 -pct%. 결의 — 방어용 패닉 버튼.
  | { kind: "player_dmg_reduction_turns"; pct: number; turns: number }
  // 다음 N 라운드 동안 적 DEF -pct%. 약점 노출 — 데미지 증폭.
  | { kind: "enemy_def_debuff_pct_turns"; pct: number; turns: number }
  // 다음 N 라운드 동안 ATK +atkPct% & 자신 DEF -defPct%. 광기 — 공격형 광폭화.
  | {
      kind: "player_atk_buff_def_debuff_pct_turns";
      atkPct: number;
      defPct: number;
      turns: number;
    }
  // 다음 N 라운드 동안 적 SPD ×mult. 둔화 — 천칭 시너지용.
  | { kind: "enemy_spd_mult_turns"; mult: number; turns: number }
  // 다음 N 라운드 동안 자신 SPD ×mult. 폭주 — 천칭 시너지용.
  | { kind: "player_spd_mult_turns"; mult: number; turns: number }
  // 다음 평타 1회 크리 100% + 크리뎀 +pct% (크리뎀은 그 1발에만). 집중의 호흡.
  | { kind: "crit_buff_next_attack"; critDmgBonusPct: number }
  // 이번 턴 추가 공격 +count. 연환격 — 이미 attackCount 가 결정된 후 즉시 attacksLeft 증가.
  | { kind: "extra_attack_this_turn"; count: number }
  // 본타 + (ATK × spdPct/100) 추가 데미지. 폭풍 일격 — fire 공격에 한 번 더 얹는다.
  | { kind: "atk_plus_spd_pct_bonus"; spdPct: number }
  // 발동 attack 으로 ATK×atkMult 데미지를 hits 번 적용 + maxHp ×selfDmgPct/100 자해.
  // 광살참 — 단일 fire 에서 다중 타격 + HP 비용. ignoresDef·ignoresEvasion 동일 옵션.
  | {
      kind: "multi_hit_self_damage";
      atkMult: number;
      hits: number;
      selfDmgPct: number;
      ignoresDef?: boolean;
      ignoresEvasion?: boolean;
    }
  // ATK ×atkMult + 1턴 적 스킬 봉인. 천뢰 일격 — 본타 변형 + enemy skill silence.
  | {
      kind: "atk_multiplier_with_silence";
      atkMult: number;
      silenceTurns: number;
      ignoresDef?: boolean;
      ignoresEvasion?: boolean;
    }
  // 다음 1턴 플레이어 attackCount +count. 빛의 활공 — 큐잉 형태로 다음 턴 시작 시 소비.
  | { kind: "queued_extra_attacks_next_turn"; count: number }
  // 플레이어에게 걸린 모든 디버프 제거. 정화 — 광기 자신 DEF 페널티 등 클리어.
  | { kind: "cleanse_debuffs" }
  // 적의 다음 공격 N회 무효. 잔상 — 적 페이즈에서 데미지 적용 전 소비.
  | { kind: "block_next_enemy_attack"; count: number }
  // 다음 N 라운드 동안 가한 모든 데미지의 pct% 만큼 자가 회복. 흡령 — 깊이 보상.
  // 패시브 흡혈(rune_lifesteal) 과 별개로 시한부 버프. 엔진에서 두 곳 합산.
  | { kind: "lifesteal_dmg_pct_turns"; pct: number; turns: number };

export type APSkill = {
  /** 내부 id — 데이터 식별용. user-facing 은 name. */
  id: APSkillId;
  /** 표시 이름. equippedSkills 배열의 키. STAT_SKILL 의 이름과 충돌 X. */
  name: string;
  description: string;
  apCost: number;
  effect: APSkillEffect;
};

export const AP_SKILLS: APSkill[] = [
  {
    id: "shadow_cut",
    name: "그림자 베기",
    description: "ATK × 1.5 단발, 적 DEF 무시",
    apCost: 3,
    effect: { kind: "atk_multiplier", atkMult: 1.5, ignoresDef: true },
  },
  {
    id: "extra_evade",
    name: "추가 회피",
    description: "보장 회피 횟수 +1 (회피 강화 패시브와 누적)",
    apCost: 1,
    effect: { kind: "add_guaranteed_evades", count: 1 },
  },
  {
    id: "mending",
    name: "회복술",
    description: "즉시 maxHP × 25% 회복",
    apCost: 3,
    effect: { kind: "heal_pct", pct: 25 },
  },
  {
    id: "heaven_slay",
    name: "천살",
    description: "ATK × 3.0 단발, 회피·DEF 모두 무시",
    apCost: 5,
    effect: {
      kind: "atk_multiplier",
      atkMult: 3.0,
      ignoresDef: true,
      ignoresEvasion: true,
    },
  },
  {
    id: "deep_wound",
    name: "깊은 상처",
    description: "적에게 출혈 5스택 즉시 부여 (출혈 패시브와 시너지)",
    apCost: 3,
    effect: { kind: "apply_bleed", stacks: 5 },
  },
  {
    id: "resolve",
    name: "결의",
    description: "1턴 동안 받는 피해 -50%",
    apCost: 2,
    effect: { kind: "player_dmg_reduction_turns", pct: 50, turns: 1 },
  },
  {
    id: "expose_weakness",
    name: "약점 노출",
    description: "3턴 동안 적 DEF -25%",
    apCost: 2,
    effect: { kind: "enemy_def_debuff_pct_turns", pct: 25, turns: 3 },
  },
  {
    id: "madness",
    name: "광기",
    description: "3턴 동안 ATK +30%, 자신 DEF -15%",
    apCost: 3,
    effect: {
      kind: "player_atk_buff_def_debuff_pct_turns",
      atkPct: 30,
      defPct: 15,
      turns: 3,
    },
  },
  {
    id: "slow",
    name: "둔화",
    description: "2턴 동안 적 SPD 절반 (천칭 크리 시너지)",
    apCost: 2,
    effect: { kind: "enemy_spd_mult_turns", mult: 0.5, turns: 2 },
  },
  {
    id: "frenzy",
    name: "폭주",
    description: "3턴 동안 자신 SPD ×1.5 (천칭 크리 시너지)",
    apCost: 4,
    effect: { kind: "player_spd_mult_turns", mult: 1.5, turns: 3 },
  },
  {
    id: "focused_breath",
    name: "집중의 호흡",
    description: "다음 평타 1회 크리 보장 + 그 1발 크리뎀 +30%",
    apCost: 2,
    effect: { kind: "crit_buff_next_attack", critDmgBonusPct: 30 },
  },
  {
    id: "combo_strike",
    name: "연환격",
    description: "이번 턴 추가 공격 +1",
    apCost: 2,
    effect: { kind: "extra_attack_this_turn", count: 1 },
  },
  {
    id: "storm_strike",
    name: "폭풍 일격",
    description: "본타 + (ATK × SPD%) 추가 데미지",
    apCost: 3,
    effect: { kind: "atk_plus_spd_pct_bonus", spdPct: 100 },
  },
  {
    id: "mad_slash",
    name: "광살참",
    description: "ATK ×2.0 으로 2연타, 자신 maxHP ×15% 자해",
    apCost: 4,
    effect: {
      kind: "multi_hit_self_damage",
      atkMult: 2.0,
      hits: 2,
      selfDmgPct: 15,
    },
  },
  {
    id: "thunder_strike",
    name: "천뢰 일격",
    description: "ATK ×2.5 + 1턴 적 스킬 봉인",
    apCost: 5,
    effect: {
      kind: "atk_multiplier_with_silence",
      atkMult: 2.5,
      silenceTurns: 1,
    },
  },
  {
    id: "light_glide",
    name: "빛의 활공",
    description: "다음 1턴 추가 공격 +3 (큐잉)",
    apCost: 5,
    effect: { kind: "queued_extra_attacks_next_turn", count: 3 },
  },
  {
    id: "purify",
    name: "정화",
    description: "플레이어에게 걸린 모든 디버프 제거",
    apCost: 1,
    effect: { kind: "cleanse_debuffs" },
  },
  {
    id: "afterimage",
    name: "잔상",
    description: "적의 다음 공격 1회 무효",
    apCost: 3,
    effect: { kind: "block_next_enemy_attack", count: 1 },
  },
  {
    id: "lifesteal",
    name: "흡령",
    description: "3턴 동안 가한 데미지의 30% 만큼 자가 회복",
    apCost: 4,
    effect: { kind: "lifesteal_dmg_pct_turns", pct: 30, turns: 3 },
  },
  // ── 5막 「빈 옥좌의 시대」 — 별빛 깃든 기예 6종 ─────────────────────────
  // 노수호자 유성의 그릇 빚기 의뢰 보상. 별빛 조각 30 deliver 시 6권 일괄 학습 가능.
  // 기존 effect kind 만 사용 (엔진 변경 없음). 4막 정점 스킬(천살·잔상·결의·깊은 상처) 의
  // 5막 톤 변주 — 회복은 더 두텁게, 무효는 두 배로, 출혈은 짙게, 베기는 정확하게.
  {
    id: "starlit_mending",
    name: "별빛 회수",
    description: "즉시 maxHP × 40% 회복",
    apCost: 4,
    effect: { kind: "heal_pct", pct: 40 },
  },
  {
    id: "starlit_cut",
    name: "잔영 베기",
    description: "ATK × 2.0 단발, 적 회피 무시",
    apCost: 4,
    effect: { kind: "atk_multiplier", atkMult: 2.0, ignoresEvasion: true },
  },
  {
    id: "starlit_knot",
    name: "별빛 매듭",
    description: "2턴 동안 받는 피해 -60%",
    apCost: 3,
    effect: { kind: "player_dmg_reduction_turns", pct: 60, turns: 2 },
  },
  {
    id: "starlit_chill",
    name: "별빛 한기",
    description: "적에게 출혈 7스택 즉시 부여",
    apCost: 4,
    effect: { kind: "apply_bleed", stacks: 7 },
  },
  {
    id: "starlit_sever",
    name: "별빛 끊기",
    description: "적의 다음 공격 2회 무효",
    apCost: 4,
    effect: { kind: "block_next_enemy_attack", count: 2 },
  },
  {
    id: "starlit_scatter",
    name: "별빛 흩기",
    description: "ATK × 1.8 단발, 회피·DEF 모두 무시",
    apCost: 4,
    effect: {
      kind: "atk_multiplier",
      atkMult: 1.8,
      ignoresDef: true,
      ignoresEvasion: true,
    },
  },
];

export function getAPSkillByName(name: string): APSkill | undefined {
  return AP_SKILLS.find((s) => s.name === name);
}

export function getAPSkillById(id: APSkillId): APSkill | undefined {
  return AP_SKILLS.find((s) => s.id === id);
}

export function isAPSkillName(name: string): boolean {
  return AP_SKILLS.some((s) => s.name === name);
}

// SkillsView 등 UI 에 표시할 description — 코스트를 앞에 prefix 해 한눈에 들어오게.
// 데이터의 raw description 은 효과만 담고 표시 시 합성. apCost 변경 시 description 보정 불필요.
export function formatAPSkillDescription(skill: APSkill): string {
  return `AP ${skill.apCost} · ${skill.description}`;
}

// 슬롯별 발동 조건 — AP affordable 체크 이전에 평가된다.
// 부등식 의미는 라벨 그대로 (≥ / ≤ / </ ≥ — 미만/이상). UI 도 같은 수식 라벨 사용.
//   - always: 기존 동작. AP 만 닿으면 발동 (기본값).
//   - ap_at_least: AP ≥ X. 저코스트 스킬을 "AP 저축" 게이트로 만드는 용도.
//   - ap_at_most: AP ≤ X. 큰 스킬용 AP 저축을 정확히 표현 ("나는 작은 거 → 큰 거 안 모일 때만").
//   - hp_below_pct: 내 HP < X%. 회복술/결의 같은 방어 스킬용.
//   - hp_above_pct: 내 HP ≥ X%. 흡령/광살참 같이 자기 피해/회복 효과가 있는 스킬용.
//   - enemy_hp_below_pct: 적 HP < X%. 광살참/천살 같은 마무리용.
//   - enemy_hp_above_pct: 적 HP ≥ X%. 광기/약점 노출 같은 지속 버프 — 적이 충분히 셀 때 일찍.
//   - every_n_turns: completedPlayerTurns 가 X 의 배수일 때 (turn 1·X+1·2X+1...). 지속 버프 재시전.
//   - enemy_max_hp_at_least: 적 max HP ≥ X. cost 5 스킬을 잡몹에 낭비 X (보스 전용 게이트).
//   - no_self_effect_active: 이 슬롯 스킬이 부여하는 효과가 현재 비활성. 광기·폭주 등 자기 갱신
//                            방지 — 같은 효과 turnsLeft > 0 일 땐 발동 X. 단발 효과는 항상 true.
export type APSkillCondition =
  | { kind: "always" }
  | { kind: "ap_at_least"; value: number }
  | { kind: "ap_at_most"; value: number }
  | { kind: "hp_below_pct"; value: number }
  | { kind: "hp_above_pct"; value: number }
  | { kind: "enemy_hp_below_pct"; value: number }
  | { kind: "enemy_hp_above_pct"; value: number }
  | { kind: "every_n_turns"; value: number }
  | { kind: "enemy_max_hp_at_least"; value: number }
  | { kind: "no_self_effect_active" };

export const AP_SKILL_CONDITION_KINDS = [
  "always",
  "ap_at_least",
  "ap_at_most",
  "hp_below_pct",
  "hp_above_pct",
  "enemy_hp_below_pct",
  "enemy_hp_above_pct",
  "every_n_turns",
  "enemy_max_hp_at_least",
  "no_self_effect_active",
] as const satisfies ReadonlyArray<APSkillCondition["kind"]>;

export const DEFAULT_AP_SKILL_CONDITION: APSkillCondition = { kind: "always" };

// 값 있는 트리거의 임계값 프리셋/슬라이더 범위. always / no_self_effect_active 는 제외.
export type ValuedAPSkillConditionKind = Exclude<
  APSkillCondition["kind"],
  "always" | "no_self_effect_active"
>;

// 조건별 임계값 기본 프리셋 — UI 의 빠른 버튼 + 신규 트리거 선택 시 시작값.
// 슬라이더 토글로 임의 값 입력 가능 (UI 단계에서 clamp).
export const AP_SKILL_CONDITION_PRESETS: Record<
  ValuedAPSkillConditionKind,
  { min: number; max: number; step: number; presets: number[] }
> = {
  ap_at_least: { min: 1, max: AP_CAP, step: 1, presets: [2, 3, 4, 5] },
  ap_at_most: { min: 1, max: AP_CAP, step: 1, presets: [2, 3, 4] },
  hp_below_pct: { min: 5, max: 95, step: 5, presets: [25, 50, 75] },
  hp_above_pct: { min: 5, max: 95, step: 5, presets: [50, 75, 90] },
  enemy_hp_below_pct: { min: 5, max: 95, step: 5, presets: [25, 50, 75] },
  enemy_hp_above_pct: { min: 5, max: 95, step: 5, presets: [50, 75, 90] },
  every_n_turns: { min: 1, max: 10, step: 1, presets: [2, 3, 4, 5] },
  enemy_max_hp_at_least: {
    min: 100,
    max: 50000,
    step: 100,
    presets: [1000, 3000, 5000, 10000],
  },
};

const VALUED_KINDS: ReadonlySet<APSkillCondition["kind"]> = new Set([
  "ap_at_least",
  "ap_at_most",
  "hp_below_pct",
  "hp_above_pct",
  "enemy_hp_below_pct",
  "enemy_hp_above_pct",
  "every_n_turns",
  "enemy_max_hp_at_least",
] satisfies APSkillCondition["kind"][]);

export function isAPSkillCondition(v: unknown): v is APSkillCondition {
  if (!v || typeof v !== "object") return false;
  const o = v as { kind?: unknown; value?: unknown };
  if (o.kind === "always" || o.kind === "no_self_effect_active") return true;
  if (
    typeof o.kind === "string" &&
    VALUED_KINDS.has(o.kind as APSkillCondition["kind"]) &&
    typeof o.value === "number" &&
    Number.isFinite(o.value)
  ) {
    return true;
  }
  return false;
}

// 조건을 사람이 읽는 한 줄로 — UI 의 pill 표기 + 엔진 로그용. always 는 빈 문자열.
export function formatAPSkillCondition(c: APSkillCondition): string {
  switch (c.kind) {
    case "always":
      return "";
    case "ap_at_least":
      return `AP ≥ ${c.value}`;
    case "ap_at_most":
      return `AP ≤ ${c.value}`;
    case "hp_below_pct":
      return `HP < ${c.value}%`;
    case "hp_above_pct":
      return `HP ≥ ${c.value}%`;
    case "enemy_hp_below_pct":
      return `적HP < ${c.value}%`;
    case "enemy_hp_above_pct":
      return `적HP ≥ ${c.value}%`;
    case "every_n_turns":
      return `${c.value}턴마다`;
    case "enemy_max_hp_at_least":
      return `적maxHP ≥ ${c.value}`;
    case "no_self_effect_active":
      return "효과 없을 때";
  }
}
