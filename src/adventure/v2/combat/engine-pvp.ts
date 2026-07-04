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
//   - 출혈/중독/연소는 defender.v2Dots 에 tagged DoT 로 보관된다.
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
} from "./engine";
import {
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import {
  V2_CORE_LOOP_V2,
  V2_SKILL_PROC_IN_PATTERN,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  V2_ELEMENT_ADV_PCT_PVP,
  V2_ELEMENT_DIS_PCT_PVP,
} from "@/adventure/data/v2/elements";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "@/adventure/data/potions";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  decrementTimedBuffs,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  resolveV2SkillCast,
  distributeBoostedHits,
  rollAttackCount,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import {
  onDodgeHealAmount,
  onDodgeSpeedBuff,
} from "./signatureEffects";
import { V2_COMBAT_PATTERN_ENABLED } from "./combatPattern";
import { smartDefaultPatternFromEquipped } from "@/adventure/data/v2/v2Skills";
import {
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  MAGIC_VULN_STACK_CAP,
  RAMPAGE_START_TURN,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
  attackMissPct,
} from "@/adventure/data/v2/v2CombatConstants";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { resolveBattlePvPAtb } from "./engine.pvp-atb";
import { computeCritOverflowBonus } from "./engine.damageHelpers";
export { advanceTurnPvP }; // 공개 API 보존 (resolveBattlePvP 가 로컬 호출도 함 → import+export 둘 다)

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

export type PvPSideStacks = {
  playerShield: number;
  evadesRemaining: number;
  damageTakenThisCombat: number;
  weakpointDefIgnoreLeft: number;
  // PR2-B 전문화 스킬 temp 버프 — PvE BattleStacks 미러. 전부 0/turns=0 이면 inert(골든 불변).
  skillRegenPct: number; // 운기 — 매 자기 턴 maxHp %
  skillRegenTurns: number;
  skillCritPct: number; // 연환집중 — 치명률 +%p
  skillCritTurns: number;
  skillEvasionPct: number; // 선풍각 — 회피 +%p (PvP 는 회피 유효축)
  skillEvasionTurns: number;
  enemyVulnPct: number; // 속박 — 시전자가 가하는 피해 +% (받는 쪽 취약)
  enemyVulnTurns: number;
  // 화상(원소술사 불) — 이 side 에 걸린 회복 감소 디버프(상대가 부착). 이 side 의 회복(회복 스킬·재생)
  //   −healReducePct%. 흡혈/공격파생 회복은 제외. 자기 턴(cast hook)에 turns 감소.
  healReducePct: number;
  healReduceTurns: number;
  // 약점 노출(마도사) — 이 side 에 누적된 마법취약 스택(상대가 부착). 스택당 받는 스킬피해 +%
  // (상대 enemyMagicVulnPctPerStack), 비전 작렬 payoff 가 소비. 감쇠 없음·MAGIC_VULN_STACK_CAP 상한.
  magicVulnStacks: number;
  // 주문 중첩(워메이지) — 이 side(시전자)의 누적 스킬 시전 횟수. 스택당 스킬피해 +skillDmgPctPerCast%.
  // 감쇠 없음·SPELL_STACK_CAP 상한.
  spellCastCount: number;
  // 고유 시그니처(포식자) — 이 side 의 누적 적중 횟수(N타마다 추가타·Phase 2). 미장착=0 고정 → byte-identical.
  signatureHitCount: number;
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
  turn: BattleTurnState;
  flags: PvPSideFlags;
  buffs: PvPSideBuffs;
  stacks: PvPSideStacks;
  // v2 스킬 (v2_skill_*) — PR-4a framework. 라이브 spells.ts 와 별개. equipped 빈 배열이면 no-op.
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState;
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
export function attackerFacingDef(
  attacker: PvPSide,
  defender: PvPSide,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 attacker buffs 를 별도 인자로 받을 수 있음.
  // 호출 측에서 시한부 버프가 반영된 buffs 를 전달(없으면 attacker.buffs).
  attackerBuffs: PvPSideBuffs = attacker.buffs,
): number {
  const raw = Math.max(0, defender.player.def - attackerBuffs.opponentDefPenalty);
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
  const corrodePct = attacker.player.poisonedEnemyDefReductionPct ?? 0;
  if (corrodePct > 0 && sideHasDot(defender, "poison")) {
    afterPierce = Math.round(afterPierce * (1 - corrodePct / 100));
  }
  return Math.max(0, afterPierce);
}

// AP 지속 효과 라운드 카운터 -1. 새 attacker 페이즈 진입 시 호출.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시.
export function decrementTimedEffects(buffs: PvPSideBuffs): PvPSideBuffs {
  return decrementTimedBuffs(buffs);
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

function sideHasDot(side: PvPSide, tag: import("./combatShared").V2DotTag): boolean {
  return side.v2Dots.some((d) => d.tag === tag && d.stacks > 0 && d.turns > 0);
}

export function rollPvPAttackCount(attacker: PvPSide, defender: PvPSide): number {
  const bonus = attacker.player.extraAttackChancePctWhileEnemyBleeding ?? 0;
  if (bonus <= 0 || !sideHasDot(defender, "bleed")) {
    return rollAttackCount(attacker.player);
  }
  return rollAttackCount({
    ...attacker.player,
    extraAttackChancePct: (attacker.player.extraAttackChancePct ?? 0) + bonus,
  });
}

export function applyPvPOnHitDots(
  defender: PvPSide,
  attacker: PvPSide,
  add?: { bleedStacks?: number; poisonStacks?: number },
): PvPSide {
  const dots: import("./combatShared").V2Dot[] = [];
  const bleedStacks =
    (add?.bleedStacks ?? 0) + (attacker.player.bleedOnHit ? 1 : 0);
  if (bleedStacks > 0) {
    dots.push(makeBleedDot({
      stacks: bleedStacks,
      flatPerStack: attacker.player.bleedOnHit?.flatPerStack ?? 0,
      sourceAtk: attacker.player.atk,
    }));
  }
  const poisonStacks =
    (add?.poisonStacks ?? 0) + (attacker.player.poisonOnHit ? 1 : 0);
  if (attacker.player.poisonOnHit && poisonStacks > 0) {
    dots.push(makePoisonDot({
      stacks: poisonStacks,
      pctMaxHpPerStack: attacker.player.poisonOnHit.pctMaxHpPerStack,
      sourceAtk: attacker.player.atk,
    }));
  }
  if (dots.length === 0) return defender;
  return {
    ...defender,
    v2Dots: applyV2DotsToTarget(defender.v2Dots, dots),
  };
}

// 사이드 갱신 헬퍼 — p1 또는 p2 슬롯에 새 사이드 객체 박기.
export function setSide(
  state: PvPBattleState,
  which: "p1" | "p2",
  next: PvPSide,
): PvPBattleState {
  return which === "p1" ? { ...state, p1: next } : { ...state, p2: next };
}

// 현 phase 에서 (attacker, defender) 키 결정.
export function actorKeys(phase: PvPPhase): { atkKey: "p1" | "p2"; defKey: "p1" | "p2" } {
  if (phase === "p1") return { atkKey: "p1", defKey: "p2" };
  return { atkKey: "p2", defKey: "p1" };
}

// ── 초기화 ──────────────────────────────────────────────────────────────────

function buildSide(
  player: PlayerCombat,
  name: string,
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
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
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      skillRegenPct: 0,
      skillRegenTurns: 0,
      skillCritPct: 0,
      skillCritTurns: 0,
      skillEvasionPct: 0,
      skillEvasionTurns: 0,
      enemyVulnPct: 0,
      enemyVulnTurns: 0,
      healReducePct: 0,
      healReduceTurns: 0,
      magicVulnStacks: 0,
      spellCastCount: 0,
      signatureHitCount: 0,
    },
  };
}

// 선공 — SPD 가 높은 쪽이 먼저. 동점이면 p1 우선.
export function initialBattleStatePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  p1Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  p2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
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
    attacksLeft: rollPvPAttackCount(firstAttacker, otherSide) + vanguardBonus,
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
  // 화상(healReduce) — 재생도 회복이므로 감소. 디버프 없으면(0) byte-identical.
  const hr = side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0;
  const amount = hr > 0 ? Math.floor(r.amount * (1 - hr / 100)) : r.amount;
  const newHp = Math.min(side.maxHp, side.hp + amount);
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
  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");

  let next = setSide(
    state,
    defKey,
    applyPvPOnHitDots({ ...defender, hp: newDefHp }, attacker),
  );
  next = setSide(next, atkKey, {
    ...next[atkKey],
    hp: newAtkHp,
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
  // 곡예 — 회피 성공 시 HP +amount. + 봉인 on-dodge 회복(Phase 2·미장착=0 → byte-identical).
  const defForHeal = st[defKey];
  const evadeHeal =
    (defForHeal.player.evadeHealAmount ?? 0) +
    onDodgeHealAmount(defForHeal.player.equipSignatures, defForHeal.maxHp);
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
  // 독왕 on-dodge 속도 버프(Phase 2) — 회피 성공 시 방어자 속도↑(Math.max 로 기존 버프 미감소).
  //   미발동=불변 → byte-identical.
  const sigDodgeSpd = onDodgeSpeedBuff(st[defKey].player.equipSignatures);
  if (sigDodgeSpd) {
    const d = st[defKey];
    const activeMult =
      d.buffs.playerSpdTurnsLeft > 0 ? d.buffs.playerSpdMult : 1;
    st = setSide(st, defKey, {
      ...d,
      buffs: {
        ...d.buffs,
        playerSpdMult: Math.max(activeMult, sigDodgeSpd.mult),
        playerSpdTurnsLeft: Math.max(
          d.buffs.playerSpdTurnsLeft,
          sigDodgeSpd.turns,
        ),
      },
    });
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

// shadowStep dodge — 한 페이즈 통째로 회피 + dodge 효과 + 페이즈 종료.
export function applyShadowStepDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): PvPBattleState {
  const defender = state[defKey];
  const dodged = applyDodgeEffects(
    state,
    atkKey,
    defKey,
    `[그림자 보법] ${defender.name}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    false,
  );
  if (dodged.phase === "ended") return dodged;
  return endAttackerPhase(dodged, atkKey, defKey);
}

// per-attack dodge — dodge 효과 + 공격 횟수 1 차감. attacksLeft 0 이면 페이즈 종료.
export function applyPerAttackDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  logText: string,
  consumeEvade: boolean,
): PvPBattleState {
  const dodged = applyDodgeEffects(
    state,
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
export function applyOnHitReflect(
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
  // 수호자 반사 — 피격(적중) 시 방어력 기반 고정 데미지("방어 계수만큼"). PvE enemyPhase 와 동일.
  const wardenReflectDmg =
    (defender.player.thornsFlatFromDef ?? 0) > 0 && rawDmgBeforeMitigation > 0
      ? defender.player.thornsFlatFromDef!
      : 0;
  const total = thornsDmg + brambleDmg + infiniteDmg + wardenReflectDmg;
  if (total <= 0) return { state, attackerKilled: false };
  const newAtkHp = Math.max(0, attacker.hp - total);
  let st = setSide(state, atkKey, { ...attacker, hp: newAtkHp });
  const labels: string[] = [];
  if (thornsDmg > 0) labels.push("반사 갑주");
  if (brambleDmg > 0) labels.push("가시 갑옷");
  if (infiniteDmg > 0) labels.push("무한 가시");
  if (wardenReflectDmg > 0) labels.push("수호 반사");
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
export function maybeApplyRuneCounter(
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

// 무도가/절정 반격 패시브 — 피격 후 일정 확률로 ATK 카운터(반격의 룬과 동일 패턴·별개 누적). PvE
//   enemyPhase 의 passiveCounterChancePct 카운터를 PvP 로 미러. pct 0 이면 RNG 미소비(byte-identical).
export function maybeApplyMartialCounter(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
): { state: PvPBattleState; attackerKilled: boolean } {
  const defender = state[defKey];
  const attacker = state[atkKey];
  const pct = defender.player.passiveCounterChancePct ?? 0;
  if (pct <= 0 || Math.random() * 100 >= pct) {
    return { state, attackerKilled: false };
  }
  // 반격 데미지도 v2 buff/debuff 격리 해제. defender 가 공격자, attacker 가 방어자(반격 방향).
  const v2AtkMultMC = v2AtkBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2DefMultMC = v2DefBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const mcAtk = effectiveAttackerAtk(defender, attacker);
  const mcDef = attackerFacingDef(defender, attacker);
  const dmg = damageBetween(
    v2AtkMultMC !== 1 ? Math.floor(mcAtk * v2AtkMultMC) : mcAtk,
    v2DefMultMC !== 1 ? Math.floor(mcDef * v2DefMultMC) : mcDef,
  );
  const newAtkHp = Math.max(0, attacker.hp - dmg);
  let st = setSide(state, atkKey, { ...attacker, hp: newAtkHp });
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[반격] ${attacker.name}에게 ${dmg} 반격 피해.`,
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

// 공격 턴 종료 후 처리 — 그림자 분신 → 무피해 난무 → 막다른 격노 → 약점 분석 → 재생.
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
  // PR2-B 운기 — 매 자기 턴 maxHp % 회복(temp 버프). turns 감소는 cast hook(턴 시작)에서 처리.
  {
    const side = st[atkKey];
    const s = side.stacks;
    if (s.skillRegenTurns > 0 && s.skillRegenPct > 0 && side.hp > 0) {
      const heal = Math.floor((side.maxHp * s.skillRegenPct) / 100);
      const nextHp = Math.min(side.maxHp, side.hp + heal);
      if (nextHp > side.hp) {
        st = setSide(
          {
            ...st,
            log: appendLog(st.log, {
              kind: "info",
              text: `[운기] ${side.name}의 HP +${nextHp - side.hp}`,
              side: atkKey,
            }),
          },
          atkKey,
          { ...side, hp: nextHp },
        );
      }
    }
  }
  st = applyRegen(st, atkKey);
  return st;
}

// ── 메인 advanceTurn ─────────────────────────────────────────────────────────

export type PvPAttackDamageResult = {
  assassinFires: boolean;
  critRoll: boolean;
  crushReduction: number;
  cyclingChiThisTurn: number;
  decreeFires: boolean;
  dmg: number;
  enduringStrikeBonus: number;
  executionActive: boolean;
  fatedChainConsumed: boolean;
  focusedBreathConsumed: boolean;
  impactFires: boolean;
  luckyStarFires: boolean;
  totalDmg: number;
  weakpointDefIgnore: boolean;
};

// 공격자 페이즈 종료 → 후처리(분신/난무/막다른 격노/약점 분석/재생) → 출혈 도트 → 방어자 페이즈 시작.
// "방어자 페이즈 시작" 처리는 사실상 그냥 phase 를 상대 키로 토글 + 다음 공격자에게 attacksLeft 세팅.
// 출혈 도트는 "다음 공격자가 자기 페이즈 시작 시 도트 데미지를 입는" 시점이라 페이즈 전환 직후 처리.
export function endAttackerPhase(
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
    },
  });
  // 공격자 턴 후처리 (분신/난무/막다른 격노/약점 분석/재생).
  next = finishAttackerTurn(next, atkKey, defKey);
  if (next.phase === "ended") return next;
  // 방어자 페이즈 시작 — 방어자가 받는 tagged DoT 를 한 번 tick.
  const defenderBeforeDot = next[defKey];
  const dotTick = tickV2Dots(defenderBeforeDot.v2Dots, defenderBeforeDot.maxHp);
  if (dotTick.totalDmg > 0) {
    const newHp = Math.max(0, defenderBeforeDot.hp - dotTick.totalDmg);
    next = setSide(next, defKey, {
      ...defenderBeforeDot,
      hp: newHp,
      v2Dots: dotTick.nextDots,
    });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[${defenderBeforeDot.v2Dots
          .filter((d) => d.turns > 0)
          .map((d) => d.label)
          .join(" + ")}] ${defenderBeforeDot.name}이(가) ${dotTick.totalDmg} 피해를 입었다.`,
      }),
    };
    if (newHp <= 0) {
      return {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${defenderBeforeDot.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: atkKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  } else {
    next = setSide(next, defKey, {
      ...defenderBeforeDot,
      v2Dots: dotTick.nextDots,
    });
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
      rollPvPAttackCount(newNextAttacker, next[atkKey]) +
      newNextAttacker.nextTurnAttackBonus,
    nextTurnAttackBonus: 0,
    turn: { ...newNextAttacker.turn, firstAttackPending: true },
  });
  // 페이즈 토글.
  return { ...next, phase: atkKey === "p1" ? "p2" : "p1" };
}

// 포션 효과 — 단일 사이드의 HP 또는 MP 회복. potionHealPct 자체 buffs 에서 가산 (HP 만).
export function applyPotionTo(
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
    p1?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
    p2?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
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
export function castV2SkillOnAttackerTurnPvP(
  state: PvPBattleState,
  who: "p1" | "p2",
): {
  state: PvPBattleState;
  // 바람/대지 ATB 템포(원소술사) — 비-ATB(legacy) 호출부는 .state 만 쓰고 무시. ATB 루프가 틱 반영.
  selfHastePct: number;
  enemyDelayPct: number;
} {
  const sideStart = state[who];
  const otherKey: "p1" | "p2" = who === "p1" ? "p2" : "p1";
  let st = state;
  const preLog = state.log;
  st = setSide({ ...st, log: preLog }, who, sideStart);
  const side = st[who];
  const opp = st[otherKey];
  // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
  const tickedSelfBuffs = tickV2BuffMap(side.v2SelfBuffs);
  const tickedSelfDebuffs = tickV2BuffMap(side.v2SelfDebuffs);
  // 2) cast 결정 + 효과 계산. target = 상대 side (opp).
  let result = resolveV2SkillCast({
    skills: side.v2Skills,
    cooldowns: side.v2SkillCooldowns,
    // PvP 속성 계수 — PvE 약점찌르기(25/0)와 분리, 기존 ±15(메타 불변).
    elementAdvPct: V2_ELEMENT_ADV_PCT_PVP,
    elementDisPct: V2_ELEMENT_DIS_PCT_PVP,
    // PR2-B(Codex) — PvP 도 발동확률 게이트 + 워메이지 proc 보너스. 단 스킬 미보유 전투자에게
    //   Math.random() 을 소비하면 PvP RNG 가 드리프트하므로(Codex 2차) 장착 스킬 있을 때만 롤.
    procRoll: side.v2Skills.equipped.length > 0 ? Math.random() * 100 : undefined,
    procChanceBonus: side.player.skillProcChanceAdd ?? 0,
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    // 전투 패턴(갬빗) — 플래그 on 일 때만 주입(PvP 양쪽 다 플레이어). off 면 옛 슬롯순서+proc.
    // 저장된 커스텀 패턴 우선, 없으면 장착 스킬 종류별 스마트 기본 패턴(유틸 스팸 방지).
    turn: side.turn.completedPlayerTurns + 1,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? (side.v2Skills.pattern ??
        smartDefaultPatternFromEquipped(side.v2Skills.equipped))
      : undefined,
    attacker: {
      mp: side.mp,
      atk: side.player.atk,
      attackCount: side.player.attackCount,
      magicAtk: side.player.magicAtk ?? side.player.atk,
      minDamage: side.player.minDamage,
      healMult: side.player.healMult,
      maxHp: side.maxHp,
      // PR2-B — PvP 시전자도 PlayerCombat → def/vit 비례딜·현재HP(사혈격)·maxMp(보호막/명상)·차수 flat 유효.
      def: side.player.def,
      vit: side.player.vitStat,
      dex: side.player.dexStat,
      luk: side.player.lukStat,
      // 활성 파생버프 — PvP 는 회피/치명만 추적(받피감은 PvP-inert). 받피감=true 로 둬서 self_buff_pct
      //   (damageReduction, active:false) 조건이 PvP 에서 철포를 매턴 스팸(평타 차단)하지 않게 가드.
      selfBuffPctActive: {
        evasion: side.stacks.skillEvasionTurns > 0,
        crit: side.stacks.skillCritTurns > 0,
        damageReduction: true,
      },
      currentHp: side.hp,
      maxMp: side.maxMp,
      classTier: side.player.classTier,
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
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발) 대상 = 상대 side.
      currentHp: opp.hp,
      maxHp: opp.maxHp,
      bleedStacks: opp.v2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
      poisonStacks: opp.v2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
      // 약점 노출 — 비전 작렬(magicVuln payoff)이 상대 누적 스택을 읽어 추가딜.
      magicVulnStacks: opp.stacks.magicVulnStacks,
    },
  });
  // 스킬도 명중 영향 — 데미지 스킬 발동 후 미스 판정(평타와 같은 공식). 미스면 적 효과만 무효
  //   (MP·쿨다운 소모됨·자버프/자힐 유지). 데미지>0 일 때만 롤(RNG 드리프트 방지).
  let skillMissed = false;
  if (result.castSkillId && result.enemyDamage > 0) {
    // 평타 미스 공식과 동일(회피 대결형 Slice 2 B안) — 방어자 회피레이팅(정밀·이중행운·만물행운·회전
    //   운기·선풍각 합) vs 공격자 명중레이팅. ⚠️ 평타 missPct(engine.pvpPhase.ts)와 동기화 유지.
    const sPrecisionMult = side.player.precisionEvasionMult ?? 1;
    const sLuckEvadeBonus = opp.flags.luckyBuffActive
      ? opp.player.doubleLuck?.evade ?? 0
      : 0;
    const sSkillEvadeBonus =
      opp.stacks.skillEvasionTurns > 0 ? opp.stacks.skillEvasionPct : 0;
    const sDefenderEvaR = Math.max(
      0,
      (opp.player.evaRating ?? opp.player.evasionPct ?? 0) * sPrecisionMult +
        sLuckEvadeBonus +
        (opp.player.universalLuckBonusPct ?? 0) +
        opp.buffs.cyclingChiBonus +
        sSkillEvadeBonus,
    );
    const sMissPct = attackMissPct(
      sDefenderEvaR,
      side.player.accRating ?? side.player.accuracyPct ?? 0,
    );
    if (Math.random() * 100 < sMissPct) {
      skillMissed = true;
      result = {
        ...result,
        enemyDamage: 0,
        dotsToApplyToTarget: [],
        enemyDebuffsToApply: [],
      };
    }
  }
  // 3) state 업데이트. state → st 의 log 가 dot tick 결과 누적.
  // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
  let nextLog = st.log;
  let nextSideHp = side.hp;
  let nextOppHp = opp.hp;
  // 스킬 데미지 배수 — 주문중첩(워메이지)·약점노출(마도사 magicVuln)·속박(enemyVuln). 현재 누적
  //   기준, 적용은 이번 시전부터(적중 후 아래에서 스택 증가). 전부 미보유면 배수 1 → 무변(PvE 미러).
  const spellStackMult =
    1 + (side.stacks.spellCastCount * (side.player.skillDmgPctPerCast ?? 0)) / 100;
  const magicVulnMult =
    1 +
    (opp.stacks.magicVulnStacks * (side.player.enemyMagicVulnPctPerStack ?? 0)) /
      100;
  // 속박(enemyVuln) 이번 턴 유효값 — turn-start 감소(또는 새 시전 set) 적용 후. 스킬 cast 와
  //   같은 턴 평타가 동일 값을 쓰도록 nextStacks 와 공유(평타는 post-hook nextStacks 를 읽음).
  //   pre-decay 를 쓰면 속박 마지막 턴에 스킬만 증폭/평타는 미증폭 불일치(Codex).
  //   주의: 현 속박 스킬(속박 사격)은 무피해라 자가증폭 없음. 향후 "피해+속박" 콤보 스킬이 생기면
  //   이 cast 의 자기 피해도 방금 건 속박으로 증폭됨(의도된 동작).
  const nextEnemyVulnTurns = result.enemyVulnToApply
    ? result.enemyVulnToApply.turns
    : Math.max(0, side.stacks.enemyVulnTurns - 1);
  const nextEnemyVulnPct =
    result.enemyVulnToApply?.pct ?? side.stacks.enemyVulnPct;
  const vulnMult = nextEnemyVulnTurns > 0 ? 1 + nextEnemyVulnPct / 100 : 1;
  // 스킬 치명타 — PvE 미러. 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT
  //   로 분리. 데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → RNG 스트림 보존).
  const skillCritFired =
    result.enemyDamage > 0 &&
    (side.player.critChancePct ?? 0) > 0 &&
    Math.random() * 100 < Math.min(CRIT_PCT_CAP, side.player.critChancePct ?? 0);
  // 스킬 다단히트(PvE 미러) — 시전자가 이 턴 굴려둔 공격 횟수(attacksLeft)만큼 데미지 스킬 반복 타격.
  //   데미지 스킬에만(버프/힐/마나/DoT 부여는 1회). 추가 공격 0 빌드는 skillHitCount=1 → 기존 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, side.attacksLeft)
      : 1;
  const singleSkillDamage = Math.floor(
    result.enemyDamage *
      spellStackMult *
      magicVulnMult *
      vulnMult *
      // 밤그림자(skillCritOverflow) — PvE 미러. 스킬 크리에도 크리 오버플로 가산. 전역=flat.
      (skillCritFired
        ? side.player.skillCritOverflow
          ? SKILL_CRIT_MULT +
            computeCritOverflowBonus(side.player.critChancePct ?? 0)
          : SKILL_CRIT_MULT
        : 1),
  );
  const skillDamage = singleSkillDamage * skillHitCount;
  // damage: 일반 공격 player_attack kind 미러.
  if (result.enemyDamage > 0 && result.castSkillName) {
    nextOppHp = Math.max(0, nextOppHp - skillDamage);
    // 다단 스킬은 타마다 한 줄(PvE 미러). 부스트는 타당 raw 비율 분배(합 = 1회분 singleSkillDamage).
    // 다단히트(추가 공격)면 1회분 타격 묶음을 skillHitCount 번 반복.
    const singleHits =
      result.hitDamages.length > 1
        ? distributeBoostedHits(result.hitDamages, singleSkillDamage)
        : [singleSkillDamage];
    const perHit: number[] = [];
    for (let h = 0; h < skillHitCount; h++) perHit.push(...singleHits);
    for (const hit of perHit) {
      if (hit <= 0) continue; // 분배 반올림으로 0 이 된 타는 줄 생략(합은 이미 차감됨).
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [크리티컬]" : ""} ${hit} 피해를 입혔다.`,
        side: who,
      });
    }
  } else if (skillMissed && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 빗나갔다.`,
      side: who,
    });
  }
  // heal: 같은 player_attack kind (자기 행동). 화상(healReduce)이 걸렸으면 회복 감소.
  //   디버프 없으면(0) Math.floor 미적용 → byte-identical.
  if (result.selfHeal > 0 && result.castSkillName) {
    const hr = side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0;
    const effHeal =
      hr > 0 ? Math.floor(result.selfHeal * (1 - hr / 100)) : result.selfHeal;
    const before = nextSideHp;
    nextSideHp = Math.min(side.maxHp, nextSideHp + effHeal);
    const actual = nextSideHp - before;
    if (actual > 0) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}! ${side.name} HP ${actual} 회복했다.`,
        side: who,
      });
    }
  }
  // 마나 회복(명상 등) — 로그 한 줄(빈 턴 갭 방지). PvE 미러.
  if (result.manaRestored > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! ${side.name} 마나 ${result.manaRestored} 회복했다.`,
      side: who,
    });
  }
  // PR2-B 사혈격(PvP) — 시전자 HP 소모(자살 방지 최소 1).
  if (result.selfHpCost > 0) {
    nextSideHp = Math.max(1, nextSideHp - result.selfHpCost);
  }
  // PR2-B — 보호막 + temp 버프(운기/연환집중/선풍각/속박) 적용(PvE applySkillTempBuffs/shield 미러).
  //   보호막 흡수는 기존 로직(stacks.playerShield)이 처리, 4 버프는 stacks 에 기록 후 전투에서 소비.
  //   (비전 작렬=마법취약 payoff 는 PvP magicVuln 트래커 없어 여전히 no-op — 별도 follow-up.)
  const shieldGain = result.shieldToApply
    ? result.shieldToApply.hp + result.shieldToApply.mp
    : 0;
  const critBuff = result.selfBuffPctToApply.find((b) => b.target === "crit");
  const evaBuff = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  // 차수… 아니라 temp 버프 turns 감소는 **자기 턴 시작(여기, cast hook = phase 당 1회)**에서.
  // 새 버프 시전이면 그 turns 로 리셋, 아니면 -1. 턴 시작 감소라 방어용 선풍각(상대 턴에 소비)도
  // 시전 턴 직후 1턴 손실 없이 N 턴 유지(PvE 는 자기 턴에 소비/감소라 turn-end, PvP 는 turn-start).
  const nextStacks: PvPSideStacks = {
    ...side.stacks,
    playerShield: side.stacks.playerShield + shieldGain,
    skillRegenPct:
      result.selfRegenToApply?.pctMaxHpPerTurn ?? side.stacks.skillRegenPct,
    skillRegenTurns: result.selfRegenToApply
      ? result.selfRegenToApply.turns
      : Math.max(0, side.stacks.skillRegenTurns - 1),
    skillCritPct: critBuff?.pct ?? side.stacks.skillCritPct,
    skillCritTurns: critBuff
      ? critBuff.turns
      : Math.max(0, side.stacks.skillCritTurns - 1),
    skillEvasionPct: evaBuff?.pct ?? side.stacks.skillEvasionPct,
    skillEvasionTurns: evaBuff
      ? evaBuff.turns
      : Math.max(0, side.stacks.skillEvasionTurns - 1),
    // 속박 — 위 스킬피해 배수와 동일 값(turn-start 감소/set) 사용 → 같은 턴 스킬·평타 일관.
    enemyVulnPct: nextEnemyVulnPct,
    enemyVulnTurns: nextEnemyVulnTurns,
    // 화상 — 이 side 에 걸린 회복 감소. 자기 턴 시작에 turns 감소(부착은 상대 cast 의 nextOpp 에서).
    healReducePct: side.stacks.healReducePct,
    healReduceTurns: Math.max(0, side.stacks.healReduceTurns - 1),
    // 주문 중첩 — 패시브 보유 + 시전 시 +1(데미지 무관, cap). PvE increment 미러.
    spellCastCount:
      (side.player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
        ? Math.min(SPELL_STACK_CAP, side.stacks.spellCastCount + 1)
        : side.stacks.spellCastCount,
  };
  if (shieldGain > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "보호막"}] ${side.name} 보호막 +${shieldGain}`,
      side: who,
    });
  }
  if (result.selfRegenToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "운기"}] 행동마다 HP +${result.selfRegenToApply.pctMaxHpPerTurn}% (${result.selfRegenToApply.turns}행동)`,
      side: who,
    });
  }
  if (critBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "집중"}] 치명 +${critBuff.pct}%p (${critBuff.turns}행동)`,
      side: who,
    });
  }
  if (evaBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피 +${evaBuff.pct}%p (${evaBuff.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 가하는 피해 +${result.enemyVulnToApply.pct}% (${result.enemyVulnToApply.turns}행동)`,
      side: who,
    });
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
      text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}행동)`,
      side: who,
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}행동)`,
      side: who,
    });
  }
  for (const dot of result.dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? dot.label}] +${dot.stacks}스택 (${dot.turns}회)`,
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
    stacks: nextStacks,
  };
  // 약점 노출 — 시전자가 패시브 보유 + 시전 + 데미지 적중이면 상대 마법취약 +1(상한 클램프, 감쇠 없음).
  const nextOppMagicVuln =
    (side.player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0
      ? Math.min(MAGIC_VULN_STACK_CAP, opp.stacks.magicVulnStacks + 1)
      : opp.stacks.magicVulnStacks;
  const nextOpp: PvPSide = {
    ...opp,
    hp: nextOppHp,
    v2SelfDebuffs: nextOppSelfDebuffs,
    v2Dots: nextOppDots,
    stacks: {
      ...opp.stacks,
      magicVulnStacks: nextOppMagicVuln,
      // 화상 부착 — 시전자가 상대에게 회복 감소 디버프. 상대는 자기 턴(cast hook)에 turns 감소.
      healReducePct: result.enemyHealReduceToApply?.pct ?? opp.stacks.healReducePct,
      healReduceTurns: result.enemyHealReduceToApply
        ? result.enemyHealReduceToApply.turns
        : opp.stacks.healReduceTurns,
    },
  };
  const selfHastePct = result.selfHasteToApply?.pct ?? 0;
  const enemyDelayPct = result.enemyDelayToApply?.pct ?? 0;
  let next: PvPBattleState = { ...st, log: nextLog };
  next = setSide(next, who, nextSide);
  next = setSide(next, otherKey, nextOpp);
  // 스킬 데미지로 상대가 쓰러지면 즉시 전투 종료 (PvE resolveBattle 의 enemyHp<=0 가드 미러).
  //   이 가드가 없으면 상대 HP 0 인 채로 시전자의 후속 액션이 한 스텝 더 진행된다 — 평타면 시체를
  //   한 번 더 때려(cosmetic) 결국 종료되지만, 포션 등 비공격 액션이면 죽은 쪽으로 페이즈가 넘어가는
  //   잠재 버그. 다단히트로 치명 시전이 흔해져 가드 필수. main loop 가 phase==="ended" 를 받아 처리.
  if (nextOppHp <= 0 && next.phase !== "ended") {
    return {
      state: {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${opp.name}이(가) 쓰러졌다.`,
          side: who,
        }),
        phase: "ended",
        outcome: who === "p1" ? "p1_win" : "p2_win",
      },
      selfHastePct,
      enemyDelayPct,
    };
  }
  return { state: next, selfHastePct, enemyDelayPct };
}

function resolveBattlePvPLegacy(
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
    // v2 MP — p1 시점 (challenge API 가 me=p1 로 호출). p1 INT 0 = 둘 다 0 → UI 비표시.
    playerMp: s.p1.mp,
    playerMaxMp: s.p1.maxMp,
    enemyMp: s.p2.mp,
    enemyMaxMp: s.p2.maxMp,
  });
  let turns = 0;
  // v2 스킬 (PR-4a) — 각 side 의 턴 진입 시 1회 cast (framework only).
  // advanceTurnPvP 는 attacksLeft > 0 (다대시·블록 등) 일 때 같은 phase 를 반환하므로
  // loop iteration 하나가 곧 한 turn 은 아니다 — per-side phase-entry flag 로 dedupe.
  // 효과 적용은 PR-4b. 옛 applyStartOfBattleSpellsPvP (battle-start one-shot) 와 별개.
  const v2CastedThisPhase: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  while (state.phase !== "ended") {
    const who: "p1" | "p2" = state.phase === "p1" ? "p1" : "p2";
    const other: "p1" | "p2" = who === "p1" ? "p2" : "p1";
    // who 가 이번 phase 의 actor — 다른 쪽 flag 는 reset (그 쪽 다음 phase 에서 1회 보장).
    v2CastedThisPhase[other] = false;
    if (!v2CastedThisPhase[who]) {
      v2CastedThisPhase[who] = true;
      // legacy(턴제)는 ATB 템포(selfHaste/enemyDelay)를 쓰지 않으므로 .state 만 사용.
      state = castV2SkillOnAttackerTurnPvP(state, who).state;
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

export function resolveBattlePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  ctx: PvPResolveContext,
): PvPBattleResolution {
  if (V2_CORE_LOOP_V2) {
    return resolveBattlePvPAtb(p1Player, p2Player, p1Name, p2Name, ctx);
  }
  return resolveBattlePvPLegacy(p1Player, p2Player, p1Name, p2Name, ctx);
}
