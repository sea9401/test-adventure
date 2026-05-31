// PvP 전투 엔진 — engine.ts (PvE) 의 대칭 미러. 양쪽 모두 PlayerCombat.
// 공격자/방어자 양측 능력 전부 대칭 구현 (#282 풀-스코프, 능력 32종 + AP 시스템 미러).
//
// 차이점 (engine.ts 와):
//   - 양쪽 모두 PlayerCombat (Monster 없음). 두 사이드를 p1/p2 로 보관.
//   - Monster 전용 개념(phaseTrigger / 잡몹 skill heavy_blow|enrage|brace|pierce /
//     armorVulnerable / playerDefVulnerable) 은 제거. 두 플레이어의 특기·룬·AP스킬은
//     양쪽 모두에 대칭으로 적용. (포션은 PvP 디자인상 사용 불가 — 라우트가 미전달.)
//   - state.enemy.X → defender.player.X (현재 페이즈에서 방어자 측)
//   - state.buffs/flags/stacks/turn → attacker.buffs/flags/stacks/turn (현재 페이즈에서 공격자 측)
//   - 출혈 도트는 "공격자가 상대에게 쌓아둔 스택" 으로 attacker.stacks.bleedStacksOnOpponent 에 보관.
//     상대(defender) 턴 시작 시, attacker(=직전 페이즈에서 공격자였던 쪽) 의 bleedDmgPerStack 으로 도트 데미지.
//   - 승패: 양쪽 모두 HP 0 → 무승부(draw). 100턴(PVP_TURN_CAP) 초과 시 잔여 HP 비율 높은
//     쪽 승, 동률이면 draw. resolveBattlePvP 가 처리.
//
// 능력 범위 (대칭 — 양쪽에 동일 적용):
//   공격 측: 강공격, 분쇄, 암살, 약점적중, 광전사, 질풍검, 불굴의일격, 회전운기, 크리(천칭·
//     이중행운·만물행운), 처형, 행운의별, 천명, 충돌파, 연쇄운명, 연타, 광속, 풍사슬(5)/
//     무한풍사슬(6), 연참, 그림자 분신/군단, 무피해 난무, 막다른 격노, 약점 분석,
//     흡혈/행운의 흡혈/흡혈의 룬, 출혈 dot (방어자 턴 시작 시 적용).
//   방어 측: 그림자 보법, 회피 강화(보장 회피), 행운의 방패, 곡예(회피 시 힐), 반사 회피,
//     유격, 반격(counterAtkBonus), 가드, 굳건한 의지, 철벽 보호막 흡수, 불굴(HP 0 방어),
//     흡혈 갑옷, 반사 갑주, 가시 갑옷, 무한 가시 반사, 반격의 룬.
//
// 재사용:
//   - PlayerCombat / PlayerAction / BattleLogEntry / damageBetween / BattleTurnState 는
//     engine.ts 에서 import (단일 진실 공급원).

import {
  type PlayerCombat,
  type PlayerAction,
  type BattleLogEntry,
  type BattleTurnState,
  appendLog,
  damageBetween,
  DEF_IGNORE_FRACTION,
} from "./engine";
import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
} from "../data/stats";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "../data/potions";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  extractApEffect,
  potionHealAmount,
  resolveV2SkillCast,
  rollAttackCount,
  selectApSkillsToFire,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import {
  CRIT_MULT_BASE,
  ETERNAL_GALE_ABSOLUTE_CAP,
  GALE_CHAIN_MAX_PER_TURN,
  HEAVEN_DECREE_HP_PCT,
  IMPACT_WAVE_INTERVAL,
  LUCKY_STAR_DAMAGE_MULT,
  POWER_ATTACK_TURN_INTERVAL,
  RAMPAGE_START_TURN,
} from "../character/skills";
import {
  AP_BATTLE_START,
  AP_CAP,
  type APSkill,
  type APSkillCondition,
  type APSkillEffect,
} from "../character/apSkills";

// ── 타입 정의 ───────────────────────────────────────────────────────────────

export type PvPPhase = "p1" | "p2" | "ended";

export type PvPOutcome = "p1_win" | "p2_win" | "draw";

// 각 사이드별 1회성 토글. PvE 의 BattleFlags 와 비교해 Monster 전용(phaseTriggered, enrageTriggered) 제거.
export type PvPSideFlags = {
  enduranceTriggered: boolean;
  assassinateUsed: boolean;
  luckyBuffActive: boolean;
  fatedChainCritPending: boolean;
};

// 각 사이드별 누적 보너스/페널티. PvE 의 BattleBuffs 와 비교해 enemyDefBonus(phase trigger),
// enemyAtkBonus(enrage) 제거. enemyAtkPenalty/enemyDefPenalty 는 opponentAtkPenalty/opponentDefPenalty
// 로 의미 일관화 (이 사이드가 상대에게 적용한 페널티).
// AP 스킬 지속 효과 — 모두 "이 사이드 자신에게 걸린/이 사이드가 상대에게 건" 효과로 정의:
//   playerXxx     → 자기-효과 (결의/광기/폭주). 자기 공격/방어 시 사용.
//   enemyXxx      → 외향 효과 (약점노출/둔화). 자기 공격 시 사용.
//   enemyAttackBlockedCount → 방어용 카운터 (잔상). 상대가 공격해 올 때 소비.
//   enemySilenceTurnsLeft → 호환용 (PvP 는 몬스터 skill 없어 무효).
export type PvPSideBuffs = {
  rampageAtkBonus: number;
  opponentAtkPenalty: number;
  opponentDefPenalty: number;
  cyclingChiBonus: number;
  potionHealPct: number;
  // 결의 — 자기가 받는 피해 -pct% (defender 일 때 적용).
  playerDmgReductionPct: number;
  playerDmgReductionTurnsLeft: number;
  // 광기 — 자기 ATK +atkPct% / 자기 DEF -defPct%.
  playerAtkBuffPct: number;
  playerAtkBuffTurnsLeft: number;
  playerDefDebuffPct: number;
  playerDefDebuffTurnsLeft: number;
  // 폭주 — 자기 SPD ×mult.
  playerSpdMult: number;
  playerSpdTurnsLeft: number;
  // 약점 노출 — 공격 시 상대 DEF -pct%.
  enemyDefDebuffPct: number;
  enemyDefDebuffTurnsLeft: number;
  // 둔화 — SPD 비교에서 상대 SPD ×mult.
  enemySpdMult: number;
  enemySpdTurnsLeft: number;
  // 천뢰 — PvP 에선 무효 (몬스터 skill 없음) 하지만 호환용 보관.
  enemySilenceTurnsLeft: number;
  // 잔상 — 상대 공격 N회 무효 (defender 일 때 소비).
  enemyAttackBlockedCount: number;
  // 흡령 — 시한부 흡혈. 가한 데미지의 pct% 만큼 자가 회복. turnsLeft 0 이면 비활성.
  playerLifestealPct: number;
  playerLifestealTurnsLeft: number;
};

// 각 사이드별 가변 자원. bleedStacks → bleedStacksOnOpponent (이 사이드가 상대에게 쌓은 출혈).
export type PvPSideStacks = {
  bleedStacksOnOpponent: number;
  playerShield: number;
  evadesRemaining: number;
  damageTakenThisCombat: number;
  weakpointDefIgnoreLeft: number;
};

export type PvPSide = {
  player: PlayerCombat;
  name: string;
  hp: number;
  maxHp: number;
  // v2 마법 풀 — 일기토/토너먼트 매치 시작 시 풀충전 (PR-3·4). INT 0 = 둘 다 0.
  mp: number;
  maxMp: number;
  attacksLeft: number;
  // 유격 (skirmishNextTurnBonus) — 이 사이드가 회피 성공 시 누적, 다음 자기 공격 페이즈
  // 시작 시 attacksLeft 에 더해지고 0 으로 리셋. PvE 의 enemy phase 내 직접 가산을
  // PvP 에선 페이즈 분리 때문에 별도 슬롯이 필요.
  nextTurnAttackBonus: number;
  // AP 스킬 자원 — 매 공격 행동(명중/회피 무관) +1, cap=AP_CAP. 스킬 발동 시 cost 차감.
  // equippedAPSkills 미장착이면 0 으로 두고 회복/소비 노옵. PvE engine.ts:138 미러.
  ap: number;
  turn: BattleTurnState;
  flags: PvPSideFlags;
  buffs: PvPSideBuffs;
  stacks: PvPSideStacks;
  // v2 스킬 (v2_skill_*) — PR-4a framework. 라이브 spells.ts 와 별개. equipped 빈 배열이면 no-op.
  v2Skills: import("../data/v2/v2Skills").V2SkillsState;
  v2SkillCooldowns: import("./combatShared").V2SkillCooldowns;
  // v2 스킬 buff slot (PR-4b). pct 정수, turns 매 attacker turn 진입 시 -1.
  // v2SelfBuffs: 이 side 가 자기에게 건 강화. v2SelfDebuffs: 상대가 이 side 에 건 약화.
  v2SelfBuffs: import("./combatShared").V2BuffMap;
  v2SelfDebuffs: import("./combatShared").V2BuffMap;
  // PR-8 — DoT (지속 피해). 상대가 이 side 에 박은 dot. 매 자기 turn 진입 시 tick → hp 차감.
  v2Dots: import("./combatShared").V2Dot[];
};

export type PvPBattleState = {
  p1: PvPSide;
  p2: PvPSide;
  phase: PvPPhase;
  outcome: PvPOutcome | null;
  log: BattleLogEntry[];
};

// ── 유틸 ────────────────────────────────────────────────────────────────────

// 공격자가 마주하는 방어자의 effective DEF — analysis 누적 페널티(자기 측 buffs 에 기록) 차감.
// armorPierceFraction 비례 관통 적용. 분쇄/암살/약점은 호출 측에서 별도 처리.
// 약점 노출 (attacker 측 enemyDefDebuffPct) 활성 시 위 모든 감산 후 비례 차감.
// 광기 (defender 측 playerDefDebuffPct) 활성 시 방어자 자신의 effective DEF 더 깎임.
function attackerFacingDef(
  attacker: PvPSide,
  defender: PvPSide,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 attacker buffs 를 별도 인자로 받을 수 있음.
  // 기본은 attacker.buffs — 그 외 호출 측에서 applyTimedBuffFromApSkillPvP 결과를 전달.
  attackerBuffs: PvPSideBuffs = attacker.buffs,
): number {
  let raw = Math.max(0, defender.player.def - attackerBuffs.opponentDefPenalty);
  const frac = attacker.player.armorPierceFraction ?? 0;
  let afterPierce = frac > 0 ? Math.round(raw * (1 - frac)) : raw;
  if (
    defender.buffs.playerDefDebuffTurnsLeft > 0 &&
    defender.buffs.playerDefDebuffPct > 0
  ) {
    afterPierce = Math.round(
      afterPierce * (1 - defender.buffs.playerDefDebuffPct / 100),
    );
  }
  if (
    attackerBuffs.enemyDefDebuffTurnsLeft > 0 &&
    attackerBuffs.enemyDefDebuffPct > 0
  ) {
    afterPierce = Math.round(
      afterPierce * (1 - attackerBuffs.enemyDefDebuffPct / 100),
    );
  }
  return Math.max(0, afterPierce);
}

// AP 지속 효과 라운드 카운터 -1. 새 attacker 페이즈 진입 시 호출.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시.
function decrementTimedEffects(buffs: PvPSideBuffs): PvPSideBuffs {
  return {
    ...buffs,
    playerDmgReductionTurnsLeft: Math.max(0, buffs.playerDmgReductionTurnsLeft - 1),
    playerAtkBuffTurnsLeft: Math.max(0, buffs.playerAtkBuffTurnsLeft - 1),
    playerDefDebuffTurnsLeft: Math.max(0, buffs.playerDefDebuffTurnsLeft - 1),
    playerSpdTurnsLeft: Math.max(0, buffs.playerSpdTurnsLeft - 1),
    enemyDefDebuffTurnsLeft: Math.max(0, buffs.enemyDefDebuffTurnsLeft - 1),
    enemySpdTurnsLeft: Math.max(0, buffs.enemySpdTurnsLeft - 1),
    enemySilenceTurnsLeft: Math.max(0, buffs.enemySilenceTurnsLeft - 1),
    playerLifestealTurnsLeft: Math.max(0, buffs.playerLifestealTurnsLeft - 1),
  };
}

