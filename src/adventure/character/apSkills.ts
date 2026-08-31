// 과거 AP 스킬 저장 데이터와 남은 전투 어댑터가 공유하는 타입 계약.
// 현재 런타임에는 AP 스킬 카탈로그나 장착 UI가 없다.

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
  // 본타 데미지를 ATK × atkMult 로 갱신. ignoresDef = true 면 적 DEF 일부 관통
  // (engine.ts DEF_IGNORE_FRACTION = 30% 무시. 2026-05-23 완전 무시에서 완화).
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

// 과거 세이브와 남은 전투 어댑터의 슬롯별 발동 조건.
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
