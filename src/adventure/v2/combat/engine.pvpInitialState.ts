import { aggregateEquippedPassives } from "@/adventure/data/v2/v2Skills";
import { initialBerserkerCombatState } from "./berserkerCombat";
import { scalePositivePvPValue } from "./engine.pvpScaling";
import { type PvPBattleState, type PvPPhase, type PvPSide } from "./engine.pvpState";
import { rollPvPAttackCount } from "./engine.pvpStats";
import { type BattleLogEntry, type PlayerCombat } from "./engineState";
import { emptyLawInscriptionState } from "./lawInscription";
import { type PvPInitiativeActor } from "./pvpInitiative";
import { battleStartShield, trackedBattleStartShield } from "./signatureEffects";
import { hasTier6Unique, initialTier6UniqueRuntime } from "./tier6UniqueEffects";
import { initialTripleWardState } from "./tripleWard";

// ── 초기화 ──────────────────────────────────────────────────────────────────

export function buildSide(
  player: PlayerCombat,
  name: string,
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  sustainMultiplier = 1,
): PvPSide {
  const sigStartShield = battleStartShield(player.equipSignatures, player.maxHp);
  const rawStartShield =
    (player.bulwarkShield ?? 0) + (sigStartShield?.amount ?? 0);
  const startShield = scalePositivePvPValue(
    rawStartShield,
    sustainMultiplier,
  );
  const trackedStartShield = trackedBattleStartShield(
    player.equipSignatures,
    player.maxHp,
  );
  const scaledTrackedStartShield = trackedStartShield
    ? scalePositivePvPValue(trackedStartShield.amount, sustainMultiplier)
    : 0;
  const sideMaxMp = Math.max(0, player.maxMp ?? 0);
  const maxMagicBarrier = Math.max(0, player.magicBarrierMax ?? 0);
  const berserkerLineageEquipped = v2Skills.equipped.some((skillId) =>
    skillId === "v2c_berserker_bloodslash" ||
    skillId === "v2c_warlord_bloodbath" ||
    skillId === "v2c_overlord_ruin" ||
    skillId === "v2c_hegemon_annihilation",
  );
  const tripleWardRank = aggregateEquippedPassives(v2Skills.equipped)
    .tripleWardRank;
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
    magicBarrier: maxMagicBarrier,
    maxMagicBarrier,
    ...((player.berserkerMadnessRank ?? 0) > 0 || berserkerLineageEquipped
      ? { berserker: initialBerserkerCombatState() }
      : {}),
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
      skillCritAfterEvadePending: false,
      statusBlockUsed: false,
      ...(trackedStartShield ? { trackedShieldBreakUsed: false } : {}),
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
      tripleWard: initialTripleWardState(tripleWardRank),
      fortressImpact: 0,
      ironWallReflectCharges: 0,
      mutationWeight: 0,
      ...(player.lawInscription
        ? { lawInscriptions: emptyLawInscriptionState() }
        : {}),
      playerShield: startShield,
      ...(trackedStartShield
        ? { trackedSetShield: scaledTrackedStartShield }
        : {}),
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      braceDefBonus: 0,
      skillRegenPct: 0,
      skillRegenTurns: 0,
      skillCritPct: 0,
      skillCritTurns: 0,
      skillEvasionPct: 0,
      skillEvasionTurns: 0,
      accuracyDownPct: 0,
      accuracyDownTurns: 0,
      skillDmgReducePct: 0,
      skillDmgReduceTurns: 0,
      skillReflectBoostPct: 0,
      skillReflectBoostTurns: 0,
      enemyVulnPct: 0,
      enemyVulnTurns: 0,
      enemyMagicVulnPct: 0,
      enemyMagicVulnTurns: 0,
      healReducePct: 0,
      healReduceTurns: 0,
      damageDownPct: 0,
      damageDownTurns: 0,
      skillProcDownPct: 0,
      skillProcDownTurns: 0,
      dotVulnPct: 0,
      dotVulnTurns: 0,
      magicVulnStacks: 0,
      spellCastCount: 0,
      comboHitCount: 0,
      signatureHitCount: 0,
      signatureBonusAttacksLeft: 0,
      ...(hasTier6Unique(player.equipSignatures)
        ? { tier6Uniques: initialTier6UniqueRuntime() }
        : {}),
    },
  };
}



// 저수준 상태 빌더. 실제 결판은 속도 가중 추첨 결과를 initiative 로 넘긴다.
// initiative 생략 시의 SPD 비교는 직접 상태를 만드는 기존 전투 메커닉 테스트 호환용이다.
export function initialBattleStatePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  p1Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  p2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  damageMultiplier?: number,
  sustainMultiplier?: number,
  initiative?: PvPInitiativeActor,
): PvPBattleState {
  const normalizedDamageMultiplier =
    typeof damageMultiplier === "number" &&
    Number.isFinite(damageMultiplier) &&
    damageMultiplier > 0
      ? damageMultiplier
      : 1;
  const normalizedSustainMultiplier =
    typeof sustainMultiplier === "number" &&
    Number.isFinite(sustainMultiplier) &&
    sustainMultiplier > 0
      ? sustainMultiplier
      : 1;
  const p1Side = buildSide(
    p1Player,
    p1Name,
    p1Skills,
    normalizedSustainMultiplier,
  );
  const p2Side = buildSide(
    p2Player,
    p2Name,
    p2Skills,
    normalizedSustainMultiplier,
  );
  const resolvedInitiative =
    initiative ?? (p1Player.spd >= p2Player.spd ? "p1" : "p2");
  const p1First = resolvedInitiative === "p1";
  const phase: PvPPhase = p1First ? "p1" : "p2";
  const initiator = p1First ? p1Name : p2Name;
  const log: BattleLogEntry[] = [
    { kind: "info", text: `${p1Name} 와(과) ${p2Name} 가 마주섰다.` },
    {
      kind: "info",
      text: initiative
        ? `속도 가중 추첨 결과 — ${initiator}의 선공.`
        : `${initiator}의 선공.`,
    },
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
  if ((p1Side.maxMagicBarrier ?? 0) > 0) {
    log.push({
      kind: "info",
      text: `[마나 실드] ${p1Side.name} 내구도 ${p1Side.maxMagicBarrier ?? 0} 전개`,
    });
  }
  if ((p2Side.maxMagicBarrier ?? 0) > 0) {
    log.push({
      kind: "info",
      text: `[마나 실드] ${p2Side.name} 내구도 ${p2Side.maxMagicBarrier ?? 0} 전개`,
    });
  }
  const state: PvPBattleState = {
    p1: p1First ? attackerWithCount : otherSide,
    p2: p1First ? otherSide : attackerWithCount,
    phase,
    outcome: null,
    log,
  };
  return {
    ...state,
    ...(normalizedDamageMultiplier !== 1
      ? { damageMultiplier: normalizedDamageMultiplier }
      : {}),
    ...(normalizedSustainMultiplier !== 1
      ? { sustainMultiplier: normalizedSustainMultiplier }
      : {}),
  };
}