// AP 스킬이 set 하는 시한부 효과를 buffs 에 즉시 반영 — 발동턴 damage calc 부터 효과 받도록.
// engine.ts 의 applyTimedBuffFromApSkill PvP 미러. 회피된 공격에서는 호출하지 않음.
function applyTimedBuffFromApSkillPvP(
  buffs: PvPSideBuffs,
  apSkillFires: APSkill | null,
): PvPSideBuffs {
  if (!apSkillFires) return buffs;
  const e = apSkillFires.effect;
  switch (e.kind) {
    case "player_dmg_reduction_turns":
      return {
        ...buffs,
        playerDmgReductionPct: e.pct,
        playerDmgReductionTurnsLeft: e.turns,
      };
    case "enemy_def_debuff_pct_turns":
      return {
        ...buffs,
        enemyDefDebuffPct: e.pct,
        enemyDefDebuffTurnsLeft: e.turns,
      };
    case "player_atk_buff_def_debuff_pct_turns":
      return {
        ...buffs,
        playerAtkBuffPct: e.atkPct,
        playerAtkBuffTurnsLeft: e.turns,
        playerDefDebuffPct: e.defPct,
        playerDefDebuffTurnsLeft: e.turns,
      };
    case "enemy_spd_mult_turns":
      return {
        ...buffs,
        enemySpdMult: e.mult,
        enemySpdTurnsLeft: e.turns,
      };
    case "player_spd_mult_turns":
      return {
        ...buffs,
        playerSpdMult: e.mult,
        playerSpdTurnsLeft: e.turns,
      };
    case "atk_multiplier_with_silence":
      return {
        ...buffs,
        enemySilenceTurnsLeft: e.silenceTurns,
      };
    case "cleanse_debuffs":
      return {
        ...buffs,
        playerDefDebuffPct: 0,
        playerDefDebuffTurnsLeft: 0,
      };
    case "block_next_enemy_attack":
      return {
        ...buffs,
        enemyAttackBlockedCount: buffs.enemyAttackBlockedCount + e.count,
      };
    case "lifesteal_dmg_pct_turns":
      return {
        ...buffs,
        playerLifestealPct: e.pct,
        playerLifestealTurnsLeft: e.turns,
      };
    default:
      return buffs;
  }
}

// 한 스킬 효과가 lingering 상태인지 — no_self_effect_active 조건이 사용.
// engine.ts:isAPSkillEffectActive 의 PvP 미러. 필드 매핑만 attacker side 기준으로 변경.
function isAPEffectActiveOnAttacker(
  effect: APSkillEffect,
  attacker: PvPSide,
): boolean {
  switch (effect.kind) {
    case "atk_multiplier":
    case "heal_pct":
    case "atk_multiplier_with_silence":
    case "multi_hit_self_damage":
    case "atk_plus_spd_pct_bonus":
    case "cleanse_debuffs":
    case "crit_buff_next_attack":
    case "extra_attack_this_turn":
      return false;
    case "apply_bleed":
      return attacker.stacks.bleedStacksOnOpponent > 0;
    case "add_guaranteed_evades":
      return attacker.stacks.evadesRemaining > 0;
    case "player_dmg_reduction_turns":
      return attacker.buffs.playerDmgReductionTurnsLeft > 0;
    case "enemy_def_debuff_pct_turns":
      return attacker.buffs.enemyDefDebuffTurnsLeft > 0;
    case "player_atk_buff_def_debuff_pct_turns":
      return (
        attacker.buffs.playerAtkBuffTurnsLeft > 0 ||
        attacker.buffs.playerDefDebuffTurnsLeft > 0
      );
    case "enemy_spd_mult_turns":
      return attacker.buffs.enemySpdTurnsLeft > 0;
    case "player_spd_mult_turns":
      return attacker.buffs.playerSpdTurnsLeft > 0;
    case "queued_extra_attacks_next_turn":
      return attacker.turn.queuedExtraAttacks > 0;
    case "block_next_enemy_attack":
      return attacker.buffs.enemyAttackBlockedCount > 0;
    case "lifesteal_dmg_pct_turns":
      return attacker.buffs.playerLifestealTurnsLeft > 0;
  }
}

// 슬롯별 발동 조건 평가 — engine.ts:evaluateAPSkillCondition 의 PvP 어댑터.
// state.playerHp/enemyHp 등은 attacker/defender 사이드로 매핑.
function evaluateAPSkillConditionPvP(
  condition: APSkillCondition,
  attacker: PvPSide,
  defender: PvPSide,
  skill: APSkill,
): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "ap_at_least":
      return attacker.ap >= condition.value;
    case "ap_at_most":
      return attacker.ap <= condition.value;
    case "hp_below_pct":
      return attacker.maxHp > 0
        ? (attacker.hp / attacker.maxHp) * 100 < condition.value
        : false;
    case "hp_above_pct":
      return attacker.maxHp > 0
        ? (attacker.hp / attacker.maxHp) * 100 >= condition.value
        : false;
    case "enemy_hp_below_pct":
      return defender.maxHp > 0
        ? (defender.hp / defender.maxHp) * 100 < condition.value
        : false;
    case "enemy_hp_above_pct":
      return defender.maxHp > 0
        ? (defender.hp / defender.maxHp) * 100 >= condition.value
        : false;
    case "every_n_turns": {
      const n = Math.max(1, Math.floor(condition.value));
      return attacker.turn.completedPlayerTurns % n === 0;
    }
    case "enemy_max_hp_at_least":
      return defender.maxHp >= condition.value;
    case "no_self_effect_active":
      return !isAPEffectActiveOnAttacker(skill.effect, attacker);
  }
}

// 공격자가 가하는 effective ATK — analysis 페널티는 방어자 측 buffs 에 기록 (이 사이드의 적이 나에게
// 적용한 페널티). 그래서 effectiveAtk = attacker.atk - defender.buffs.opponentAtkPenalty.
// 자신 ATK + 광기(AP 시한부 ATK 버프) — 분신·난무·반사회피 raw 추정용 헬퍼.
function attackerAtkWithMadness(attacker: PvPSide): number {
  const buffPct =
    attacker.buffs.playerAtkBuffTurnsLeft > 0 ? attacker.buffs.playerAtkBuffPct : 0;
  const bonus = buffPct > 0 ? Math.floor((attacker.player.atk * buffPct) / 100) : 0;
  return attacker.player.atk + bonus;
}

function effectiveAttackerAtk(attacker: PvPSide, defender: PvPSide): number {
  return Math.max(
    0,
    attackerAtkWithMadness(attacker) +
      attacker.buffs.rampageAtkBonus -
      defender.buffs.opponentAtkPenalty,
  );
}

// 사이드 갱신 헬퍼 — p1 또는 p2 슬롯에 새 사이드 객체 박기.
function setSide(
  state: PvPBattleState,
  which: "p1" | "p2",
  next: PvPSide,
): PvPBattleState {
  return which === "p1" ? { ...state, p1: next } : { ...state, p2: next };
}

// 현 phase 에서 (attacker, defender) 키 결정.
function actorKeys(phase: PvPPhase): { atkKey: "p1" | "p2"; defKey: "p1" | "p2" } {
  if (phase === "p1") return { atkKey: "p1", defKey: "p2" };
  return { atkKey: "p2", defKey: "p1" };
}

// ── 초기화 ──────────────────────────────────────────────────────────────────

function buildSide(
  player: PlayerCombat,
  name: string,
  v2Skills: import("../data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
): PvPSide {
  const startShield = player.bulwarkShield ?? 0;
  const sideMaxMp = Math.max(0, player.maxMp ?? 0);
  return {
    player,
    name,
    v2Skills,
    v2SkillCooldowns: {},
    v2SelfBuffs: {},
    v2SelfDebuffs: {},
    v2Dots: [],
    hp: player.hp,
    maxHp: player.maxHp,
    mp: sideMaxMp, // 매치 시작 풀충전 (단판 모델). 토너먼트는 매치마다 다시 풀충전.
    maxMp: sideMaxMp,
    attacksLeft: 0, // initialBattleStatePvP 에서 선공 측만 채움
    nextTurnAttackBonus: 0,
    ap: (player.equippedAPSkills?.length ?? 0) > 0 ? AP_BATTLE_START : 0,
    turn: {
      completedPlayerTurns: 0,
      enemyPhasesCompleted: 0,
      firstAttackPending: true,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      galeChainsThisTurn: 0,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
      apSkillFiredThisTurn: null,
      focusedBreathCritDmgBonusPct: 0,
      queuedExtraAttacks: 0,
      // PvP 엔진은 양쪽 player 라 enemy phase 자체가 없음 — 필드만 채워 BattleTurnState 형식 만족.
      enemyAttacksLeft: 0,
    },
    flags: {
      enduranceTriggered: false,
      assassinateUsed: false,
      luckyBuffActive: false,
      fatedChainCritPending: false,
    },
    buffs: {
      rampageAtkBonus: 0,
      opponentAtkPenalty: 0,
      opponentDefPenalty: 0,
      cyclingChiBonus: 0,
      potionHealPct: player.potionHealPct ?? 0,
      playerDmgReductionPct: 0,
      playerDmgReductionTurnsLeft: 0,
      playerAtkBuffPct: 0,
      playerAtkBuffTurnsLeft: 0,
      playerDefDebuffPct: 0,
      playerDefDebuffTurnsLeft: 0,
      playerSpdMult: 1,
      playerSpdTurnsLeft: 0,
      enemyDefDebuffPct: 0,
      enemyDefDebuffTurnsLeft: 0,
      enemySpdMult: 1,
      enemySpdTurnsLeft: 0,
      enemySilenceTurnsLeft: 0,
      enemyAttackBlockedCount: 0,
      playerLifestealPct: 0,
      playerLifestealTurnsLeft: 0,
    },
    stacks: {
      bleedStacksOnOpponent: 0,
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
    },
  };
}

// 선공 — SPD 가 높은 쪽이 먼저. 동점이면 p1 우선.
export function initialBattleStatePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  p1Skills: import("../data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  p2Skills: import("../data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
): PvPBattleState {
  const p1Side = buildSide(p1Player, p1Name, p1Skills);
  const p2Side = buildSide(p2Player, p2Name, p2Skills);
  const p1First = p1Player.spd >= p2Player.spd;
  const phase: PvPPhase = p1First ? "p1" : "p2";
  const initiator = p1First ? p1Name : p2Name;
  const log: BattleLogEntry[] = [
    { kind: "info", text: `${p1Name} 와(과) ${p2Name} 가 마주섰다.` },
    { kind: "info", text: `${initiator}의 선공.` },
  ];
  // 선공자 첫 턴 공격 횟수 세팅 + 기습 보너스.
  const firstAttacker = p1First ? p1Side : p2Side;
  const otherSide = p1First ? p2Side : p1Side;
  const vanguardBonus = firstAttacker.player.vanguardFirstTurnBonus ?? 0;
  if (vanguardBonus > 0) {
    log.push({
      kind: "info",
      text: `[기습] ${firstAttacker.name} 첫 턴 추가 공격 ${vanguardBonus}회!`,
    });
  }
  const attackerWithCount: PvPSide = {
    ...firstAttacker,
    attacksLeft: rollAttackCount(firstAttacker.player) + vanguardBonus,
  };
  // 철벽 보호막 알림 — 양쪽 다 표기.
  if (p1Side.stacks.playerShield > 0) {
    log.push({
      kind: "info",
      text: `[철벽] ${p1Side.name} 보호막 ${p1Side.stacks.playerShield} 전개`,
    });
  }
  if (p2Side.stacks.playerShield > 0) {
    log.push({
      kind: "info",
      text: `[철벽] ${p2Side.name} 보호막 ${p2Side.stacks.playerShield} 전개`,
    });
  }
  return {
    p1: p1First ? attackerWithCount : otherSide,
    p2: p1First ? otherSide : attackerWithCount,
    phase,
    outcome: null,
    log,
  };
}

// ── 헬퍼 — 사이드 mutate 패턴들 ────────────────────────────────────────────

// 재생 (regen) — completedPlayerTurns 가 interval 배수일 때 HP +amount.
function applyRegen(state: PvPBattleState, key: "p1" | "p2"): PvPBattleState {
  const side = state[key];
  const r = side.player.regen;
  if (!r || r.interval <= 0 || r.amount <= 0) return state;
  if (side.turn.completedPlayerTurns === 0) return state;
  if (side.turn.completedPlayerTurns % r.interval !== 0) return state;
  if (side.hp >= side.maxHp) return state;
  const newHp = Math.min(side.maxHp, side.hp + r.amount);
  const actual = newHp - side.hp;
  let next = setSide(state, key, { ...side, hp: newHp });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `[재생] ${side.name}의 HP +${actual}`,
    }),
  };
  return next;
}

// 자연회복 (baselineRegen) — 같은 로직, 다른 슬롯.
function applyBaselineRegen(
  state: PvPBattleState,
  key: "p1" | "p2",
): PvPBattleState {
  const side = state[key];
  const r = side.player.baselineRegen;
  if (!r || r.interval <= 0 || r.amount <= 0) return state;
  if (side.turn.completedPlayerTurns === 0) return state;
  if (side.turn.completedPlayerTurns % r.interval !== 0) return state;
  if (side.hp >= side.maxHp) return state;
  const newHp = Math.min(side.maxHp, side.hp + r.amount);
  const actual = newHp - side.hp;
  let next = setSide(state, key, { ...side, hp: newHp });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `[자연회복] ${side.name}의 HP +${actual}`,
    }),
  };
  return next;
}

// 부가 공격 1회 (분신/난무) — 본인 빌드로 발동시킨 추가타라 "**모든 공격**" / "**매 공격마다**"
// 효과는 함께 적용: 출혈 +1, 행운의 별 ×배수, 천명 %HP, 흡혈류 (비크리 기반만).
// 미적용: 크리/강공격/충돌파/약점적중/연참/연쇄운명/암살/AP 스킬 발동, AP +1 (페이싱 보호).
// 자동 반사(반격/가시/반사 회피) 는 별도 경로. 본 헬퍼는 engine.ts 의 dealExtraEnemyDamage 미러.
function dealExtraDamage(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  baseDmg: number,
  label: string,
): PvPBattleState {
  const attacker = state[atkKey];
  const defender = state[defKey];
  const player = attacker.player;
  // 행운의 별.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(baseDmg * LUCKY_STAR_DAMAGE_MULT)
    : baseDmg;
  // 천명 — defender 현재 HP %. PvP 에는 boss 감산 없음.
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < player.heavenDecreeChancePct!;
  const decreeDmg = decreeFires
    ? Math.floor((defender.hp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const totalDmg = dmgAfterLuckyStar + decreeDmg;
  const newDefHp = Math.max(0, defender.hp - totalDmg);
  // 흡혈류 — 비크리 기반만 (luckyLifesteal / runeLifesteal / 흡령).
  const luckyLifestealHeal =
    (player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.luckyLifestealPct!) / 100)
      : 0;
  const runeLifestealHeal =
    (player.runeLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.runeLifestealPct!) / 100)
      : 0;
  const apLifestealHeal =
    attacker.buffs.playerLifestealTurnsLeft > 0 &&
    attacker.buffs.playerLifestealPct > 0
      ? Math.floor((totalDmg * attacker.buffs.playerLifestealPct) / 100)
      : 0;
  const totalHeal = luckyLifestealHeal + runeLifestealHeal + apLifestealHeal;
  const newAtkHp =
    totalHeal > 0 ? Math.min(attacker.maxHp, attacker.hp + totalHeal) : attacker.hp;
  const actualHeal = newAtkHp - attacker.hp;
  // 출혈 +1 (attacker 가 defender 에 누적).
  const newBleedOnOpponent =
    (player.bleedDmgPerStack ?? 0) > 0
      ? attacker.stacks.bleedStacksOnOpponent + 1
      : attacker.stacks.bleedStacksOnOpponent;

  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");

  let next = setSide(state, defKey, { ...defender, hp: newDefHp });
  next = setSide(next, atkKey, {
    ...next[atkKey],
    hp: newAtkHp,
    stacks: { ...next[atkKey].stacks, bleedStacksOnOpponent: newBleedOnOpponent },
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "player_attack",
      text: `[${dmgLabels.join(" + ")}] ${totalDmg} 피해를 입혔다.`,
    }),
  };
  if (actualHeal > 0) {
    const healLabels: string[] = [];
    if (luckyLifestealHeal > 0) healLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) healLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) healLabels.push("흡령");
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[${healLabels.join(" + ")}] ${attacker.name}의 HP +${actualHeal}`,
      }),
    };
  }
  if (newDefHp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${defender.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: atkKey === "p1" ? "p1_win" : "p2_win",
    };
  }
  return next;
}

// ── 방어자 측 dodge 헬퍼 ────────────────────────────────────────────────────

// dodge 한 번에 발생하는 효과들 — 곡예(힐) → 보장 회피 소비(옵션) → 무한 가시 + 반사 회피
// → 반격(counterAtkBonus) → 유격(skirmishNextTurnBonus 누적). 어느 단계에서 공격자가 죽으면
// phase=ended 로 종료. 호출 측은 ended 여부 확인 후 attacksLeft 차감 또는 phase 종료를 결정.
function applyDodgeEffects(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  dodgeLogText: string,
  consumeEvade: boolean,
): PvPBattleState {
  let st: PvPBattleState = {
    ...state,
    log: appendLog(state.log, { kind: "info", text: dodgeLogText }),
  };
  if (st.phase === "ended") return st;
  // 곡예 — 회피 성공 시 HP +amount.
  const defForHeal = st[defKey];
  const evadeHeal = defForHeal.player.evadeHealAmount ?? 0;
  if (evadeHeal > 0 && defForHeal.hp < defForHeal.maxHp) {
    const newHp = Math.min(defForHeal.maxHp, defForHeal.hp + evadeHeal);
    const actual = newHp - defForHeal.hp;
    st = setSide(st, defKey, { ...defForHeal, hp: newHp });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[곡예] ${defForHeal.name}의 HP +${actual}`,
      }),
    };
  }
  // 보장 회피 소비 (회피 강화 분기에서만).
  if (consumeEvade) {
    const d = st[defKey];
    if (d.stacks.evadesRemaining > 0) {
      st = setSide(st, defKey, {
        ...d,
        stacks: {
          ...d.stacks,
          evadesRemaining: d.stacks.evadesRemaining - 1,
        },
      });
    }
  }
  // 무한 가시 + 반사 회피 — 적 ATK 기반 / 추정 raw 데미지 기반 반사.
  const attackerNow = st[atkKey];
  const defenderNow = st[defKey];
  const infiniteThornsPct = defenderNow.player.infiniteThornsAtkPct ?? 0;
  const infiniteThornsDmg =
    infiniteThornsPct > 0
      ? Math.floor((attackerNow.player.atk * infiniteThornsPct) / 100)
      : 0;
  const reflexEvadeMult = defenderNow.player.reflexEvadeMult ?? 0;
  // PR-5a: v2 buff/debuff 격리 해제 — 반사 회피 추정도 일관 적용.
  // attackerNow 가 공격자, defenderNow 가 방어자.
  const v2AtkMultR = v2AtkBuffMult(attackerNow.v2SelfBuffs, attackerNow.v2SelfDebuffs);
  const v2DefMultR = v2DefBuffMult(defenderNow.v2SelfBuffs, defenderNow.v2SelfDebuffs);
  const estimatedRawDmg =
    reflexEvadeMult > 0
      ? damageBetween(
          v2AtkMultR !== 1
            ? Math.floor(effectiveAttackerAtk(attackerNow, defenderNow) * v2AtkMultR)
            : effectiveAttackerAtk(attackerNow, defenderNow),
          v2DefMultR !== 1
            ? Math.floor(defenderNow.player.def * v2DefMultR)
            : defenderNow.player.def,
        )
      : 0;
  const reflexEvadeDmg =
    reflexEvadeMult > 0 ? Math.floor(estimatedRawDmg * reflexEvadeMult) : 0;
  const totalReflect = infiniteThornsDmg + reflexEvadeDmg;
  if (totalReflect > 0) {
    const newAtkHp = Math.max(0, attackerNow.hp - totalReflect);
    st = setSide(st, atkKey, { ...attackerNow, hp: newAtkHp });
    const labels: string[] = [];
    if (infiniteThornsDmg > 0) labels.push("무한 가시");
    if (reflexEvadeDmg > 0) labels.push("반사 회피");
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "player_attack",
        text: `[${labels.join(" + ")}] ${attackerNow.name}에게 ${totalReflect} 반사 피해.`,
      }),
    };
    if (newAtkHp <= 0) {
      return {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `${attackerNow.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: defKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  }
  // 반격 (counterAtkBonus) — 회피 성공 시 ATK + bonus 데미지로 카운터 1회.
  const attackerAfterReflect = st[atkKey];
  const counterBonus = defenderNow.player.counterAtkBonus ?? 0;
  if (counterBonus > 0) {
    // PR-5a: 반격도 v2 buff/debuff 격리 해제. defender 가 공격자, attacker 가 방어자 (반격 방향).
    const v2AtkMultCt = v2AtkBuffMult(defenderNow.v2SelfBuffs, defenderNow.v2SelfDebuffs);
    const v2DefMultCt = v2DefBuffMult(
      attackerAfterReflect.v2SelfBuffs,
      attackerAfterReflect.v2SelfDebuffs,
    );
    const counterRawAtk = defenderNow.player.atk + counterBonus;
    const counterDmg = damageBetween(
      v2AtkMultCt !== 1 ? Math.floor(counterRawAtk * v2AtkMultCt) : counterRawAtk,
      v2DefMultCt !== 1
        ? Math.floor(attackerAfterReflect.player.def * v2DefMultCt)
        : attackerAfterReflect.player.def,
    );
    const newAtkHp = Math.max(0, attackerAfterReflect.hp - counterDmg);
    st = setSide(st, atkKey, { ...attackerAfterReflect, hp: newAtkHp });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "player_attack",
        text: `[반격] ${attackerAfterReflect.name}에게 ${counterDmg} 피해.`,
      }),
    };
    if (newAtkHp <= 0) {
      return {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `${attackerAfterReflect.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: defKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  }
  // 유격 — 회피 성공 시 다음 자기 페이즈 공격 횟수 +N (nextTurnAttackBonus 에 누적).
  const skirmishBonus = defenderNow.player.skirmishNextTurnBonus ?? 0;
  if (skirmishBonus > 0) {
    const d = st[defKey];
    st = setSide(st, defKey, {
      ...d,
      nextTurnAttackBonus: d.nextTurnAttackBonus + skirmishBonus,
    });
  }
  return st;
}

// 회피된 attacker 의 AP +1 (행동 시도는 명중/회피 무관히 +1). engine.ts:687 미러.
// equippedAPSkills 없으면 ap=0 유지로 무해. 회피 시 apSkillFires 는 발동/소비 안 함.
function bumpAttackerAp(state: PvPBattleState, atkKey: "p1" | "p2"): PvPBattleState {
  const a = state[atkKey];
  return setSide(state, atkKey, { ...a, ap: Math.min(AP_CAP, a.ap + 1) });
}

// shadowStep dodge — 한 페이즈 통째로 회피 + dodge 효과 + 페이즈 종료.
function applyShadowStepDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): PvPBattleState {
  const defender = state[defKey];
  const dodged = applyDodgeEffects(
    bumpAttackerAp(state, atkKey),
    atkKey,
    defKey,
    `[그림자 보법] ${defender.name}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    false,
  );
  if (dodged.phase === "ended") return dodged;
  return endAttackerPhase(dodged, atkKey, defKey);
}

// per-attack dodge — dodge 효과 + 공격 횟수 1 차감. attacksLeft 0 이면 페이즈 종료.
function applyPerAttackDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  logText: string,
  consumeEvade: boolean,
): PvPBattleState {
  const dodged = applyDodgeEffects(
    bumpAttackerAp(state, atkKey),
    atkKey,
    defKey,
    logText,
    consumeEvade,
  );
  if (dodged.phase === "ended") return dodged;
  const attacker = dodged[atkKey];
  const newAttacksLeft = attacker.attacksLeft - 1;
  if (newAttacksLeft > 0) {
    return setSide(dodged, atkKey, {
      ...attacker,
      attacksLeft: newAttacksLeft,
      turn: { ...attacker.turn, firstAttackPending: false },
    });
  }
  return endAttackerPhase(dodged, atkKey, defKey);
}

// 데미지 적중 시 반사 (반사 갑주 + 가시 갑옷 + 무한 가시). 공격자가 죽으면 attackerKilled=true.
// 반사 갑주/가시 갑옷 베이스는 공격자가 넣은 피해(결의/가드/굳건/철벽 감산 전, 모든 공격 보너스 후) —
// 탱커 빌드가 막으면서 동시에 반사할 수 있도록.
function applyOnHitReflect(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  rawDmgBeforeMitigation: number,
): { state: PvPBattleState; attackerKilled: boolean } {
  const attacker = state[atkKey];
  const defender = state[defKey];
  const thornsPct = defender.player.thornsPct ?? 0;
  const thornsDmg =
    thornsPct > 0
      ? Math.floor((rawDmgBeforeMitigation * thornsPct) / 100)
      : 0;
  const bramblePct = defender.player.bramblePct ?? 0;
  const brambleDmg =
    bramblePct > 0
      ? Math.floor((rawDmgBeforeMitigation * bramblePct) / 100)
      : 0;
  const infinitePct = defender.player.infiniteThornsAtkPct ?? 0;
  const infiniteDmg =
    infinitePct > 0 ? Math.floor((attacker.player.atk * infinitePct) / 100) : 0;
  const total = thornsDmg + brambleDmg + infiniteDmg;
  if (total <= 0) return { state, attackerKilled: false };
  const newAtkHp = Math.max(0, attacker.hp - total);
  let st = setSide(state, atkKey, { ...attacker, hp: newAtkHp });
  const labels: string[] = [];
  if (thornsDmg > 0) labels.push("반사 갑주");
  if (brambleDmg > 0) labels.push("가시 갑옷");
  if (infiniteDmg > 0) labels.push("무한 가시");
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[${labels.join(" + ")}] ${attacker.name}에게 ${total} 반사 피해.`,
    }),
  };
  if (newAtkHp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

// 반격의 룬 — 피격 후 일정 확률로 카운터 1회 (ATK 데미지). 공격자가 죽으면 attackerKilled=true.
function maybeApplyRuneCounter(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): { state: PvPBattleState; attackerKilled: boolean } {
  const defender = state[defKey];
  const attacker = state[atkKey];
  const pct = defender.player.runeCounterChancePct ?? 0;
  if (pct <= 0 || Math.random() * 100 >= pct) {
    return { state, attackerKilled: false };
  }
  // PR-5a: 룬 반격도 v2 buff/debuff 격리 해제. defender 공격자, attacker 방어자.
  const v2AtkMultRC = v2AtkBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2DefMultRC = v2DefBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const rcAtk = effectiveAttackerAtk(defender, attacker);
  const rcDef = attackerFacingDef(defender, attacker);
  const dmg = damageBetween(
    v2AtkMultRC !== 1 ? Math.floor(rcAtk * v2AtkMultRC) : rcAtk,
    v2DefMultRC !== 1 ? Math.floor(rcDef * v2DefMultRC) : rcDef,
  );
  const newAtkHp = Math.max(0, attacker.hp - dmg);
  let st = setSide(state, atkKey, { ...attacker, hp: newAtkHp });
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[반격의 룬] ${attacker.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  if (newAtkHp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

// 공격 턴 종료 후 처리 — 그림자 분신 → 무피해 난무 → 막다른 격노 → 약점 분석 → 재생/자연회복.
// PvE 의 finishPlayerTurn 미러.
function finishAttackerTurn(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): PvPBattleState {
  let st = state;
  const attacker = st[atkKey];
  // PR-5a: 분신·난무 모두 v2 buff/debuff 격리 해제 적용. PvP 는 매 호출마다 atk/def state 가
  // 바뀔 수 있어 (dealExtraDamage 가 hp 만 변경하므로 buff/debuff map 은 보존) 안전.
  const applyV2AtkPvP = (rawAtk: number, atkSide: PvPSide): number => {
    const m = v2AtkBuffMult(atkSide.v2SelfBuffs, atkSide.v2SelfDebuffs);
    return m !== 1 ? Math.floor(rawAtk * m) : rawAtk;
  };
  const applyV2DefPvP = (rawDef: number, defSide: PvPSide): number => {
    const m = v2DefBuffMult(defSide.v2SelfBuffs, defSide.v2SelfDebuffs);
    return m !== 1 ? Math.floor(rawDef * m) : rawDef;
  };
  // 그림자 분신 + 6티어 군단.
  const clonePct = attacker.player.shadowCloneAtkPct ?? 0;
  const cloneExtra = attacker.player.shadowLegionExtraClones ?? 0;
  const cloneCount = clonePct > 0 ? 1 + cloneExtra : 0;
  if (st.phase !== "ended" && cloneCount > 0) {
    for (let i = 0; i < cloneCount; i += 1) {
      if (st.phase === "ended") break;
      const atk = st[atkKey];
      const def = st[defKey];
      const cloneDmg = damageBetween(
        applyV2AtkPvP(Math.floor((attackerAtkWithMadness(atk) * clonePct) / 100), atk),
        applyV2DefPvP(attackerFacingDef(atk, def), def),
      );
      st = dealExtraDamage(
        st,
        atkKey,
        defKey,
        cloneDmg,
        cloneExtra > 0 ? "그림자 군단" : "그림자 분신",
      );
    }
  }
  // 무피해 난무.
  const attackerAfter = st[atkKey];
  const flurry = attackerAfter.player.flurryAttacks ?? 0;
  if (
    st.phase !== "ended" &&
    flurry > 0 &&
    attackerAfter.stacks.damageTakenThisCombat === 0
  ) {
    for (let i = 0; i < flurry; i += 1) {
      if (st.phase === "ended") break;
      const atk = st[atkKey];
      const def = st[defKey];
      const fd = damageBetween(
        applyV2AtkPvP(effectiveAttackerAtk(atk, def), atk),
        applyV2DefPvP(attackerFacingDef(atk, def), def),
      );
      st = dealExtraDamage(st, atkKey, defKey, fd, "무피해 난무");
    }
  }
  if (st.phase === "ended") return st;
  // 막다른 격노 (5티어) — completedPlayerTurns >= RAMPAGE_START_TURN 후, 매 턴 종료 시 ATK 누적.
  const rampage = st[atkKey].player.rampagePerTurn ?? 0;
  if (rampage > 0 && st[atkKey].turn.completedPlayerTurns >= RAMPAGE_START_TURN) {
    const side = st[atkKey];
    const nextBonus = side.buffs.rampageAtkBonus + rampage;
    st = setSide(st, atkKey, {
      ...side,
      buffs: { ...side.buffs, rampageAtkBonus: nextBonus },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[막다른 격노] ${side.name} ATK +${rampage} (누적 +${nextBonus})`,
      }),
    };
  }
  // 약점 분석 (5티어) — 매 턴 종료 시 상대 ATK/DEF 페널티 +N (자기 buffs 에 기록).
  const analysis = st[atkKey].player.analysisPerTurn ?? 0;
  if (analysis > 0) {
    const side = st[atkKey];
    const nextAtkPen = side.buffs.opponentAtkPenalty + analysis;
    const nextDefPen = side.buffs.opponentDefPenalty + analysis;
    st = setSide(st, atkKey, {
      ...side,
      buffs: {
        ...side.buffs,
        opponentAtkPenalty: nextAtkPen,
        opponentDefPenalty: nextDefPen,
      },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[약점 분석] ${st[defKey].name} ATK·DEF -${analysis} (누적 -${nextAtkPen}/-${nextDefPen})`,
      }),
    };
  }
  st = applyBaselineRegen(st, atkKey);
  st = applyRegen(st, atkKey);
  return st;
}

// ── 메인 advanceTurn ─────────────────────────────────────────────────────────

export function advanceTurnPvP(
  state: PvPBattleState,
  action: PlayerAction = { kind: "attack" },
): PvPBattleState {
  if (state.phase === "ended") return state;
  const { atkKey, defKey } = actorKeys(state.phase);

  // 새 attacker 턴 진입 시 timed 효과 -1 + 빛의 활공 큐 소비.
  // turn 1 (completedPlayerTurns=0) 은 가드 — 발동된 적 없음. endAttackerPhase 가 다음 공격자의
  // attacksLeft 에 rollAttackCount + nextTurnAttackBonus 만 더해두므로 큐 소비는 여기서.
  if (
    state[atkKey].turn.firstAttackPending &&
    state[atkKey].turn.completedPlayerTurns > 0
  ) {
    const a = state[atkKey];
    const consumeQueued = a.turn.queuedExtraAttacks;
    state = setSide(state, atkKey, {
      ...a,
      attacksLeft: a.attacksLeft + consumeQueued,
      buffs: decrementTimedEffects(a.buffs),
      turn: { ...a.turn, queuedExtraAttacks: 0 },
    });
  }

  // ── 공격 페이즈 ──────────────────────────────────────────────────────────
  // 공격자의 모든 공격을 처리 → 마지막 공격 후 연타/광속/풍사슬/연참 체크 → 끝나면 상대 페이즈로.
  // 포션 사용은 한 번 마시고 즉시 페이즈 종료.

  if (action.kind === "use_potion") {
    let st = applyPotionTo(state, atkKey, action.potion);
    const a = st[atkKey];
    st = setSide(st, atkKey, {
      ...a,
      attacksLeft: rollAttackCount(a.player),
      turn: { ...a.turn, firstAttackPending: true },
    });
    return endAttackerPhase(st, atkKey, defKey);
  }

  const attacker = state[atkKey];
  const defender = state[defKey];

  // 강공격 — POWER_ATTACK_TURN_INTERVAL 턴마다 첫 공격에 ATK + powerAttackBonus.
  const turnNumber = attacker.turn.completedPlayerTurns + 1;
  const isFirstAttackOfTurn = attacker.turn.firstAttackPending;
  const powerBonus =
    isFirstAttackOfTurn &&
    turnNumber % POWER_ATTACK_TURN_INTERVAL === 0 &&
    (attacker.player.powerAttackBonus ?? 0) > 0
      ? attacker.player.powerAttackBonus!
      : 0;

  // AP 스킬 — 그 턴 첫 공격 명중에 슬롯 순서로 최대 3개 발동. 공격형은 최대 1개.
  const apSel =
    isFirstAttackOfTurn &&
    attacker.turn.apSkillFiredThisTurn === null &&
    (attacker.player.equippedAPSkills?.length ?? 0) > 0
      ? selectApSkillsToFire(
          attacker.player.equippedAPSkills!,
          {
            canFireApSkill: (e) =>
              evaluateAPSkillConditionPvP(e.condition, attacker, defender, e.skill),
          },
          attacker.ap,
        )
      : { offensive: null, utilities: [], totalCost: 0 };
  const apOffensiveFires = apSel.offensive;
  const apUtilityFires = apSel.utilities;
  const apAllFired = apOffensiveFires
    ? [apOffensiveFires, ...apUtilityFires]
    : apUtilityFires;
  const apOffensiveSkill = apOffensiveFires?.skill ?? null;
  const apAllFiredSkills = apAllFired.map((e) => e.skill);
  // atk_multiplier 계열 — 광살참(multi_hit_self_damage) / 천뢰(atk_multiplier_with_silence)
  // 도 atkMult/ignoresDef/ignoresEvasion 공유.
  // apMultEffect 는 아래(atk_plus_spd_pct_bonus·multi_hit_self_damage 자해)에서도 쓰여 유지.
  // 파생은 combatShared.extractApEffect 로 단일화 — PvE 엔진과 공유(divergence 방지).
  const apMultEffect = apOffensiveSkill?.effect;
  const {
    atkMult: apAtkMult,
    ignoresDef: apIgnoresDef,
    ignoresEvasion: apIgnoresEvasion,
    hits: apHits,
  } = extractApEffect(apMultEffect);

  // ── 잔상 (defender 측 enemyAttackBlockedCount) ────────────────────────────
  // 방어자가 직전 자기 페이즈에서 잔상을 발동했으면, 이번 공격을 통째 무효. 1회 소비.
  // dodge cascade 보다 우선 (가장 강력한 회피). AP 회복은 행동 시도이므로 +1.
  if (defender.buffs.enemyAttackBlockedCount > 0) {
    const blockedLog = appendLog(state.log, {
      kind: "info",
      text: `[잔상] ${defender.name} — ${attacker.name}의 공격이 잔상을 베었다.`,
    });
    const nextAttacker: PvPSide = {
      ...attacker,
      ap: Math.min(AP_CAP, attacker.ap + 1),
      attacksLeft: attacker.attacksLeft - 1,
      turn: { ...attacker.turn, firstAttackPending: false },
    };
    const nextDefender: PvPSide = {
      ...defender,
      buffs: {
        ...defender.buffs,
        enemyAttackBlockedCount: defender.buffs.enemyAttackBlockedCount - 1,
      },
    };
    let nextSt = setSide(
      setSide({ ...state, log: blockedLog }, atkKey, nextAttacker),
      defKey,
      nextDefender,
    );
    if (nextAttacker.attacksLeft > 0) return nextSt;
    return endAttackerPhase(nextSt, atkKey, defKey);
  }

  // ── 방어자 dodge cascade ──────────────────────────────────────────────────
  // 1. 그림자 보법 — 페이즈 첫 공격(firstAttackPending) 시 한 번만 굴려, 발동하면 페이즈 통째 회피.
  // 2. 회피 강화 (evadesRemaining) — 잔량 > 0 이면 우선 1 소비, 이 공격 회피.
  // 3. % 회피 (evasionPct × precisionMult) — 표준 회피 굴림.
  // 4. 행운의 방패 (luckyShieldBlockPct) — 위 모두 실패 시 마지막 확률 굴림.
  // 어느 단계든 회피 시 dodge effects(곡예/무한 가시/반사 회피/반격/유격) 적용.

  // AP 스킬의 ignoresEvasion = true (천살 등) 면 회피 cascade 전체 스킵.
  if (!apIgnoresEvasion) {
    if (isFirstAttackOfTurn) {
      const shadowStepPct = defender.player.shadowStepPct ?? 0;
      if (shadowStepPct > 0 && Math.random() * 100 < shadowStepPct) {
        return applyShadowStepDodge(state, atkKey, defKey);
      }
    }
    if (defender.stacks.evadesRemaining > 0) {
      return applyPerAttackDodge(
        state,
        atkKey,
        defKey,
        `[회피 강화] ${defender.name}이(가) 공격을 회피했다.`,
        true,
      );
    }
    const precisionMult = attacker.player.precisionEvasionMult ?? 1;
    // 이중 행운 — 방어자 활성 시 회피 +bonus%. 만물 행운 / 회전 운기도 회피에 합산.
    const luckEvadeBonus = defender.flags.luckyBuffActive
      ? defender.player.doubleLuck?.evade ?? 0
      : 0;
    const universalLuckEvadeBonus = defender.player.universalLuckBonusPct ?? 0;
    // v2 명중률(PR-6): 공격자 accuracyPct 가 방어자 evasion 에서 %p 차감.
    // 0/undefined = 차감 없음(라이브 기존 동작 보존).
    const attackerAccuracy = attacker.player.accuracyPct ?? 0;
    const effectiveEvadePct = Math.max(
      0,
      defender.player.evasionPct * precisionMult +
        luckEvadeBonus +
        universalLuckEvadeBonus +
        defender.buffs.cyclingChiBonus -
        attackerAccuracy,
    );
    if (effectiveEvadePct > 0 && Math.random() * 100 < effectiveEvadePct) {
      return applyPerAttackDodge(
        state,
        atkKey,
        defKey,
        `${defender.name}이(가) ${attacker.name}의 공격을 회피했다.`,
        false,
      );
    }
    const luckyShieldPct = defender.player.luckyShieldBlockPct ?? 0;
    if (luckyShieldPct > 0 && Math.random() * 100 < luckyShieldPct) {
      return applyPerAttackDodge(
        state,
        atkKey,
        defKey,
        `[행운의 방패] ${defender.name}이(가) 공격을 흘려보냈다.`,
        false,
      );
    }
  }

  // AP 스킬 시한부 버프 — 발동턴 damage calc 부터 효과 받도록 attacker.buffs 를 미리 갱신.
  // decrementTimedEffects 는 다음 attacker 페이즈 진입 시 -1 → 발동턴 + (turns-1) 후속 = 총 turns 턴.
  // dodge cascade 직후이라 — 회피된 공격에는 AP 가 발동 안 하니 위에서 이미 return 된 상태.
  const nextBuffsTimedFromAp = apAllFiredSkills.reduce(
    (buffs, skill) => applyTimedBuffFromApSkillPvP(buffs, skill),
    attacker.buffs,
  );

  // 암살 (특기) — 전투 첫 공격 시 1회, DEF 무시 + 데미지 배수.
  const assassinFires =
    (attacker.player.assassinateDmgMult ?? 0) > 1 &&
    !attacker.flags.assassinateUsed &&
    attacker.turn.completedPlayerTurns === 0 &&
    isFirstAttackOfTurn;
  // 약점 적중 — 큐가 있으면 이 공격은 적 DEF 일부 관통.
  const weakpointDefIgnore = attacker.stacks.weakpointDefIgnoreLeft > 0;
  // 분쇄 — 강공격 발동 턴 그 공격에 한해 적 DEF -crushDefReduction.
  // 2026-05-23: 암살/약점/AP 방어 관통은 완전 무시(0)가 아니라 DEF_IGNORE_FRACTION(30%)만 무시.
  // engine.ts 와 동일 — 분쇄(고정 감산) 후 30% 곱연산 관통.
  const crushReduction = attacker.player.crushDefReduction ?? 0;
  const baseDef = attackerFacingDef(attacker, defender, nextBuffsTimedFromAp);
  const afterCrush =
    powerBonus > 0 && crushReduction > 0
      ? Math.max(0, baseDef - crushReduction)
      : baseDef;
  const targetDef =
    assassinFires || weakpointDefIgnore || apIgnoresDef
      ? Math.round(afterCrush * (1 - DEF_IGNORE_FRACTION))
      : afterCrush;

  // 광전사 (특기) — 잃은 HP 비율만큼 ATK 가산.
  const lostHpFraction = Math.max(0, 1 - attacker.hp / attacker.maxHp);
  const berserkBonus =
    (attacker.player.berserkAtkPctPerLostHpPct ?? 0) > 0
      ? Math.floor(
          attacker.player.atk *
            lostHpFraction *
            attacker.player.berserkAtkPctPerLostHpPct!,
        )
      : 0;
  // 질풍검 — 턴 첫 공격에 (그 턴 공격 횟수 × N).
  const gustBonus =
    (attacker.player.gustAtkPerAttack ?? 0) > 0 && isFirstAttackOfTurn
      ? attacker.attacksLeft * attacker.player.gustAtkPerAttack!
      : 0;
  // 불굴의 일격 (2티어) — 턴 첫 공격에 (누적 받은 피해 × N).
  const enduringStrikeBonus =
    (attacker.player.enduringStrikeMult ?? 0) > 0 && isFirstAttackOfTurn
      ? Math.floor(
          attacker.stacks.damageTakenThisCombat *
            attacker.player.enduringStrikeMult!,
        )
      : 0;
  // 회전 운기 — 매 턴 시작 시 +cyclingChiPerTurn(%) 누적, 그 턴 즉시 적용.
  const cyclingChiThisTurn =
    attacker.buffs.cyclingChiBonus +
    (isFirstAttackOfTurn ? attacker.player.cyclingChiPerTurn ?? 0 : 0);
  // 크리티컬 — 기본 + 행운 + 천칭 + 만물 행운 + 회전 운기. 천칭은 SPD 차이 × N, 폭주/둔화 반영.
  const baseCritPct = attacker.player.critChancePct ?? 0;
  const luckCritBonus = attacker.flags.luckyBuffActive
    ? attacker.player.doubleLuck?.crit ?? 0
    : 0;
  const effectiveAtkSpd =
    nextBuffsTimedFromAp.playerSpdTurnsLeft > 0
      ? attacker.player.spd * nextBuffsTimedFromAp.playerSpdMult
      : attacker.player.spd;
  const effectiveDefSpd =
    nextBuffsTimedFromAp.enemySpdTurnsLeft > 0
      ? defender.player.spd * nextBuffsTimedFromAp.enemySpdMult
      : defender.player.spd;
  const balanceCritBonus =
    (attacker.player.balanceCritPctPerSpdDiff ?? 0) > 0
      ? Math.floor(
          Math.max(0, effectiveAtkSpd - effectiveDefSpd) *
            attacker.player.balanceCritPctPerSpdDiff!,
        )
      : 0;
  const universalLuckBonus = attacker.player.universalLuckBonusPct ?? 0;
  // 크리 확률 CRIT_PCT_CAP 캡 + 초과분 → 크리뎀 변환 (PvE 와 대칭, engine.ts 동일 패턴).
  const rawCritPct =
    baseCritPct +
    luckCritBonus +
    balanceCritBonus +
    universalLuckBonus +
    cyclingChiThisTurn;
  // PR-2 — 피격자(defender)의 치명타 저항(정신)만큼 공격자 크리 확률 차감. PvE 몹은 크리 없어 PvP 한정.
  const effectiveCritPct = Math.max(
    0,
    Math.min(CRIT_PCT_CAP, rawCritPct) - (defender.player.critResistPct ?? 0),
  );
  const critOverflowDmgBonus = Math.min(
    CRIT_OVERFLOW_DMG_CAP,
    Math.max(0, rawCritPct - CRIT_PCT_CAP) * CRIT_OVERFLOW_DMG_PER_PCT,
  );
  // 연쇄 운명 — 큐가 있으면 강제 크리. 큐는 이번 공격에 소비.
  const fatedChainConsumed = attacker.flags.fatedChainCritPending;
  // 집중의 호흡 (AP) — 큐가 있으면 이 공격 크리 강제 + 크리뎀 보너스. 1회 소비.
  const focusedBreathConsumed = attacker.turn.focusedBreathCritDmgBonusPct > 0;
  const focusedBreathCritDmgBonus = focusedBreathConsumed
    ? attacker.turn.focusedBreathCritDmgBonusPct / 100
    : 0;
  const critRoll = fatedChainConsumed || focusedBreathConsumed
    ? true
    : effectiveCritPct > 0
      ? Math.random() * 100 < effectiveCritPct
      : false;
  // 광기 (AP) — 자신 ATK +pct%. atk_multiplier 적용 전에 가산.
  const madnessAtkBonus =
    nextBuffsTimedFromAp.playerAtkBuffTurnsLeft > 0 &&
    nextBuffsTimedFromAp.playerAtkBuffPct > 0
      ? Math.floor((attacker.player.atk * nextBuffsTimedFromAp.playerAtkBuffPct) / 100)
      : 0;
  // 베이스 데미지 — ATK + rampage + powerBonus + berserk + gust + enduringStrike + madness vs targetDef.
  const baseAtkValue =
    attacker.player.atk +
    attacker.buffs.rampageAtkBonus +
    powerBonus +
    berserkBonus +
    gustBonus +
    enduringStrikeBonus +
    madnessAtkBonus;
  // 약점 분석으로 인한 본인 ATK 페널티 (defender 가 적용한 페널티) 반영.
  const baseAtkWithAnalysis = Math.max(
    0,
    baseAtkValue - defender.buffs.opponentAtkPenalty,
  );
  // PR-5a: v2 buff/debuff 격리 해제 — 일반 공격 damage 에도 v2 buff 곱셈.
  // attacker 측 v2 atk-stats buff/debuff 합산 → atk 곱. defender 측 vit buff/debuff → def 곱.
  const v2AtkMultAttacker = v2AtkBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const v2DefMultDefender = v2DefBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2EffectiveAtk = v2AtkMultAttacker !== 1
    ? Math.floor(baseAtkWithAnalysis * v2AtkMultAttacker)
    : baseAtkWithAnalysis;
  const v2EffectiveTargetDef = v2DefMultDefender !== 1
    ? Math.floor(targetDef * v2DefMultDefender)
    : targetDef;
  // AP 스킬의 atk_multiplier 는 모든 ATK 합산 후 곱.
  const atkForDmg =
    apAtkMult !== 1
      ? Math.floor(v2EffectiveAtk * apAtkMult)
      : v2EffectiveAtk;
  const baseDmgSingleHit = damageBetween(atkForDmg, v2EffectiveTargetDef);
  // 광살참 (AP) — 같은 fire 에서 hits 번 반복. apHits=1 이면 그대로.
  const baseDmg = apHits > 1 ? baseDmgSingleHit * apHits : baseDmgSingleHit;
  // 처형 — defender 의 HP 비율이 임계 미만이면 데미지 ×mult.
  const exMult = attacker.player.executionDamageMult ?? 1;
  const exFraction = attacker.player.executionHpFraction ?? 0;
  const executionActive =
    exMult > 1 && exFraction > 0 && defender.hp / defender.maxHp < exFraction;
  const dmgAfterExecution = executionActive
    ? Math.max(1, Math.floor(baseDmg * exMult))
    : baseDmg;
  // 집중의 호흡 (AP) — 그 1발 한정 critMult +pct% (가산 후 한 번에 곱).
  const critMult =
    (attacker.player.critMult ?? CRIT_MULT_BASE) +
    focusedBreathCritDmgBonus +
    critOverflowDmgBonus;
  const dmgAfterCrit = critRoll
    ? Math.floor(dmgAfterExecution * critMult)
    : dmgAfterExecution;
  // 행운의 별 (5티어).
  const luckyStarPct = attacker.player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(dmgAfterCrit * LUCKY_STAR_DAMAGE_MULT)
    : dmgAfterCrit;
  // 암살 — 모든 배수 후 ×N.
  const dmg = assassinFires
    ? Math.floor(dmgAfterLuckyStar * attacker.player.assassinateDmgMult!)
    : dmgAfterLuckyStar;
  // 천명 (4티어) — 확률로 적 현재 HP 의 N% 추가 고정 피해.
  const decreeFires =
    (attacker.player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < attacker.player.heavenDecreeChancePct!;
  const decreeDmg = decreeFires
    ? Math.floor((defender.hp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  // 충돌파 (6티어) — 매 IMPACT_WAVE_INTERVAL 턴마다 본타 첫 공격에 추가 고정 피해.
  const impactPct = attacker.player.impactWaveHpPct ?? 0;
  const impactFires =
    impactPct > 0 &&
    isFirstAttackOfTurn &&
    turnNumber % IMPACT_WAVE_INTERVAL === 0;
  const impactDmg = impactFires
    ? Math.floor((defender.hp * impactPct) / 100)
    : 0;
  // 폭풍 일격 (AP) — fire 시 (player.atk × spdPct/100) 추가 고정 데미지. targetDef 무시.
  const stormBonus =
    apMultEffect?.kind === "atk_plus_spd_pct_bonus"
      ? Math.floor((attacker.player.atk * apMultEffect.spdPct) / 100)
      : 0;
  const totalDmg = dmg + decreeDmg + impactDmg + stormBonus;
  const labels: string[] = [];
  if (powerBonus > 0) labels.push("강공격");
  if (powerBonus > 0 && crushReduction > 0) labels.push("분쇄");
  if (executionActive) labels.push("처형");
  if (critRoll) labels.push("크리티컬");
  if (luckyStarFires) labels.push("행운의 별");
  if (assassinFires) labels.push("암살");
  if (decreeFires) labels.push("천명");
  if (impactFires) labels.push("충돌파");
  if (enduringStrikeBonus > 0) labels.push("불굴의 일격");
  if (weakpointDefIgnore) labels.push("약점 적중");
  if (fatedChainConsumed) labels.push("연쇄 운명");
  for (const skill of apAllFiredSkills) labels.push(skill.name);
  const prefix = labels.length > 0 ? `[${labels.join(" + ")}] ` : "";
  // ── 방어자 측 데미지 감산 (결의 → 가드 → 굳건한 의지 → 철벽 → 불굴 → 흡혈 갑옷) ──
  // 결의 (AP, defender 가 자기에게 시전한 효과) — 받는 피해 -pct%. 다른 감산 전에 먼저 적용.
  const resolveReductionActive =
    defender.buffs.playerDmgReductionTurnsLeft > 0 &&
    defender.buffs.playerDmgReductionPct > 0;
  const dmgAfterResolve = resolveReductionActive
    ? Math.max(1, Math.floor(totalDmg * (1 - defender.buffs.playerDmgReductionPct / 100)))
    : totalDmg;
  const resolveApplied = dmgAfterResolve < totalDmg;
  const guard = defender.player.guard;
  const guarded =
    guard && guard.turns > 0 && defender.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, dmgAfterResolve - guard.reduction)
      : dmgAfterResolve;
  const guardApplied = guarded < dmgAfterResolve;
  const steadfastFlat = defender.player.steadfastWillFlat ?? 0;
  const afterSteadfast =
    steadfastFlat > 0 ? Math.max(0, guarded - steadfastFlat) : guarded;
  const steadfastApplied = afterSteadfast < guarded;
  const shieldAbsorbed = Math.min(defender.stacks.playerShield, afterSteadfast);
  const dmgToHp = afterSteadfast - shieldAbsorbed;
  const newShield = defender.stacks.playerShield - shieldAbsorbed;
  // 불굴 — HP 0 직전 1 로 막아준다 (전투당 1회).
  const wouldKill = defender.hp - dmgToHp <= 0;
  const enduranceFires =
    wouldKill &&
    !!defender.player.enduranceActive &&
    !defender.flags.enduranceTriggered;
  const defenderHpAfterDmg = enduranceFires
    ? 1
    : Math.max(0, defender.hp - dmgToHp);
  // 흡혈 갑옷 — 받은 HP 피해의 N% HP 회복 (생존 시).
  const bloodfeastPct = defender.player.bloodfeastPct ?? 0;
  const bloodfeastHeal =
    bloodfeastPct > 0 && dmgToHp > 0 && defenderHpAfterDmg > 0
      ? Math.floor((dmgToHp * bloodfeastPct) / 100)
      : 0;
  const newDefenderHp =
    bloodfeastHeal > 0
      ? Math.min(defender.maxHp, defenderHpAfterDmg + bloodfeastHeal)
      : defenderHpAfterDmg;
  // ── 로그 — 결의 → 가드 → 굳건한 의지 → 철벽 → 본타 → 불굴 → 흡혈 갑옷 → 이중 행운 → 흡혈 ──
  let log = state.log;
  if (resolveApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[결의] ${defender.name} 피해 -${totalDmg - dmgAfterResolve}`,
    });
  }
  if (guardApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[가드] ${defender.name} 피해 -${dmgAfterResolve - guarded}`,
    });
  }
  if (steadfastApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[굳건한 의지] ${defender.name} 피해 -${guarded - afterSteadfast}`,
    });
  }
  if (shieldAbsorbed > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[철벽] ${defender.name} 보호막이 ${shieldAbsorbed} 흡수 (남은 ${newShield})`,
    });
  }
  log = appendLog(log, {
    kind: "player_attack",
    text: `${prefix || "공격! "}${dmgToHp} 피해를 입혔다.`,
  });
  if (enduranceFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[불굴] ${defender.name} 마지막 한 숨 — HP 1 로 버텼다!`,
    });
  }
  if (bloodfeastHeal > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[흡혈 갑옷] ${defender.name}의 HP +${bloodfeastHeal}`,
    });
  }
  // 이중 행운 — 첫 크리 발동 순간 활성화.
  const shouldActivateLucky =
    critRoll &&
    !attacker.flags.luckyBuffActive &&
    (attacker.player.doubleLuck?.crit ?? 0) > 0;
  if (shouldActivateLucky) {
    log = appendLog(log, {
      kind: "info",
      text: `[이중 행운] ${attacker.name} 회피/크리티컬 +${attacker.player.doubleLuck!.crit}% 발동!`,
    });
  }
  // 흡혈 / 행운의 흡혈 / 흡혈의 룬 — 가한 dmg (본타) 의 N% HP 회복.
  const lifestealHeal =
    critRoll && (attacker.player.lifestealCritHealPct ?? 0) > 0
      ? Math.floor((dmg * attacker.player.lifestealCritHealPct!) / 100)
      : 0;
  const luckyLifestealHeal =
    (attacker.player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((dmg * attacker.player.luckyLifestealPct!) / 100)
      : 0;
  const runeLifestealHeal =
    (attacker.player.runeLifestealPct ?? 0) > 0
      ? Math.floor((dmg * attacker.player.runeLifestealPct!) / 100)
      : 0;
  const apLifestealHeal =
    nextBuffsTimedFromAp.playerLifestealTurnsLeft > 0 &&
    nextBuffsTimedFromAp.playerLifestealPct > 0
      ? Math.floor((dmg * nextBuffsTimedFromAp.playerLifestealPct) / 100)
      : 0;
  const totalLifestealHeal =
    lifestealHeal + luckyLifestealHeal + runeLifestealHeal + apLifestealHeal;
  const newAttackerHp =
    totalLifestealHeal > 0
      ? Math.min(attacker.maxHp, attacker.hp + totalLifestealHeal)
      : attacker.hp;
  const actualLifesteal = newAttackerHp - attacker.hp;
  if (actualLifesteal > 0) {
    const lsLabels: string[] = [];
    if (lifestealHeal > 0) lsLabels.push("흡혈");
    if (luckyLifestealHeal > 0) lsLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) lsLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) lsLabels.push("흡령");
    log = appendLog(log, {
      kind: "info",
      text: `[${lsLabels.join(" + ")}] ${attacker.name}의 HP +${actualLifesteal}`,
    });
  }
  // 출혈 — 적중하면 attacker.stacks.bleedStacksOnOpponent +1 (이 사이드가 상대에게 누적).
  const newBleedOnOpponent =
    (attacker.player.bleedDmgPerStack ?? 0) > 0
      ? attacker.stacks.bleedStacksOnOpponent + 1
      : attacker.stacks.bleedStacksOnOpponent;
  // 약점 적중 — 크리 발동 시 그 턴 1회, DEF 무시 큐 추가 + 추가타.
  const weakpointFires =
    critRoll &&
    (attacker.player.weakpointExtraAttacks ?? 0) > 0 &&
    !attacker.turn.weakpointUsedThisTurn;
  const weakpointAdd = weakpointFires
    ? attacker.player.weakpointExtraAttacks!
    : 0;
  if (weakpointFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[약점 적중] 빈틈을 — 한 번 더!`,
    });
  }
  // 연쇄 운명 — 크리 시 그 턴 1회, 다음 공격 크리 강제 큐.
  const fatedChainFires =
    critRoll &&
    !!attacker.player.fatedChainActive &&
    !attacker.turn.fatedChainTriggeredThisTurn;
  if (fatedChainFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[연쇄 운명] ${attacker.name} — 별빛이 다음 결을 점지했다 (다음 공격 크리 보장).`,
    });
  }
  const newWeakpointLeft =
    Math.max(
      0,
      attacker.stacks.weakpointDefIgnoreLeft - (weakpointDefIgnore ? 1 : 0),
    ) + weakpointAdd;
  // ── AP 스킬 명중 시 부가 효과 dispatch (engine.ts:1189-1363 PvP 미러) ──────────
  // AP 회복 +1(행동 1회 명중) 한 후 cost 차감. 회복 먼저라 ult cost 와 정확히 일치할 때도 발동.
  const newApAfter = Math.max(
    0,
    Math.min(AP_CAP, attacker.ap + 1) - apSel.totalCost,
  );
  // 즉시 효과 (atk_multiplier 계열 외):
  let attackerHpAfterAPHeal = newAttackerHp;
  let apBleedAdd = 0;
  let apEvadesAdd = 0;
  let comboExtraAttacks = 0;
  let queuedExtraAttacksAdd = 0;
  let focusedBreathQueueBonusPct = 0;

  for (const skill of apAllFiredSkills) {
    const effect = skill.effect;
    if (effect.kind === "heal_pct") {
      const amount = Math.floor((attacker.maxHp * effect.pct) / 100);
      const healed = Math.min(attacker.maxHp, attackerHpAfterAPHeal + amount);
      const actual = healed - attackerHpAfterAPHeal;
      attackerHpAfterAPHeal = healed;
      if (actual > 0) {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${attacker.name}의 HP +${actual}`,
        });
      }
    } else if (effect.kind === "apply_bleed") {
      apBleedAdd += effect.stacks;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${defender.name}에게 출혈 +${effect.stacks}스택`,
      });
    } else if (effect.kind === "add_guaranteed_evades") {
      apEvadesAdd += effect.count;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] 보장 회피 +${effect.count}`,
      });
    } else if (effect.kind === "extra_attack_this_turn") {
      comboExtraAttacks += effect.count;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] 이번 턴 추가 공격 +${effect.count}`,
      });
    } else if (effect.kind === "queued_extra_attacks_next_turn") {
      queuedExtraAttacksAdd += effect.count;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] 다음 턴 행동 +${effect.count}`,
      });
    } else if (effect.kind === "crit_buff_next_attack") {
      focusedBreathQueueBonusPct = effect.critDmgBonusPct;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] 다음 공격 크리 보장 + 크리뎀 +${effect.critDmgBonusPct}%`,
      });
    } else if (effect.kind === "cleanse_debuffs") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${attacker.name}의 모든 디버프 해제`,
      });
    } else if (effect.kind === "player_dmg_reduction_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 받는 피해 -${effect.pct}%`,
      });
    } else if (effect.kind === "enemy_def_debuff_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 ${defender.name}의 DEF -${effect.pct}%`,
      });
    } else if (effect.kind === "player_atk_buff_def_debuff_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 ATK +${effect.atkPct}%, DEF -${effect.defPct}%`,
      });
    } else if (effect.kind === "enemy_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 ${defender.name}의 SPD ×${effect.mult}`,
      });
    } else if (effect.kind === "player_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 SPD ×${effect.mult}`,
      });
    } else if (effect.kind === "atk_multiplier_with_silence") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${defender.name} ${effect.silenceTurns}턴간 스킬 봉인 (PvP 에선 무효)`,
      });
    } else if (effect.kind === "block_next_enemy_attack") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${defender.name}의 다음 공격 ${effect.count}회 무효`,
      });
    } else if (effect.kind === "lifesteal_dmg_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}턴간 가한 피해의 ${effect.pct}% HP 회복`,
      });
    }
  }

  // 광살참 (multi_hit_self_damage) — 공격형 fire 에서만 자해 HP.
  const madSlashSelfDmg =
    apMultEffect?.kind === "multi_hit_self_damage"
      ? Math.floor((attacker.maxHp * apMultEffect.selfDmgPct) / 100)
      : 0;
  const attackerHpAfterMadSlash =
    madSlashSelfDmg > 0
      ? Math.max(0, attackerHpAfterAPHeal - madSlashSelfDmg)
      : attackerHpAfterAPHeal;
  if (madSlashSelfDmg > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[${apOffensiveSkill!.name}] ${attacker.name}의 HP -${madSlashSelfDmg} (자해)`,
    });
  }
  // 지속 효과 (PR-2 미러) — AP 시한부 버프는 위에서 applyTimedBuffFromApSkillPvP 로 적용 완료.
  // 여기는 cyclingChiBonus(매 턴 누적) 만 추가한다.
  const nextBuffsTimed: PvPSideBuffs = {
    ...nextBuffsTimedFromAp,
    cyclingChiBonus: cyclingChiThisTurn,
  };
  // 사이드 갱신 — 공격자 + 방어자.
  // attacksLeft 는 아래 분기에서 setSide 로 명시적으로 덮어쓰므로 여기 안 박음 (연환격 가산은 그 변수에서).
  const newAttacker: PvPSide = {
    ...attacker,
    hp: attackerHpAfterMadSlash,
    ap: newApAfter,
    flags: {
      ...attacker.flags,
      assassinateUsed: attacker.flags.assassinateUsed || assassinFires,
      luckyBuffActive: attacker.flags.luckyBuffActive || shouldActivateLucky,
      fatedChainCritPending: fatedChainFires
        ? true
        : fatedChainConsumed
          ? false
          : attacker.flags.fatedChainCritPending,
    },
    buffs: nextBuffsTimed,
    stacks: {
      ...attacker.stacks,
      bleedStacksOnOpponent: newBleedOnOpponent + apBleedAdd,
      evadesRemaining: attacker.stacks.evadesRemaining + apEvadesAdd,
      weakpointDefIgnoreLeft: newWeakpointLeft,
    },
    turn: {
      ...attacker.turn,
      critThisTurn: attacker.turn.critThisTurn || critRoll,
      fatedChainTriggeredThisTurn:
        attacker.turn.fatedChainTriggeredThisTurn || fatedChainFires,
      weakpointUsedThisTurn:
        attacker.turn.weakpointUsedThisTurn || weakpointFires,
      apSkillFiredThisTurn:
        apOffensiveSkill?.id ??
        apUtilityFires[0]?.skill.id ??
        attacker.turn.apSkillFiredThisTurn,
      // 집중의 호흡 — 발동되면 큐잉, 큐 활성 중 평타 1회 발사 시 0 으로 소비.
      focusedBreathCritDmgBonusPct: focusedBreathQueueBonusPct > 0
        ? focusedBreathQueueBonusPct
        : focusedBreathConsumed
          ? 0
          : attacker.turn.focusedBreathCritDmgBonusPct,
      // 빛의 활공 — 다음 턴 attacksLeft 가산할 큐. 일반 평타에선 유지.
      queuedExtraAttacks: queuedExtraAttacksAdd > 0
        ? queuedExtraAttacksAdd
        : attacker.turn.queuedExtraAttacks,
    },
  };
  const newDefender: PvPSide = {
    ...defender,
    hp: newDefenderHp,
    flags: {
      ...defender.flags,
      enduranceTriggered: defender.flags.enduranceTriggered || enduranceFires,
    },
    stacks: {
      ...defender.stacks,
      playerShield: newShield,
      damageTakenThisCombat: defender.stacks.damageTakenThisCombat + dmgToHp,
    },
  };
  let next: PvPBattleState = setSide(
    setSide({ ...state, log }, atkKey, newAttacker),
    defKey,
    newDefender,
  );
  if (newDefenderHp <= 0) {
    return {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${defender.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: atkKey === "p1" ? "p1_win" : "p2_win",
    };
  }
  // ── on-hit reflect (반사 갑주 + 가시 갑옷 + 무한 가시) — 공격자에게 반사 피해 ──
  // 베이스는 totalDmg (방어자 결의/가드/굳건/철벽 감산 전, 공격 보너스는 모두 반영).
  const reflectResult = applyOnHitReflect(next, atkKey, defKey, totalDmg);
  next = reflectResult.state;
  if (reflectResult.attackerKilled) return next;
  // ── 반격의 룬 — 피격 후 일정 확률로 ATK 카운터 ──
  const runeCounterResult = maybeApplyRuneCounter(next, atkKey, defKey);
  next = runeCounterResult.state;
  if (runeCounterResult.attackerKilled) return next;
  // 남은 공격 횟수 — 연환격(comboExtraAttacks) 도 포함.
  const attacksLeft = attacker.attacksLeft - 1 + weakpointAdd + comboExtraAttacks;
  if (attacksLeft > 0) {
    return setSide(next, atkKey, {
      ...next[atkKey],
      attacksLeft,
      turn: { ...next[atkKey].turn, firstAttackPending: false },
    });
  }
  // 연타 — extraAttackEveryNTurns N 의 배수일 때.
  const interval = attacker.player.extraAttackEveryNTurns;
  const canDoubleStrike =
    !!interval &&
    interval > 0 &&
    turnNumber % interval === 0 &&
    !attacker.turn.doubleStrikeUsedThisTurn;
  if (canDoubleStrike) {
    next = {
      ...next,
      log: appendLog(next.log, { kind: "info", text: `[연타] ${attacker.name} 한 번 더!` }),
    };
    return setSide(next, atkKey, {
      ...next[atkKey],
      attacksLeft: 1,
      turn: {
        ...next[atkKey].turn,
        doubleStrikeUsedThisTurn: true,
        firstAttackPending: false,
      },
    });
  }
  // 광속.
  const lightspeedPct = attacker.player.lightspeedExtraAttackPct ?? 0;
  const canLightspeed =
    lightspeedPct > 0 &&
    !attacker.turn.lightspeedUsedThisTurn &&
    Math.random() * 100 < lightspeedPct;
  if (canLightspeed) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[광속] ${attacker.name} 잔상이 한 번 더!`,
      }),
    };
    return setSide(next, atkKey, {
      ...next[atkKey],
      attacksLeft: 1,
      turn: {
        ...next[atkKey].turn,
        lightspeedUsedThisTurn: true,
        firstAttackPending: false,
      },
    });
  }
  // 풍사슬 (5티어) — 추가 공격 후 확률로 1회 더. 캡 GALE_CHAIN_MAX_PER_TURN (6티어 무한 풍사슬 시 ETERNAL_GALE_ABSOLUTE_CAP).
  const baseGalePct = attacker.player.galeChainChancePct ?? 0;
  const eternalBonusPct = attacker.player.eternalGaleBonusPct ?? 0;
  const effectiveGalePct = baseGalePct + eternalBonusPct;
  const galeChainReady =
    attacker.turn.doubleStrikeUsedThisTurn ||
    attacker.turn.lightspeedUsedThisTurn ||
    attacker.turn.galeChainsThisTurn > 0;
  const galeCap = attacker.player.eternalGaleNoCap
    ? ETERNAL_GALE_ABSOLUTE_CAP
    : GALE_CHAIN_MAX_PER_TURN;
  const canGaleChain =
    effectiveGalePct > 0 &&
    galeChainReady &&
    attacker.turn.galeChainsThisTurn < galeCap &&
    Math.random() * 100 < effectiveGalePct;
  if (canGaleChain) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[풍사슬] ${attacker.name} 바람이 한 번 더!`,
      }),
    };
    return setSide(next, atkKey, {
      ...next[atkKey],
      attacksLeft: 1,
      turn: {
        ...next[atkKey].turn,
        galeChainsThisTurn: next[atkKey].turn.galeChainsThisTurn + 1,
        firstAttackPending: false,
      },
    });
  }
  // 연참 (특기) — 그 턴 크리 1회 이상이면 추가 공격 N회.
  const canRiposte =
    (attacker.player.riposteExtra ?? 0) > 0 &&
    !attacker.turn.riposteUsedThisTurn &&
    next[atkKey].turn.critThisTurn;
  if (canRiposte) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[연참] ${attacker.name} 빈틈을 — 한 번 더!`,
      }),
    };
    return setSide(next, atkKey, {
      ...next[atkKey],
      attacksLeft: attacker.player.riposteExtra!,
      turn: {
        ...next[atkKey].turn,
        riposteUsedThisTurn: true,
        firstAttackPending: false,
      },
    });
  }
  // 공격 턴 종료.
  return endAttackerPhase(next, atkKey, defKey);
}

// 공격자 페이즈 종료 → 후처리(분신/난무/막다른 격노/약점 분석/재생) → 출혈 도트 → 방어자 페이즈 시작.
// "방어자 페이즈 시작" 처리는 사실상 그냥 phase 를 상대 키로 토글 + 다음 공격자에게 attacksLeft 세팅.
// 출혈 도트는 "다음 공격자가 자기 페이즈 시작 시 도트 데미지를 입는" 시점이라 페이즈 전환 직후 처리.
function endAttackerPhase(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): PvPBattleState {
  if (state.phase === "ended") return state;
  // 턴 카운터 갱신 — 공격자: completedPlayerTurns +1, 게이트 리셋.
  let next: PvPBattleState = setSide(state, atkKey, {
    ...state[atkKey],
    turn: {
      ...state[atkKey].turn,
      completedPlayerTurns: state[atkKey].turn.completedPlayerTurns + 1,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      firstAttackPending: true,
      galeChainsThisTurn: 0,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
      apSkillFiredThisTurn: null,
    },
  });
  // 공격자 턴 후처리 (분신/난무/막다른 격노/약점 분석/재생).
  next = finishAttackerTurn(next, atkKey, defKey);
  if (next.phase === "ended") return next;
  // 방어자 페이즈 시작 — 출혈 도트(공격자가 누적한 stack × 공격자의 bleedDmgPerStack) 가 defender HP 에 적용.
  const attackerForBleed = next[atkKey];
  const defenderBefore = next[defKey];
  const bleedStacks = attackerForBleed.stacks.bleedStacksOnOpponent;
  const bleedDmgPer = attackerForBleed.player.bleedDmgPerStack ?? 0;
  if (bleedStacks > 0 && bleedDmgPer > 0) {
    const bleedDmg = bleedStacks * bleedDmgPer;
    const newHp = Math.max(0, defenderBefore.hp - bleedDmg);
    next = setSide(next, defKey, { ...defenderBefore, hp: newHp });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[출혈] ${defenderBefore.name}이(가) 출혈로 ${bleedDmg} 피해 (스택 ${bleedStacks})`,
      }),
    };
    if (newHp <= 0) {
      return {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${defenderBefore.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: atkKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  }
  // 방어자(다음 공격자) 의 enemyPhasesCompleted +1 — 이번 라운드에서 방어를 1회 마침 (가드 카운터에 사용).
  const defenderAfterBleed = next[defKey];
  next = setSide(next, defKey, {
    ...defenderAfterBleed,
    turn: {
      ...defenderAfterBleed.turn,
      enemyPhasesCompleted: defenderAfterBleed.turn.enemyPhasesCompleted + 1,
    },
  });
  // 새 방어자(다음 공격자) 의 attacksLeft 세팅. nextTurnAttackBonus(유격 누적) 소비.
  const newNextAttacker = next[defKey];
  next = setSide(next, defKey, {
    ...newNextAttacker,
    attacksLeft:
      rollAttackCount(newNextAttacker.player) +
      newNextAttacker.nextTurnAttackBonus,
    nextTurnAttackBonus: 0,
    turn: { ...newNextAttacker.turn, firstAttackPending: true },
  });
  // 페이즈 토글.
  return { ...next, phase: atkKey === "p1" ? "p2" : "p1" };
}

// 포션 효과 — 단일 사이드의 HP 또는 MP 회복. potionHealPct 자체 buffs 에서 가산 (HP 만).
function applyPotionTo(
  state: PvPBattleState,
  key: "p1" | "p2",
  potion: Potion,
): PvPBattleState {
  const side = state[key];
  if (potion.effect.kind === "heal_hp") {
    const heal = potionHealAmount(potion, side.maxHp, side.buffs.potionHealPct ?? 0);
    const newHp = Math.min(side.maxHp, side.hp + heal);
    const actual = newHp - side.hp;
    let next = setSide(state, key, { ...side, hp: newHp });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${side.name}이(가) ${potion.name}을(를) 마셨다 — HP +${actual} (${side.hp} → ${newHp})`,
      }),
    };
    return next;
  }
  if (potion.effect.kind === "heal_mp") {
    // PR-6 — MP 포션. maxMp 0 (INT 없는 캐릭) 이면 회복 0 → 사실상 no-op.
    const restore = computeMpRestoreAmount(potion, side.maxMp);
    const newMp = Math.min(side.maxMp, side.mp + restore);
    const actual = newMp - side.mp;
    let next = setSide(state, key, { ...side, mp: newMp });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${side.name}이(가) ${potion.name}을(를) 마셨다 — MP +${actual} (${side.mp} → ${newMp})`,
      }),
    };
    return next;
  }
  return state;
}

// 방어자 측 능력 통합은 PR-1b 에서. (파일 상단 시리즈 노트 참조.)

// ── 결판 (full simulation) ─────────────────────────────────────────────────

export type PvPResolveContext = {
  pickAction: (state: PvPBattleState, who: "p1" | "p2") => PlayerAction;
  potions: { p1: Partial<Record<PotionId, number>>; p2: Partial<Record<PotionId, number>> };
  // 전투 시작 로그에 박을 전술 안내 한 줄(양측 전술 라벨). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped, 양 side 별도. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: {
    p1?: import("../data/v2/v2Skills").V2SkillsState;
    p2?: import("../data/v2/v2Skills").V2SkillsState;
  };
};

export type PvPBattleResolution = {
  outcome: PvPOutcome;
  finalState: PvPBattleState;
  potionsConsumed: {
    p1: Partial<Record<PotionId, number>>;
    p2: Partial<Record<PotionId, number>>;
  };
  turns: number;
};

// PvP 결판 — 양쪽이 turn cap 까지 결판 못 내면 무승부.
export const PVP_TURN_CAP = 100;

// PR-4b: v2 스킬 cast — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff) + 로그.
// 매 side 의 turn 진입 시 1회 — 자기 side 의 buff/debuff turn -1 tick + cast.
function castV2SkillOnAttackerTurnPvP(
  state: PvPBattleState,
  who: "p1" | "p2",
): PvPBattleState {
  const sideStart = state[who];
  const otherKey: "p1" | "p2" = who === "p1" ? "p2" : "p1";
  // 0) PR-8 — side 가 받는 DoT tick (상대가 박은 dot). DEF 무시. lethal 처리는 호출자 main loop.
  const dotTick = tickV2Dots(sideStart.v2Dots);
  let st = state;
  let preLog = state.log;
  if (dotTick.totalDmg > 0) {
    const before = sideStart.hp;
    const newHp = Math.max(0, before - dotTick.totalDmg);
    const dotLabels = sideStart.v2Dots
      .filter((d) => d.turns > 0)
      .map((d) => d.label)
      .join(" + ");
    // 상대가 박은 dot 이 자기에게 가해진 피해 → 상대 측 행동으로 표시 (otherKey).
    preLog = appendLog(preLog, {
      kind: "player_attack",
      text: `[${dotLabels}] ${sideStart.name}이(가) ${dotTick.totalDmg} 피해를 입었다.`,
      side: otherKey,
    });
    st = setSide({ ...st, log: preLog }, who, {
      ...sideStart,
      hp: newHp,
      v2Dots: dotTick.nextDots,
    });
    // lethal: side 가 dot 으로 사망 → outcome 처리 + 종료. PvE lethal / 옛 bleed lethal 미러.
    if (newHp <= 0) {
      return {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `${sideStart.name}이(가) 쓰러졌다.`,
          side: who,
        }),
        outcome: who === "p1" ? "p2_win" : "p1_win",
        phase: "ended",
      };
    }
  } else {
    st = setSide({ ...st, log: preLog }, who, { ...sideStart, v2Dots: dotTick.nextDots });
  }
  const side = st[who];
  const opp = st[otherKey];
  // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
  const tickedSelfBuffs = tickV2BuffMap(side.v2SelfBuffs);
  const tickedSelfDebuffs = tickV2BuffMap(side.v2SelfDebuffs);
  // 2) cast 결정 + 효과 계산. target = 상대 side (opp).
  const result = resolveV2SkillCast({
    skills: side.v2Skills,
    cooldowns: side.v2SkillCooldowns,
    attacker: {
      mp: side.mp,
      atk: side.player.atk,
      magicAtk: side.player.magicAtk ?? side.player.atk,
      minDamage: side.player.minDamage,
      healMult: side.player.healMult,
      maxHp: side.maxHp,
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      // PR-5b — 시전자 평타 속성(baked) + 캐릭 속성(스킬 기본).
      attackElement: side.player.attackElement,
      characterElement: side.player.characterElement,
    },
    target: {
      def: opp.player.def,
      magicDef: opp.player.magicDef,
      // PR-5a: PvP 양 side 다 v2 buff slot 있음 — opponent 의 buff 도 def 곱셈에 반영.
      selfBuffs: opp.v2SelfBuffs,
      selfDebuffs: opp.v2SelfDebuffs,
      // PR-5b — 피격 상대의 방어 속성(캐릭 속성).
      element: opp.player.characterElement,
    },
  });
  // 3) state 업데이트. state → st 의 log 가 dot tick 결과 누적.
  // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
  let nextLog = st.log;
  let nextSideHp = side.hp;
  let nextOppHp = opp.hp;
  // damage: 일반 공격 player_attack kind 미러.
  if (result.enemyDamage > 0 && result.castSkillName) {
    nextOppHp = Math.max(0, nextOppHp - result.enemyDamage);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${result.castSkillName}] ${result.enemyDamage} 피해를 입혔다.`,
      side: who,
    });
  }
  // heal: 같은 player_attack kind (자기 행동).
  if (result.selfHeal > 0 && result.castSkillName) {
    const before = nextSideHp;
    nextSideHp = Math.min(side.maxHp, nextSideHp + result.selfHeal);
    const actual = nextSideHp - before;
    if (actual > 0) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `[${result.castSkillName}] ${side.name} HP ${actual} 회복했다.`,
        side: who,
      });
    }
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  // enemyDebuff 결과는 상대 side 의 v2SelfDebuffs 에 박힌다.
  const nextOppSelfDebuffs = applyV2BuffsToMap(
    opp.v2SelfDebuffs,
    result.enemyDebuffsToApply,
  );
  // PR-8 — dot 결과는 상대 side 의 v2Dots 에 박힌다.
  const nextOppDots = applyV2DotsToTarget(opp.v2Dots, result.dotsToApplyToTarget);
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
      side: who,
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
      side: who,
    });
  }
  for (const dot of result.dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? dot.label}] ${dot.dmgPerTurn}/턴 (${dot.turns}턴)`,
      side: who,
    });
  }
  const nextSide: PvPSide = {
    ...side,
    hp: nextSideHp,
    mp: result.nextMp,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs,
  };
  const nextOpp: PvPSide = {
    ...opp,
    hp: nextOppHp,
    v2SelfDebuffs: nextOppSelfDebuffs,
    v2Dots: nextOppDots,
  };
  let next: PvPBattleState = { ...st, log: nextLog };
  next = setSide(next, who, nextSide);
  next = setSide(next, otherKey, nextOpp);
  return next;
}

export function resolveBattlePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  ctx: PvPResolveContext,
): PvPBattleResolution {
  const potions = {
    p1: { ...ctx.potions.p1 },
    p2: { ...ctx.potions.p2 },
  };
  const consumed = {
    p1: {} as Partial<Record<PotionId, number>>,
    p2: {} as Partial<Record<PotionId, number>>,
  };
  let state = initialBattleStatePvP(
    p1Player,
    p2Player,
    p1Name,
    p2Name,
    ctx.v2Skills?.p1,
    ctx.v2Skills?.p2,
  );
  // PR-7a — 옛 spell 시스템 폐기. start-of-battle one-shot 도 제거됐고, v2 스킬 cast hook
  // 이 각 side 의 첫 turn 진입 시 1회 발동 (resolveBattlePvP main loop).
  if (state.p1.hp <= 0 && state.p2.hp <= 0) {
    state = { ...state, outcome: "draw", phase: "ended" };
  } else if (state.p1.hp <= 0) {
    state = { ...state, outcome: "p2_win", phase: "ended" };
  } else if (state.p2.hp <= 0) {
    state = { ...state, outcome: "p1_win", phase: "ended" };
  }
  // 전술 안내(#502 가시성을 PvP 경로에도) — ctx.openingNote(양측 전술 라벨)를 마주섬·선공
  // 안내 다음에 info 로 끼운다. 호출부가 문자열로 빌드(엔진은 stance 를 모름).
  if (ctx.openingNote) {
    state = {
      ...state,
      log: [...state.log, { kind: "info", text: ctx.openingNote, turn: "player" }],
    };
  }
  // hp_bar 용 apMax — AP 스킬 장착자만 핍 표시. 미장착 사이드는 0.
  const p1ApMax = (p1Player.equippedAPSkills?.length ?? 0) > 0 ? AP_CAP : 0;
  const p2ApMax = (p2Player.equippedAPSkills?.length ?? 0) > 0 ? AP_CAP : 0;
  // hp_bar 는 p1=player / p2=enemy 관점으로 박는다. challenge API 가 me=p1 로
  // 호출하므로 그대로 도전자 시점 렌더에 맞음. (대전자 시점 미러가 필요해지면
  // 동일 데이터를 그쪽 관점으로 swap 해 새 entry 생성.)
  const hpBarEntry = (s: PvPBattleState): BattleLogEntry => ({
    kind: "hp_bar",
    text: "",
    playerHp: s.p1.hp,
    playerMaxHp: s.p1.maxHp,
    enemyHp: s.p2.hp,
    enemyMaxHp: s.p2.maxHp,
    ap: s.p1.ap,
    apMax: p1ApMax,
    // v2 MP — p1 시점 (challenge API 가 me=p1 로 호출). p1 INT 0 = 둘 다 0 → UI 비표시.
    playerMp: s.p1.mp,
    playerMaxMp: s.p1.maxMp,
    enemyMp: s.p2.mp,
    enemyMaxMp: s.p2.maxMp,
  });
  // p2 도전자(상대) 측 AP 표시도 살리려면 별도 hp_bar 가 필요하지만,
  // 지금은 도전자(p1) 시점만. p2ApMax 는 향후 미러용으로 유지.
  void p2ApMax;
  let turns = 0;
  // v2 스킬 (PR-4a) — 각 side 의 턴 진입 시 1회 cast (framework only).
  // advanceTurnPvP 는 attacksLeft > 0 (다대시·블록 등) 일 때 같은 phase 를 반환하므로
  // loop iteration 하나가 곧 한 turn 은 아니다 — per-side phase-entry flag 로 dedupe.
  // 효과 적용은 PR-4b. 옛 applyStartOfBattleSpellsPvP (battle-start one-shot) 와 별개.
  let v2CastedThisPhase: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  while (state.phase !== "ended") {
    const who: "p1" | "p2" = state.phase === "p1" ? "p1" : "p2";
    const other: "p1" | "p2" = who === "p1" ? "p2" : "p1";
    // who 가 이번 phase 의 actor — 다른 쪽 flag 는 reset (그 쪽 다음 phase 에서 1회 보장).
    v2CastedThisPhase[other] = false;
    if (!v2CastedThisPhase[who]) {
      v2CastedThisPhase[who] = true;
      state = castV2SkillOnAttackerTurnPvP(state, who);
      // PR-8: cast hook 의 dot tick 으로 side 가 사망 → outcome=ended. 후속 처리 skip.
      if (state.phase === "ended") {
        state = { ...state, log: appendLog(state.log, hpBarEntry(state)) };
        turns += 1;
        break;
      }
    }
    let action: PlayerAction = { kind: "attack" };
    const picked = ctx.pickAction(state, who);
    if (picked.kind === "use_potion") {
      const have = potions[who][picked.potionId] ?? 0;
      if (have > 0) {
        potions[who][picked.potionId] = have - 1;
        consumed[who][picked.potionId] = (consumed[who][picked.potionId] ?? 0) + 1;
        action = picked;
      }
    } else {
      action = picked;
    }
    const prevLogLen = state.log.length;
    state = advanceTurnPvP(state, action);
    // advanceTurnPvP 안에서 push 된 entry 들은 모두 이번 액터(who) 의 것.
    // 이미 side 가 박힌 entry 는 보존.
    if (state.log.length > prevLogLen) {
      const tagged = state.log.map((e, idx) =>
        idx < prevLogLen || e.side ? e : { ...e, side: who },
      );
      state = { ...state, log: tagged };
    }
    // 턴 종료 시점 HP/AP 스냅샷. 종료된 상태(phase==="ended")에서도 한 번 박는다.
    state = { ...state, log: appendLog(state.log, hpBarEntry(state)) };
    turns += 1;
    // PvP 무한 루프 가드 / 시간 캡. 양쪽 다 데미지 0 이면 hp% 로 승부 결정 (높은 쪽 승, 동률 무승부).
    if (turns > PVP_TURN_CAP && state.phase !== "ended") {
      const p1Frac = state.p1.hp / state.p1.maxHp;
      const p2Frac = state.p2.hp / state.p2.maxHp;
      const outcome: PvPOutcome =
        p1Frac > p2Frac ? "p1_win" : p2Frac > p1Frac ? "p2_win" : "draw";
      return {
        outcome,
        finalState: { ...state, phase: "ended", outcome },
        potionsConsumed: consumed,
        turns,
      };
    }
    // 안전 가드 — 더 큰 절대 캡.
    if (turns > 1000) {
      return {
        outcome: "draw",
        finalState: { ...state, phase: "ended", outcome: "draw" },
        potionsConsumed: consumed,
        turns,
      };
    }
  }
  return {
    outcome: state.outcome ?? "draw",
    finalState: state,
    potionsConsumed: consumed,
    turns,
  };
}
