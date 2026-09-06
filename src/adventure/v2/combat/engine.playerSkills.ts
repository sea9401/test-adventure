import { applySkillHealing, skillSelfHealingAmount } from "./engine.skillHealing";
import { combatRandom } from "./combatRandom";
import { recordCombatDamage } from "./combatDiagnostics";
import { CRIT_PCT_CAP, STAT_LABELS } from "@/adventure/data/stats";
import { V2_SKILL_PROC_IN_PATTERN } from "@/adventure/data/v2/coreLoopConfig";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import { tier7CombatJobIdForSkillId } from "@/adventure/data/v2/tier7SkillMechanics";
import {
  applyEvasionDamageReduction,
  evasionDamageReductionPct,
  MAGIC_VULN_STACK_CAP,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  aggregateEquippedPassives,
  effectiveCombatPatternFromEquipped,
  rebalanceDynamicV2SkillEffects,
  smartDefaultPatternFromEquipped,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import {
  applyBerserkerCastTransition,
  berserkerCastContext,
  finishBerserkerPlayerAttack,
} from "./berserkerCombat";
import {
  advancePatternAlternateState,
  preservePatternAlternateTransition,
  V2_COMBAT_PATTERN_ENABLED,
} from "./combatPattern";
import {
  applyBleedChangeToDots,
  applyComboFinisherToHits,
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  bleedChangeLogText,
  distributeBoostedHits,
  healingAfterReceivedMultiplier,
  makeBleedDot,
  makePoisonDot,
  resolveV2SkillCast,
  v2DamageAmount,
  v2MagicBuffMult,
  type V2SkillCastInput,
  type V2SkillCastResult,
} from "./combatShared";
import {
  composeDuelistDeclaration,
  duelistDeclarationSummary,
  interruptDuelistRamp,
} from "./duelistCombat";
import { computeCritOverflowBonus, computeDirectSkillDamage } from "./engine.damageHelpers";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import {
  applyPoisonDamageToDots,
  applySkillTempBuffs,
  isEnemyPoisoned,
  playerSkillTargetDef,
  playerSkillTargetMagicDef,
  recordEnemyDamage,
} from "./engine.pveOperations";
import { NORMAL_MONSTER_EXECUTION_HP_PCT } from "./engineResolutionTypes";
import { markForcedActionMainLog, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog, appendSkillCastLog } from "./engineSupport";
import {
  formatFrostChillGainLog,
  formatFrostChillTriggerLog,
  freezeRawDamage,
  resolveFrostChillGain,
} from "./frostChill";
import {
  addLawInscriptionGain,
  emptyLawInscriptionState,
  lawInscriptionConsumeLog,
  lawInscriptionGainLog,
} from "./lawInscription";
import { effectiveMutationDef, mutationTransitionLogLines } from "./mutationCombat";
import {
  formulaCompletionOverdraftSkillIds,
  formulaStagesForCast,
  previewFormulaCast,
  settleFormulaManaRecovery,
} from "./primordialSageCombat";
import {
  canStartRuinCharge,
  gainSwordIntent,
  ruinIntentStrikeBonus,
  ruinSwordBonusesForMechanic,
  startRuinCharge,
} from "./ruinBladeCombat";
import { consumeShadowFollowUp, recordSwordShadow, refineSwordShadow } from "./shadowBladeCombat";
import { canApplyShock } from "./shockAction";
import {
  everyNHitsEffect,
  formatChillSlowLog,
  formatDefDebuffLog,
  formatShockAppliedLog,
  onSkillCastMpRefund,
  resolveDirectSkillHitSignatures,
  resolveOffensiveSignatureTriggers,
  SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
  SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
} from "./signatureEffects";
import { resolveCrossover, type CrossFamily } from "./skyAscendantCombat";
import {
  applyTier6UniquePveEvent,
  tier6DotContext,
  tier6PveCastContext,
  tier6StatusKindCount,
} from "./tier6UniquePveAdapter";
import { refreshTripleWardState } from "./tripleWard";

// v2 플레이어 스킬 시전 + 효과 적용 — resolveBattleLegacy 에서 추출(ATB 경로 공유용).
// buff/debuff tick 은 호출부 책임(legacy=인라인 tick, ATB=tickPlayerBundleEntry). lethal 체크와
// "시전=완료 턴"(평타 XOR) 처리도 호출부가 루프 모델에 맞게 한다. 이 함수는 cast 결정 + 데미지/힐/
// 마나/HP비용/버프/디버프/도트/취약·실명·암흑 + state 업데이트(로그 포함)까지만 한다(byte-identical).
export function applyImmediateProvokedEnemyBasicAttacks(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  count: number,
  skillName: string,
): BattleState {
  const attacks = Math.max(0, Math.floor(count));
  if (attacks <= 0 || state.phase === "ended") return state;
  const originalPhase = state.phase;
  const originalEnemyAttacksLeft = state.turn.enemyAttacksLeft;
  const originalEnemyPhasesCompleted = state.turn.enemyPhasesCompleted;
  let next: BattleState = {
    ...state,
    phase: "enemy",
    turn: { ...state.turn, enemyAttacksLeft: attacks },
    log: appendLog(state.log, {
      kind: "info",
      text: `[${skillName}] ${state.enemy.name}이(가) 즉시 기본 공격 ${attacks}회!`,
      turn: "player",
    }),
  };
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (index > 0 && next.phase !== "enemy") break;
    const logStart = next.log.length;
    next = resolveEnemyPhase(next, player, playerName, false, false, true);
    if (next.log.length > logStart) {
      next = {
        ...next,
        log: next.log.map((entry, logIndex) => {
          if (logIndex < logStart) return entry;
          return markForcedActionMainLog(entry.turn ? entry : { ...entry, turn: "enemy" as const }, skillName);
        }),
      };
    }
  }
  if (next.phase === "ended") return next;
  return {
    ...next,
    phase: originalPhase,
    turn: {
      ...next.turn,
      enemyAttacksLeft: originalEnemyAttacksLeft,
      enemyPhasesCompleted: originalEnemyPhasesCompleted,
    },
  };
}

export function applyPlayerV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
  ticked: {
    selfBuffs: import("./combatShared").V2BuffMap;
    selfDebuffs: import("./combatShared").V2BuffMap;
    enemyDebuffs: import("./combatShared").V2BuffMap;
  },
  playerName = "플레이어",
): {
  state: BattleState;
  castFired: boolean;
  /** 이번 스킬의 실제 적중 횟수로 발생한 추가 기본 공격 수. */
  signatureExtraActions: number;
  // 바람/대지 ATB 템포(원소술사) — 비-ATB(legacy) 호출부는 무시. ATB 루프가 틱 계산에 반영.
  selfHastePct: number;
  enemyDelayPct: number;
} {
  const tickedSelfBuffs = ticked.selfBuffs;
  const tickedSelfDebuffs = ticked.selfDebuffs;
  const tickedEnemyDebuffs = ticked.enemyDebuffs;
  const shadowCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_shadowblade_swordshadow",
  );
  const shadowCoreMechanic =
    V2_SKILLS.v2c_shadowblade_swordshadow.tier7Mechanic;
  const formulaCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_primordialsage_completeformula",
  );
  const formulaOptimizationEquipped = state.v2Skills.equipped.includes(
    "v2c_primordialsage_optimization",
  );
  const formulaState = state.stacks.tier7?.formula ?? {
    stages: 0,
    seenSkillIds: [],
  };
  const formulaOverdraftSkillIds =
    formulaCoreEquipped && formulaOptimizationEquipped
      ? formulaCompletionOverdraftSkillIds({
          state: formulaState,
          learned: state.v2Skills.learned,
          equipped: state.v2Skills.equipped,
        })
      : [];
  const tier6Cast = tier6PveCastContext(state, player);
  const activeEnemyBleed = state.enemyV2Dots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const activeEnemyPoison = state.enemyV2Dots.find(
    (dot) => dot.tag === "poison" && dot.turns > 0,
  );
  const needsBleedHuntRoll = state.v2Skills.equipped.some(
    (skillId) =>
      V2_SKILLS[skillId]?.bleedHunt?.directPhysicalHitBleedExtend != null,
  );
  const castInput: V2SkillCastInput = {
    diagnosticActor: "player",
    skills: state.v2Skills,
    cooldowns: state.v2SkillCooldowns,
    magicMpCostReductionPct: formulaOptimizationEquipped ? 20 : 0,
    mpOverdraftSkillIds: formulaOverdraftSkillIds,
    procRoll: combatRandom() * 100,
    nextProcRoll: () => combatRandom() * 100,
    bleedHuntRoll: needsBleedHuntRoll ? combatRandom() * 100 : undefined,
    procChanceBonus: player.skillProcChanceAdd ?? 0,
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    turn: state.turn.completedPlayerTurns + 1,
    alternateLastSkillByPair: state.stacks.patternAlternateLastSkillByPair,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? effectiveCombatPatternFromEquipped(
          state.v2Skills.equipped,
          state.v2Skills.pattern ??
            smartDefaultPatternFromEquipped(state.v2Skills.equipped),
        )
      : undefined,
    berserker: state.berserker
      ? berserkerCastContext(
          player.berserkerMadnessRank ?? 0,
          state.berserker,
        )
      : undefined,
    attacker: {
      mp: state.playerMp,
      atk: tier6Cast.tier6UnityAtk,
      attackCount: player.attackCount,
      magicAtk: tier6Cast.tier6UnityMagicAtk,
      singleHitPhysicalSkillDamagePct:
        player.singleHitPhysicalSkillDamagePct,
      minDamage: player.minDamage,
      magicMinDamage: player.magicMinDamage,
      healMult: player.healMult,
      maxHp: state.playerMaxHp,
      // PR2-B — def/vit 비례 딜·현재HP(사혈격/기공순환)·maxMp(보호막/명상)·차수 flat.
      def: effectiveMutationDef(
        player.def,
        state.stacks.mutationWeight,
        player.stoneskinDefPctPerWeight ?? 0,
      ),
      str: player.strStat,
      int: player.intStat,
      vit: player.vitStat,
      dex: player.dexStat,
      luk: player.lukStat,
      spi: player.spiStat,
      allStatTotal: player.allStatTotal,
      currentHp: state.playerHp,
      maxMp: state.playerMaxMp,
      classTier: player.classTier,
      fortressImpact: state.stacks.fortressImpact,
      ironWallReflectCharges: state.stacks.ironWallReflectCharges,
      fortressImpactDamagePctPerStack:
        player.fortressImpactDamagePctPerStack,
      fortressDefSkillStatCoefPct: player.fortressDefSkillStatCoefPct,
      lawInscription: player.lawInscription,
      lawInscriptions: state.stacks.lawInscriptions,
      mutationWeight: state.stacks.mutationWeight,
      tripleWard: state.stacks.tripleWard,
      bloodlineBurstReady: tier6Cast.bloodlineBurstReady,
      bleedPhysicalSkillDamagePctPerStack:
        player.bleedPhysicalSkillDamagePctPerStack,
      // 활성 상태 효과 — self_buff_pct 조건 평가용(만료 시 재시전 선풍각·철포·운기 등).
      selfShield: state.stacks.playerShield,
      selfShieldActive: state.stacks.playerShield > 0,
      // 군림·질주·적랑 등 장비 발동형 속도 버프는 v2SelfBuffs 가 아니라 BattleBuffs 에 저장된다.
      selfStatBuffActive: {
        spd: state.buffs.playerSpdTurnsLeft > 0,
      },
      selfBuffPctActive: {
        evasion: state.stacks.skillEvasionTurns > 0,
        crit: state.stacks.skillCritTurns > 0,
        damageReduction: state.stacks.skillDmgReduceTurns > 0,
        reflectDamage: state.stacks.skillReflectBoostTurns > 0,
        regen: state.stacks.skillRegenTurns > 0,
        guaranteedEvade: state.stacks.evadesRemaining > 0,
        duelistDeclaration: (state.duelistBuff?.remainingBasicHits ?? 0) > 0,
      },
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      characterElement: player.characterElement,
    },
    target: {
      def: playerSkillTargetDef(state, player),
      magicDef: playerSkillTargetMagicDef(state, player),
      // PR-5b: monster 측 v2 self buff 도 def 곱셈에 반영 (격리 해제 일관).
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: tickedEnemyDebuffs,
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발/비전작렬).
      currentHp: state.enemyHp,
      maxHp: state.enemy.hp,
      executeHpThresholdFloorPct:
        state.isBoss === true ? 0 : NORMAL_MONSTER_EXECUTION_HP_PCT,
      bleedStacks: activeEnemyBleed?.stacks ?? 0,
      bleedTurns: activeEnemyBleed?.turns ?? 0,
      poisonStacks: activeEnemyPoison?.stacks ?? 0,
      poisonTurns: activeEnemyPoison?.turns ?? 0,
      magicVulnStacks: state.stacks.enemyMagicVulnStacks,
      frostChillStacks: state.stacks.enemyFrostChillStacks,
      enemyVulnerabilityActive: state.stacks.enemyVulnTurns > 0,
      enemyDamageDownActive: state.stacks.enemyDamageDownTurns > 0,
      enemySkillProcDownActive: state.stacks.enemySkillProcDownTurns > 0,
      enemyHealReductionActive: state.stacks.enemyHealReduceTurns > 0,
    },
  };
  const ruinChargeAtActionStart = state.stacks.tier7?.ruinCharge;
  const ruinSwordMechanic = V2_SKILLS.v2c_ruinblade_ruinsword.tier7Mechanic;
  const ruinChargeReady =
    ruinSwordMechanic?.kind === "chargedFinisher" &&
    canStartRuinCharge(
      state.stacks.tier7?.swordIntent ?? 0,
      ruinSwordMechanic.requiredIntentStacks,
    );
  const eligibleCastInput =
    !ruinChargeAtActionStart && !ruinChargeReady
      ? {
          ...castInput,
          skills: {
            ...castInput.skills,
            learned: castInput.skills.learned.filter(
              (skillId) => skillId !== "v2c_ruinblade_ruinsword",
            ),
            equipped: castInput.skills.equipped.filter(
              (skillId) => skillId !== "v2c_ruinblade_ruinsword",
            ),
          },
        }
      : castInput;
  let result = ruinChargeAtActionStart
    ? resolveV2SkillCast({
        ...castInput,
        skills: {
          learned: ["v2c_ruinblade_ruinsword"],
          equipped: ["v2c_ruinblade_ruinsword"],
        },
        cooldowns: {
          ...state.v2SkillCooldowns,
          v2c_ruinblade_ruinsword: 0,
        },
        combatPattern: undefined,
        procRoll: 0,
        attacker: {
          ...castInput.attacker,
          mp: Math.max(castInput.attacker.mp, 100),
        },
      })
    : resolveV2SkillCast(eligibleCastInput);
  const rerunSelectedCast = (
    current: V2SkillCastResult,
    overrides: Pick<
      V2SkillCastInput,
      "directDamagePiercePctAdd" | "directDamagePiercePctOverride"
    > & {
      attacker?: Partial<V2SkillCastInput["attacker"]>;
    },
  ): V2SkillCastResult => {
    if (!current.castSkillId) return current;
    const tier7AttackerOverride =
      current.castSkillId === "v2c_swordsaint_flash" && shadowCoreEquipped
        ? { str: Math.max(player.strStat ?? 0, player.lukStat ?? 0) }
        : current.castSkillId === "v2c_celestialdragon_combo" &&
            state.v2Skills.equipped.includes("v2c_skyascendant_crossover")
          ? { str: Math.max(player.strStat ?? 0, player.dexStat ?? 0) }
          : {};
    const rerun = resolveV2SkillCast({
      ...castInput,
      ...overrides,
      skills: {
        ...castInput.skills,
        equipped: [
          current.castSkillId,
          ...castInput.skills.equipped.filter(
            (skillId) => skillId !== current.castSkillId,
          ),
        ],
      },
      cooldowns: {
        ...castInput.cooldowns,
        [current.castSkillId]: 0,
      },
      combatPattern: undefined,
      procRoll: 0,
      attacker: {
        ...castInput.attacker,
        ...tier7AttackerOverride,
        ...overrides.attacker,
        mp: ruinChargeAtActionStart
          ? Math.max(castInput.attacker.mp, 100)
          : castInput.attacker.mp,
      },
    });
    return preservePatternAlternateTransition(current, rerun);
  };
  if (result.castSkillId === "v2c_swordsaint_flash" && shadowCoreEquipped) {
    result = rerunSelectedCast(result, {
      attacker: {
        str: Math.max(player.strStat ?? 0, player.lukStat ?? 0),
      },
    });
  } else if (
    result.castSkillId === "v2c_celestialdragon_combo" &&
    state.v2Skills.equipped.includes("v2c_skyascendant_crossover")
  ) {
    result = rerunSelectedCast(result, {
      attacker: {
        str: Math.max(player.strStat ?? 0, player.dexStat ?? 0),
      },
    });
  }
  if (ruinChargeAtActionStart) {
    result = {
      ...result,
      nextMp: state.playerMp,
      nextCooldowns: state.v2SkillCooldowns,
    };
  }
  const startingRuinCharge =
    !ruinChargeAtActionStart &&
    result.castSkillId === "v2c_ruinblade_ruinsword";
  if (startingRuinCharge) {
    result = {
      ...result,
      enemyDamage: 0,
      magicEnemyDamage: 0,
      hitDamages: [],
    };
  }
  const castDefinition = result.castSkillId
    ? V2_SKILLS[result.castSkillId]
    : undefined;
  const directDamageEffects = castDefinition?.effects.filter(
    (effect) => effect.kind === "damage",
  );
  const isSinglePhysicalSkill =
    castDefinition?.category === "attack" &&
    directDamageEffects?.length === 1 &&
    directDamageEffects[0]?.kind === "damage" &&
    directDamageEffects[0].scaling !== "magic" &&
    directDamageEffects[0].scaling !== "spi";
  const crossCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_skyascendant_crossover",
  );
  const crossFamily: CrossFamily | undefined = result.castSkillId
    ? (["v2c_skyascendant_fallingstar", "v2c_heavenlybow_orbit"].includes(
        result.castSkillId,
      )
        ? "ranged"
        : [
              "v2c_skyascendant_voidbreak",
              "v2c_celestialdragon_combo",
            ].includes(result.castSkillId)
          ? "martial"
          : undefined)
    : undefined;
  const crossover = crossCoreEquipped
    ? resolveCrossover({
        state: { lastFamily: state.stacks.tier7?.lastCrossFamily },
        currentFamily: crossFamily,
        hit: result.enemyDamage > 0,
        pvp: false,
      })
    : undefined;
  const formulaStages: 0 | 1 | 2 =
    result.castSkillId
      ? formulaStagesForCast(result.castSkillId, result.castSkillName)
      : 0;
  const formulaPreview =
    formulaCoreEquipped && result.castSkillId
      ? previewFormulaCast({
          state: formulaState,
          skillId: result.castSkillId,
          stages: formulaStages,
        })
      : undefined;
  const catalogPiercePct = Math.max(
    0,
    ...(directDamageEffects ?? []).map((effect) =>
      effect.kind === "damage" ? effect.pierceDamagePct ?? 0 : 0,
    ),
  );
  const crossoverPierceAdd =
    crossover?.bonus === "capture"
      ? Math.max(0, crossover.penetrationPct - catalogPiercePct)
      : 0;
  const formulaPierceAdd = formulaPreview?.completes ? 35 : 0;
  if (crossoverPierceAdd > 0 || formulaPierceAdd > 0) {
    result = rerunSelectedCast(result, {
      directDamagePiercePctAdd: crossoverPierceAdd + formulaPierceAdd,
    });
  }
  // 일반 회피도는 스킬을 빗나가게 하지 않는다. 대상의 회피도와 시전자의 적중도를
  // 대결해 직접 피해만 줄이고, 적중 시 부가 효과는 정상 적용한다.
  const skillEvaDown =
    state.stacks.enemyEvasionDownTurns > 0
      ? state.stacks.enemyEvasionDownPct
      : 0;
  const skillEnemyEvaRating =
    Math.max(0, state.enemy.evasionPct ?? 0) *
    (1 - Math.min(100, Math.max(0, skillEvaDown)) / 100) *
    (player.precisionEvasionMult ?? 1);
  const skillEvasionReductionPct = evasionDamageReductionPct(
    skillEnemyEvaRating,
    (player.accRating ?? player.accuracyPct ?? 0) +
      (result.castSkillId
        ? (V2_SKILLS[result.castSkillId]?.accuracyBonusPct ?? 0)
        : 0) +
      result.skillAccuracyBonusPct +
      (crossover?.accuracyBonusPct ?? 0),
  );
  // 주문 중첩(워메이지)·약점 노출(마도사) — 스킬 데미지 배수(현재 누적 스택 기준, 적용은 이번 시전부터).
  //   주문중첩: 누적 시전 횟수 × skillDmgPctPerCast.  약점노출: 적 마법취약 스택 × enemyMagicVulnPctPerStack.
  // 둘 다 미보유면 스택 0 → 배수 1 → 무변. 적중 후 아래에서 스택 증가.
  const spellStackMult =
    1 +
    (state.stacks.spellCastCount * (player.skillDmgPctPerCast ?? 0)) / 100;
  const magicVulnMult =
    1 +
    (state.stacks.enemyMagicVulnStacks *
      (player.enemyMagicVulnPctPerStack ?? 0)) /
      100;
  const erosionMult =
    state.stacks.enemyDotVulnTurns > 0 && state.stacks.enemyMagicVulnStacks > 0
      ? 1 + state.stacks.enemyDotVulnPct / 100
      : 1;
  // PR2-B-2c 속박 — 적 취약(받는 피해 +%) 가산.
  const vulnMult =
    state.stacks.enemyVulnTurns > 0
      ? 1 + state.stacks.enemyVulnPct / 100
      : 1;
  const magicSkillDamageBonus =
    result.magicEnemyDamage > 0 && (player.magicSkillDamagePct ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage * (player.magicSkillDamagePct ?? 0)) / 100,
        )
      : 0;
  const lawMagicVulnBonus =
    result.magicEnemyDamage > 0 &&
    (state.stacks.enemyMagicVulnTurns ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage *
            (state.stacks.enemyMagicVulnPct ?? 0)) /
            100,
        )
      : 0;
  const skillDamageBase =
    result.enemyDamage + magicSkillDamageBonus + lawMagicVulnBonus;
  // 스킬 치명타 — 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT 로
  //   분리(평타 critMult 비연동 → 비폭주). 오버플로는 관련 패시브 보유 시에만 스킬에도 적용.
  //   데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → 기존 RNG 스트림 보존).
  const skillCritAfterEvadeFired =
    result.enemyDamage > 0 && state.flags.skillCritAfterEvadePending;
  const skillCritFired =
    result.enemyDamage > 0 &&
    (result.berserkerTransition.forceSkillCrit ||
      skillCritAfterEvadeFired ||
      ((player.critChancePct ?? 0) +
        (result.castSkillId
          ? (V2_SKILLS[result.castSkillId]?.skillCritChancePct ?? 0)
          : 0) >
        0 &&
        combatRandom() * 100 <
          Math.min(
            CRIT_PCT_CAP,
            (player.critChancePct ?? 0) +
              (result.castSkillId
                ? (V2_SKILLS[result.castSkillId]?.skillCritChancePct ?? 0)
                : 0),
          )));
  // 스킬 다단히트 — 이 턴 추가 공격 확률로 굴려둔 공격 횟수(playerAttacksLeft)만큼 데미지
  //   스킬을 반복 타격한다. 평타 빌드가 누리는 SPD(추가 공격) 가치를 스킬 빌드에도 부여.
  //   데미지 스킬에만 적용(버프/힐/마나/DoT 부여는 1회 — 다중 적용 X). 새 RNG 미소비(이미
  //   굴린 값 재사용) → 추가 공격 0(평타 1타) 빌드는 skillHitCount=1 로 기존과 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, state.playerAttacksLeft)
      : 1;
  const skillPreCriticalMultiplier =
    spellStackMult * magicVulnMult * erosionMult * vulnMult;
  const skillCriticalMultiplier = skillCritFired
    ? SKILL_CRIT_MULT +
      Math.max(0, player.skillCritDmgPct ?? 0) / 100 +
      result.berserkerTransition.bonusSkillCritDamagePct / 100 +
      (player.skillCritOverflow
        ? computeCritOverflowBonus(player.critChancePct ?? 0)
        : 0)
    : 1;
  const directSkillSignature = resolveDirectSkillHitSignatures(
    player.equipSignatures,
    {
      dealtDamage: Boolean(result.castSkillId && result.enemyDamage > 0),
      targetPoisoned: isEnemyPoisoned(state),
    },
  );
  const baseSingleSkillDamageBeforeEvasion = computeDirectSkillDamage({
    totalDamage: skillDamageBase,
    magicDamage:
      result.magicEnemyDamage + magicSkillDamageBonus + lawMagicVulnBonus,
    preCriticalMultiplier:
      skillPreCriticalMultiplier * directSkillSignature.damageMult,
    criticalMultiplier: skillCriticalMultiplier,
    equipmentMagicCritBonus:
      Math.max(0, player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
    critical: skillCritFired,
  });
  const intentCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_ruinblade_oneintent",
  );
  let tier7FinalDamagePct = 0;
  if (
    intentCoreEquipped &&
    isSinglePhysicalSkill &&
    result.castSkillId !== "v2c_ruinblade_ruinsword"
  ) {
    tier7FinalDamagePct += (state.stacks.tier7?.swordIntent ?? 0) * 8;
  }
  if (result.castSkillId === "v2c_ruinblade_limitstrike") {
    tier7FinalDamagePct += ruinIntentStrikeBonus({
      hp: state.playerHp,
      maxHp: state.playerMaxHp,
      mechanic: V2_SKILLS.v2c_ruinblade_limitstrike.tier7Mechanic,
    });
  }
  if (ruinChargeAtActionStart) {
    tier7FinalDamagePct += ruinSwordBonusesForMechanic({
      state: ruinChargeAtActionStart,
      hp: state.playerHp,
      maxHp: state.playerMaxHp,
      pvp: false, mechanic: ruinSwordMechanic,
    }).damagePct;
  }
  if (crossover?.bonus === "capture") {
    tier7FinalDamagePct += crossover.damagePct;
  }
  if (formulaPreview?.completes) tier7FinalDamagePct += 50;
  const shadowFollowUp = consumeShadowFollowUp({
    pendingPct: state.stacks.tier7?.shadowFollowUpPct ?? 0,
    isSinglePhysical: Boolean(isSinglePhysicalSkill),
    hit: result.enemyDamage > 0,
    damage: Math.round(
      baseSingleSkillDamageBeforeEvasion * (1 + tier7FinalDamagePct / 100),
    ),
  });
  const singleSkillDamage = shadowFollowUp.damage;
  let nextComboHitCount = state.stacks.comboHitCount;
  let landedSkillHits = 0;
  let dealtDirectSkillDamage = 0;
  // 시전이 발동(castSkillId)했으면 누적 증가. 주문중첩=매 시전, 약점노출=적중(데미지>0) 시. 상한 클램프.
  const nextSpellCastCount =
    (player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
      ? Math.min(SPELL_STACK_CAP, state.stacks.spellCastCount + 1)
      : state.stacks.spellCastCount;
  const magicVulnApplyChancePct = player.enemyMagicVulnApplyChancePct ?? 100;
  const magicVulnApplied =
    (player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0 &&
    magicVulnApplyChancePct > 0 &&
    (magicVulnApplyChancePct >= 100 ||
      combatRandom() * 100 < magicVulnApplyChancePct);
  const nextMagicVulnStacks =
    magicVulnApplied
      ? Math.min(
          MAGIC_VULN_STACK_CAP,
          state.stacks.enemyMagicVulnStacks + 1,
        )
      : state.stacks.enemyMagicVulnStacks;
  // 절제(워메이지 특성) — 스킬 마나 소모 -%. resolveV2SkillCast 가 계산한 회복 전
  // 실제 지불액의 pct% 를 환급한다. 미시전이면 mpSpent 0 → 무변.
  const mpCostReduction = Math.max(
    0,
    (player.mpCostReductionPct ?? 0) -
      (formulaOptimizationEquipped ? 20 : 0),
  );
  const costPaid = result.mpSpent;
  const mpRefund =
    mpCostReduction > 0 && costPaid > 0
      ? Math.floor((costPaid * mpCostReduction) / 100)
      : 0;
  const sigMpRefund = onSkillCastMpRefund(player.equipSignatures);
  const sigMpRefundAmount =
    sigMpRefund && costPaid > 0
      ? Math.floor((costPaid * sigMpRefund.pct) / 100)
      : 0;
  const adjustedNextMp = Math.min(
    state.playerMaxMp,
    result.nextMp + mpRefund + sigMpRefundAmount,
  );
  // 3) state 업데이트 — MP, cooldown, buff/debuff map, HP delta, log.
  let nextEnemyHp = state.enemyHp;
  let nextPlayerHp = state.playerHp;
  let nextLog =
    result.castSkillId && result.castSkillName
      ? appendSkillCastLog(
          state.log,
          result.castSkillId,
          result.castSkillName,
          { turn: "player" },
        )
      : state.log;
  let healShieldAmount = 0;
  let actualSkillDamage = 0;
  let damageMeterSkillTotal = 0;
  let tier6SkillHitDamages: number[] = [];
  // hpCostDamage의 HP는 적중한 피해로 바뀌는 자원이다. 확정 회피에서는 비용이 0이 되며,
  // 일반 회피 경감은 적중으로 취급해 흡혈보다 먼저 비용을 낸다.
  if (result.selfHpCost > 0) {
    const cost = Math.min(Math.max(0, nextPlayerHp - 1), result.selfHpCost);
    if (cost > 0) {
      nextPlayerHp -= cost;
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `${result.castSkillName ?? "사혈"}! 생명력 ${cost} 소모`,
        turn: "player",
      });
    }
  }
  if (result.berserkerTransition.grantFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전] 다음 파멸일격 또는 멸왕일도를 준비한다.`,
      turn: "player",
    });
  }
  if (result.berserkerTransition.consumeFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전 해방] ${result.castSkillName ?? "필살기"}에 피의 기세를 터뜨린다.`,
      turn: "player",
    });
  }
  if (result.berserkerTransition.consumeDeathDamage) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[패황의 지배] ${result.castSkillName ?? "공격"}에 죽음 직전의 힘을 싣는다.`,
      turn: "player",
    });
  }
  if (skillCritAfterEvadeFired && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] 회피의 여세로 ${result.castSkillName}이(가) 치명타가 된다.`,
      turn: "player",
    });
  }
  // 구조화된 시전 경계와 별개로 damage/heal 로그에도 스킬명을 포함한다.
  // damage 효과: 일반 공격과 같은 player_attack kind. 스킬명을 평타 "공격!" 자리의 액션
  //   라벨로 표기("강타! N 피해를 입혔다."). 브라켓 태그 대신 발동 스킬을 앞세운다.
  if (result.enemyDamage > 0 && result.castSkillName) {
    // 다단 스킬은 타마다 한 줄. 부스트는 타당 raw 비율로 분배(합 = 1회분 singleSkillDamage).
    // 다단히트(추가 공격)면 1회분 타격 묶음을 skillHitCount 번 반복해 보여준다.
    const singleHits =
      result.hitDamages.length > 1
        ? distributeBoostedHits(result.hitDamages, singleSkillDamage)
        : [singleSkillDamage];
    const repeatedHits: number[] = [];
    for (let h = 0; h < skillHitCount; h++) repeatedHits.push(...singleHits);
    const comboResult = applyComboFinisherToHits(
      repeatedHits,
      state.stacks.comboHitCount,
      player.comboFinisherBonusPct,
    );
    const perHitBeforeEvasion = comboResult.hitDamages;
    const perHit = perHitBeforeEvasion.map((hit) =>
      applyEvasionDamageReduction(hit, skillEvasionReductionPct),
    );
    tier6SkillHitDamages = perHit.filter((hit) => hit > 0);
    const rawDamageBeforeEvasion = perHitBeforeEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    const rawDamageAfterEvasion = perHit.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (rawDamageAfterEvasion < rawDamageBeforeEvasion) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[회피 경감 ${skillEvasionReductionPct.toFixed(1)}%] ${state.enemy.name} 피해 -${rawDamageBeforeEvasion - rawDamageAfterEvasion}`,
      });
    }
    landedSkillHits = perHit.filter((hit) => hit > 0).length;
    nextComboHitCount = comboResult.nextComboHitCount;
    const boostedSkillDamage = perHit.reduce((sum, hit) => sum + hit, 0);
    damageMeterSkillTotal += boostedSkillDamage;
    dealtDirectSkillDamage = boostedSkillDamage;
    const enemyHpBeforeSkill = nextEnemyHp;
    recordCombatDamage(result.castSkillId ?? "skill", "enemy", nextEnemyHp, boostedSkillDamage);
    nextEnemyHp = Math.max(0, nextEnemyHp - boostedSkillDamage);
    if (crossover?.bonus === "pursuit") {
      const pursuitDamage = Math.round(
        boostedSkillDamage * (crossover.damagePct / 100),
      );
      damageMeterSkillTotal += pursuitDamage;
      recordCombatDamage("crossover:pursuit", "enemy", nextEnemyHp, pursuitDamage);
      nextEnemyHp = Math.max(0, nextEnemyHp - pursuitDamage);
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        effect: "extra_damage",
        text: `[교차·추격] ${pursuitDamage} 추가 피해.`,
        turn: "player",
      });
    }
    actualSkillDamage = Math.max(0, enemyHpBeforeSkill - nextEnemyHp);
    for (const hit of perHit) {
      if (hit <= 0) continue; // 분배 반올림으로 0 이 된 타는 줄 생략(합은 이미 차감됨).
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [치명타]" : ""} ${hit} 피해를 입혔다.`,
        directHits: 1,
        ...(state.bossMechanic?.kind === "skyward_crystal_eye" ? { criticalDirectHits: skillCritFired ? 1 : 0 } : {}),
      });
    }
  }
  const frostChill = resolveFrostChillGain(
    state.stacks.enemyFrostChillStacks,
    landedSkillHits > 0 ? result.frostChillGain : 0,
    {
      damagePct: player.freezeDamagePct,
      delayPct: player.freezeDelayPct,
      retainStacks: player.freezeRetainStacks,
    },
  );
  let freezeDamage = 0;
  if (landedSkillHits > 0 && frostChill.requestedGain > 0) {
    if (frostChill.triggered && result.castSkillId) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillTriggerLog(),
        turn: "player",
      });
      const effectiveInt = Math.floor(
        Math.max(0, player.intStat ?? 0) *
          v2MagicBuffMult(tickedSelfBuffs, tickedSelfDebuffs),
      );
      const rawFreezeDamage = freezeRawDamage({
        int: effectiveInt,
        maxMp: state.playerMaxMp,
        damagePct: frostChill.damagePct,
      });
      const [tierScaledEffect] = rebalanceDynamicV2SkillEffects(
        result.castSkillId,
        [
          {
            kind: "damage",
            statCoef: 0,
            baseFlat: rawFreezeDamage,
            scaling: "magic",
          },
        ],
      );
      const tierScaledRaw =
        tierScaledEffect?.kind === "damage"
          ? tierScaledEffect.baseFlat ?? rawFreezeDamage
          : rawFreezeDamage;
      const freezeBaseDamage = v2DamageAmount({
        attackerAtk: 0,
        attackerMagicAtk: 0,
        attackerMagicMinDamage: player.magicMinDamage,
        scaling: "magic",
        targetDef: playerSkillTargetDef(state, player),
        targetMagicDef: playerSkillTargetMagicDef(state, player),
        statCoef: 0,
        baseFlat: tierScaledRaw,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: state.enemyV2SelfBuffs,
        targetSelfDebuffs: tickedEnemyDebuffs,
      });
      const freezeMagicSkillBonus =
        (player.magicSkillDamagePct ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage * (player.magicSkillDamagePct ?? 0)) / 100,
            )
          : 0;
      const freezeLawVulnBonus =
        (state.stacks.enemyMagicVulnTurns ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage *
                (state.stacks.enemyMagicVulnPct ?? 0)) /
                100,
            )
          : 0;
      const freezeMagicDamage =
        freezeBaseDamage + freezeMagicSkillBonus + freezeLawVulnBonus;
      freezeDamage = applyEvasionDamageReduction(
        computeDirectSkillDamage({
          totalDamage: freezeMagicDamage,
          magicDamage: freezeMagicDamage,
          preCriticalMultiplier: skillPreCriticalMultiplier,
          criticalMultiplier: skillCriticalMultiplier,
          equipmentMagicCritBonus:
            Math.max(0, player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
          critical: skillCritFired,
        }),
        skillEvasionReductionPct,
      );
      nextEnemyHp = Math.max(0, nextEnemyHp - freezeDamage);
      damageMeterSkillTotal += freezeDamage;
      if (freezeDamage > 0) {
        tier6SkillHitDamages.push(freezeDamage);
        nextLog = appendLog(nextLog, {
          kind: "player_attack",
          text: `빙결!${skillCritFired ? " [치명타]" : ""} ${freezeDamage} 피해를 입혔다.`,
        });
      }
    } else {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillGainLog(
          frostChill.requestedGain,
          frostChill.next,
        ),
        turn: "player",
      });
    }
  }
  const sigSkill = resolveOffensiveSignatureTriggers(
    player.equipSignatures,
    {
      critical: skillCritFired,
      dealtDamage: landedSkillHits > 0,
      allowShock: canApplyShock(state.stacks.enemyShockAction),
    },
  );
  const sigSkillTargetDots = [
    ...(directSkillSignature.poison
      ? [
          makePoisonDot({
            stacks: directSkillSignature.poison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.critPoison
      ? [
          makePoisonDot({
            stacks: 1,
            pctMaxHpPerStack: SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitPoison
      ? [
          makePoisonDot({
            stacks: sigSkill.hitPoison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitBleed
      ? [
          makeBleedDot({
            stacks: sigSkill.hitBleed.stacks,
            flatPerStack: 0,
            sourceAtk: player.atk,
          }),
        ]
      : []),
  ];
  const activeSkillCritSpdMult =
    state.buffs.playerSpdTurnsLeft > 0 ? state.buffs.playerSpdMult : 1;
  const sigSkillCritSpdBuff = sigSkill.critSpeed
    ? {
        playerSpdMult: Math.max(
          activeSkillCritSpdMult,
          sigSkill.critSpeed.mult,
        ),
        playerSpdTurnsLeft: Math.max(
          state.buffs.playerSpdTurnsLeft,
          sigSkill.critSpeed.turns,
        ),
      }
    : null;
  const activeSkillEnemySpdMult =
    state.buffs.enemySpdTurnsLeft > 0 ? state.buffs.enemySpdMult : 1;
  const sigSkillEnemySlow = sigSkill.critChill
    ? {
        enemySpdMult: Math.min(
          activeSkillEnemySpdMult,
          sigSkill.critChill.mult,
        ),
        enemySpdTurnsLeft: Math.max(
          state.buffs.enemySpdTurnsLeft,
          sigSkill.critChill.turns,
        ),
      }
    : null;
  const activeSkillEnemyDefDebuffPct =
    state.buffs.enemyDefDebuffTurnsLeft > 0
      ? state.buffs.enemyDefDebuffPct
      : 0;
  const sigSkillEnemyDefDebuff = sigSkill.critDefDebuff
    ? {
        enemyDefDebuffPct: Math.max(
          activeSkillEnemyDefDebuffPct,
          sigSkill.critDefDebuff.pct,
        ),
        enemyDefDebuffTurnsLeft: Math.max(
          state.buffs.enemyDefDebuffTurnsLeft,
          sigSkill.critDefDebuff.turns,
        ),
      }
    : null;
  const sigSkillBuffs = {
    ...(sigSkillCritSpdBuff ?? {}),
    ...(sigSkillEnemySlow ?? {}),
    ...(sigSkillEnemyDefDebuff ?? {}),
  };
  const hasSigSkillBuffs =
    !!sigSkillCritSpdBuff ||
    !!sigSkillEnemySlow ||
    !!sigSkillEnemyDefDebuff;
  if (nextMagicVulnStacks > state.stacks.enemyMagicVulnStacks) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흉조] 적에게 마법취약 +1 (${nextMagicVulnStacks}/${MAGIC_VULN_STACK_CAP})`,
    });
  }
  if (sigSkillCritSpdBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.critSpeed?.label ?? "군림"}] 결정타 — 속도가 솟구친다!`,
      turn: "player",
    });
  }
  if (directSkillSignature.poison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${directSkillSignature.poison.label}] ${state.enemy.name}에게 중독 ${directSkillSignature.poison.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.critPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[독니] ${state.enemy.name}을(를) 중독시켰다!`,
      turn: "player",
    });
  }
  if (sigSkill.hitPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitPoison.label}] ${state.enemy.name}에게 중독 ${sigSkill.hitPoison.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.hitBleed) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitBleed.label}] ${state.enemy.name}에게 출혈 ${sigSkill.hitBleed.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.critChill) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatChillSlowLog(state.enemy.name, sigSkill.critChill),
      turn: "player",
    });
  }
  if (sigSkill.critDefDebuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatDefDebuffLog(state.enemy.name, sigSkill.critDefDebuff),
      turn: "player",
    });
  }
  if (sigSkill.hitShock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatShockAppliedLog(state.enemy.name, sigSkill.hitShock),
      turn: "player",
    });
  }
  // heal 효과: damage 없는 회복형 스킬 (회복/강화회복) — player_attack kind 로 통일.
  const resolvedSelfHeal = skillSelfHealingAmount(
    result, actualSkillDamage, tier6Cast.tier6UnityMult, player.receivedHealMult,
  );
  const healed = applySkillHealing({
    hp: nextPlayerHp, maxHp: state.playerMaxHp, player, playerName,
    skillName: result.castSkillName, skillId: result.castSkillId, skillHeal: resolvedSelfHeal, log: nextLog,
    passiveHeal: healingAfterReceivedMultiplier(
      Math.floor((actualSkillDamage * (player.passiveLifestealPct ?? 0)) / 100),
      player.receivedHealMult,
    ),
  });
  nextPlayerHp = healed.hp;
  nextLog = healed.log;
  healShieldAmount += healed.shield;
  // 마나 회복(명상 등) — 로그 한 줄(없으면 빈 턴처럼 보이는 갭 방지). 1턴 1행동이라
  //   이 턴은 공격 대신 마나를 채운 것. HP 회복 로그와 동형.
  if (result.manaRestored > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text:
        result.castSkillId === "v2c_primordialmage_return"
          ? `[근원공명] 태초회귀로 마나 ${result.manaRestored} 회복했다.`
          : `${result.castSkillName}! 마나 ${result.manaRestored} 회복했다.`,
    });
  }
  if (result.guaranteedEvadesToAdd > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 확정 회피를 준비했다.`,
    });
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 다음 공격 ${result.guaranteedEvadesToAdd}회를 반드시 회피한다.`,
      turn: "player",
    });
  }
  if (result.ironWallReflectToApply && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 철벽 반사 ${result.ironWallReflectToApply.charges}회 준비`,
    });
  }
  const lawGain = addLawInscriptionGain(
    state.stacks.lawInscriptions,
    result.lawInscriptionGain,
  );
  const nextLawInscriptions = result.lawInscriptionsToConsume
    ? emptyLawInscriptionState()
    : lawGain.state;
  const lawGainText = lawInscriptionGainLog(
    lawGain.gained,
    nextLawInscriptions,
  );
  const lawConsumeText = lawInscriptionConsumeLog(
    result.lawInscriptionsToConsume,
  );
  if (lawGainText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawGainText,
      turn: "player",
    });
  }
  if (lawConsumeText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawConsumeText,
      turn: "player",
    });
  }
  if (result.lawInscriptionComplete) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: "공격·환류·침식·수호가 하나로 이어져 완성 각인이 발동했다.",
      turn: "player",
    });
  }
  const refreshedTripleWard = result.refreshTripleWards
    ? refreshTripleWardState(
        state.stacks.tripleWard,
        aggregateEquippedPassives(state.v2Skills.equipped).tripleWardRank,
      )
    : state.stacks.tripleWard;
  if (result.refreshTripleWards && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 삼중 결계 ${refreshedTripleWard.physical}회 재전개`,
      turn: "player",
    });
  }
  if (
    result.fortressImpactToConsume > 0 &&
    result.enemyDamage > 0 &&
    result.castSkillName
  ) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 충격 ${result.fortressImpactToConsume}스택 소비`,
      turn: "player",
    });
  }
  for (const text of mutationTransitionLogLines(
    result.castSkillName,
    result.mutationTransition,
  )) {
    nextLog = appendLog(nextLog, { kind: "info", text, turn: "player" });
  }
  if (sigMpRefund && sigMpRefundAmount > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigMpRefund.label}] 마나 ${sigMpRefundAmount} 환급`,
      turn: "player",
    });
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  const nextEnemyDebuffs = applyV2BuffsToMap(tickedEnemyDebuffs, result.enemyDebuffsToApply);
  const dotsToApplyToTarget = applyPoisonDamageToDots(
    result.dotsToApplyToTarget,
    player,
  );
  // PR-8 — dot effect 결과를 적 측 v2Dots 에 박음. 같은 label refresh.
  const dotsBeforeBleedHunt = applyV2DotsToTarget(
    applyV2DotsToTarget(state.enemyV2Dots, dotsToApplyToTarget),
    sigSkillTargetDots,
  );
  const nextEnemyDots = applyBleedChangeToDots(
    dotsBeforeBleedHunt,
    result.bleedChangeToApply,
  );
  const bleedBeforeChange = dotsBeforeBleedHunt.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const bleedAfterChange = nextEnemyDots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  if (
    result.bleedChangeToApply &&
    bleedBeforeChange &&
    bleedAfterChange &&
    (bleedBeforeChange.stacks !== bleedAfterChange.stacks ||
      bleedBeforeChange.turns !== bleedAfterChange.turns)
  ) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: bleedChangeLogText(
        result.bleedChangeToApply,
        bleedAfterChange.turns,
      ),
      turn: "player",
    });
  }
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      turn: "player",
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (대상 행동 ${d.turns}회)`,
      turn: "player",
    });
  }
  for (const dot of dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
      turn: "player",
    });
  }
  // PR2-B temp 버프 적용 로그 — PvP(engine-pvp) 와 동일하게 시전 시점에 표기(보호막·운기·
  //   연환집중·선풍각·속박). 미보유 스킬은 전부 undefined/빈 배열 → 무로그(골든 불변).
  const shieldGainForLog = result.shieldToApply
    ? result.shieldToApply.hp + result.shieldToApply.mp
    : 0;
  if (shieldGainForLog > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "보호막"}] 보호막 +${shieldGainForLog}`,
      turn: "player",
    });
  }
  if (result.selfRegenToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "운기"}] 행동마다 HP +${result.selfRegenToApply.pctMaxHpPerTurn}% (${result.selfRegenToApply.turns}행동)`,
      turn: "player",
    });
  }
  const critBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "crit");
  if (critBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "집중"}] 치명타 확률 +${critBuffForLog.pct}%p (${critBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  const evaBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  if (evaBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피도 +${evaBuffForLog.pct}% (${evaBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  const dmgReduceBuffForLog = result.selfBuffPctToApply.find(
    (b) => b.target === "damageReduction",
  );
  if (dmgReduceBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "방어"}] 받는 피해 -${dmgReduceBuffForLog.pct}% (${dmgReduceBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  if (result.enemyVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 적 받는 피해 +${result.enemyVulnToApply.pct}% (적 행동 ${result.enemyVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyMagicVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] 적이 받는 마법 피해 +${result.enemyMagicVulnToApply.pct}% (적 행동 ${result.enemyMagicVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyEvasionDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "실명"}] 적 회피도 −${result.enemyEvasionDownToApply.pct}% (적 행동 ${result.enemyEvasionDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyAccuracyDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] 적 적중도 −${result.enemyAccuracyDownToApply.pct}% (적 행동 ${result.enemyAccuracyDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyHealReduceToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "화상"}] 적 회복 −${result.enemyHealReduceToApply.pct}% (적 행동 ${result.enemyHealReduceToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyDamageDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "쇠약"}] 적 주는 피해 −${result.enemyDamageDownToApply.pct}% (적 행동 ${result.enemyDamageDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemySkillProcDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "금제"}] 적 스킬 발동률 −${result.enemySkillProcDownToApply.pct}%p (적 행동 ${result.enemySkillProcDownToApply.turns}회)`,
      turn: "player",
    });
  }
  const provokeImmediateBasicAttacks =
    result.castSkillId
      ? Math.max(
          0,
          Math.floor(
            V2_SKILLS[result.castSkillId]?.provokeImmediateBasicAttacks ?? 0,
          ),
        )
      : 0;
  if (result.enemyDotVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] 적 지속/저주 피해 +${result.enemyDotVulnToApply.pct}% (적 행동 ${result.enemyDotVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  // 평타 전용이던 every-N 시그니처를 직접 피해 스킬의 실제 적중에도 연결한다.
  // 다단 스킬은 양수 피해가 표시된 각 타격을 모두 세며, 한 시전에서 주기를 여러 번
  // 넘으면 그 횟수만큼 추가 기본 공격을 지급한다. 버프·회복 스킬과 완전 회피된 공격은 0회다.
  const sigEvery = everyNHitsEffect(player.equipSignatures);
  const sigEveryN = sigEvery?.hits ?? 0;
  const nextSigHitCount =
    sigEveryN > 0
      ? state.stacks.signatureHitCount + landedSkillHits
      : state.stacks.signatureHitCount;
  const signatureExtraActions =
    sigEveryN > 0
      ? Math.floor(nextSigHitCount / sigEveryN) -
        Math.floor(state.stacks.signatureHitCount / sigEveryN)
      : 0;
  if (signatureExtraActions > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigEvery?.label ?? "연격"}] ${landedSkillHits}회 적중 — 추가 기본 공격 ${signatureExtraActions}회!`,
      turn: "player",
    });
  }
  const transitionedBerserker = state.berserker
    ? applyBerserkerCastTransition(
        state.berserker,
        result.berserkerTransition,
      )
    : undefined;
  const nextBerserker =
    transitionedBerserker &&
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
      ? finishBerserkerPlayerAttack(transitionedBerserker)
      : transitionedBerserker;
  const tier6DotsBefore = tier6DotContext(state);
  const tier6StatusKindsBefore = tier6StatusKindCount(state);
  const tier6ShieldGain =
    healShieldAmount +
    (result.shieldToApply
      ? result.shieldToApply.hp + result.shieldToApply.mp
      : 0);
  const castDeclaration = result.castSkillId
    ? composeDuelistDeclaration(state.v2Skills.equipped, result.castSkillId)
    : null;
  const nextDuelistBuff = castDeclaration
    ? castDeclaration
    : result.castSkillId
      ? interruptDuelistRamp(state.duelistBuff)
      : state.duelistBuff;
  if (castDeclaration) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: duelistDeclarationSummary(castDeclaration),
      turn: "player",
    });
  }
  let nextTier7 = state.stacks.tier7;
  if (shadowCoreEquipped || nextTier7?.swordShadow) {
    nextTier7 = {
      ...nextTier7,
      shadowFollowUpPct: shadowFollowUp.pendingPct,
    };
    if (
      shadowCoreEquipped &&
      result.castSkillId &&
      isSinglePhysicalSkill &&
      dealtDirectSkillDamage > 0
    ) {
      const mechanic = V2_SKILLS[result.castSkillId]?.tier7Mechanic;
      const recordPct =
        mechanic?.kind === "shadowStrike"
          ? mechanic.recordPct
          : tier7CombatJobIdForSkillId(result.castSkillId) === "shadowblade"
            ? shadowCoreMechanic?.kind === "shadowCore"
              ? shadowCoreMechanic.recordPct
              : 50
            : shadowCoreMechanic?.kind === "shadowCore"
              ? shadowCoreMechanic.inheritedRecordPct
              : 25;
      nextTier7.swordShadow = recordSwordShadow({
        existing: nextTier7.swordShadow,
        sourceSkillId: result.castSkillId,
        dealtDamage: dealtDirectSkillDamage,
        recordPct,
      });
    }
    if (
      result.castSkillId === "v2c_shadowblade_traceless" ||
      result.castSkillId === "v2c_blackmoon_flurry"
    ) {
      nextTier7.swordShadow = refineSwordShadow(
        nextTier7.swordShadow,
        15,
      );
    }
  }
  if (
    intentCoreEquipped ||
    startingRuinCharge ||
    ruinChargeAtActionStart ||
    crossCoreEquipped ||
    formulaCoreEquipped
  ) {
    nextTier7 = { ...nextTier7 };
  }
  if (
    nextTier7 &&
    intentCoreEquipped &&
    result.castSkillId &&
    isSinglePhysicalSkill &&
    result.castSkillId !== "v2c_ruinblade_ruinsword" &&
    dealtDirectSkillDamage > 0
  ) {
    const gain =
      result.castSkillId === "v2c_ruinblade_limitstrike" &&
      state.playerHp / Math.max(1, state.playerMaxHp) <= 0.4
        ? 2
        : 1;
    nextTier7.swordIntent = gainSwordIntent(
      nextTier7.swordIntent ?? 0,
      gain,
    );
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[검의] ${nextTier7.swordIntent}/3`,
      turn: "player",
    });
  }
  if (nextTier7 && startingRuinCharge) {
    nextTier7.ruinCharge = startRuinCharge({
      hp: state.playerHp,
      intent: nextTier7.swordIntent ?? 0,
    });
    nextTier7.swordIntent = 0;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 검의 3개를 소모해 충전을 시작했다. 다음 행동 기회에 자동 해방한다.`,
      turn: "player",
    });
  } else if (nextTier7 && ruinChargeAtActionStart) {
    nextTier7.ruinCharge = undefined;
    nextTier7.swordIntent = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 충전을 해방하고 검의 1개를 되찾았다.`,
      turn: "player",
    });
  }
  if (nextTier7 && crossover) {
    nextTier7.lastCrossFamily = crossover.state.lastFamily;
    if (crossover.bonus !== "none") {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[교차·${crossover.bonus === "capture" ? "포획" : "추격"}] 행동 가속 ${crossover.hastePct}%`,
        turn: "player",
      });
    }
  }
  const formulaManaSettlement = formulaPreview ? settleFormulaManaRecovery({
        state: formulaState, next: formulaPreview.next,
        completes: formulaPreview.completes, castMpSpent: result.mpSpent,
        castMpRestored: result.manaRestored + mpRefund + sigMpRefundAmount,
        requestedCompletionRestore: formulaOptimizationEquipped ? Math.floor(state.playerMaxMp * 0.1) : 0,
        advancesFormula: formulaPreview.next !== formulaState,
      }) : null;
  const formulaRestore = formulaManaSettlement?.completionRestore ?? 0;
  if (nextTier7 && formulaPreview) {
    nextTier7.formula = formulaManaSettlement?.next ?? formulaPreview.next;
    if (formulaPreview.completes) {
      nextLog = appendLog(nextLog, { kind: "info", text: `[완전식] ${result.castSkillName ?? "주문"} 강화 발동.`, turn: "player" });
      if (formulaRestore > 0) {
        nextLog = appendLog(nextLog, { kind: "info", text: `[마력 최적화] 마나 ${formulaRestore} 회복`, turn: "player" });
      }
    }
  }
  state = {
    ...recordEnemyDamage(state, damageMeterSkillTotal),
    playerHp: nextPlayerHp,
    ...(nextBerserker ? { berserker: nextBerserker } : {}),
    enemyHp: nextEnemyHp,
    playerMp: Math.min(state.playerMaxMp, adjustedNextMp + formulaRestore),
    duelistBuff: nextDuelistBuff,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs, // (PvE 는 적이 enemyDebuff 안 박아서 갱신 X — tick 만 반영)
    enemyV2Debuffs: nextEnemyDebuffs,
    enemyV2Dots: nextEnemyDots,
    buffs: hasSigSkillBuffs
      ? { ...state.buffs, ...sigSkillBuffs }
      : state.buffs,
    flags: skillCritAfterEvadeFired
      ? { ...state.flags, skillCritAfterEvadePending: false }
      : state.flags,
    stacks: {
      // PR2-B-2c — 운기/연환집중/선풍각/속박 temp 버프 갱신.
      ...applySkillTempBuffs(state.stacks, result),
      patternAlternateLastSkillByPair: advancePatternAlternateState(state.stacks.patternAlternateLastSkillByPair, result.patternAlternateTransition),
      tripleWard: refreshedTripleWard,
      evadesRemaining:
        state.stacks.evadesRemaining + result.guaranteedEvadesToAdd,
      comboHitCount: nextComboHitCount,
      signatureHitCount: nextSigHitCount,
      signatureBonusAttacksLeft:
        state.stacks.signatureBonusAttacksLeft + signatureExtraActions,
      ...(sigSkill.hitShock ? { enemyShockAction: "pending" as const } : {}),
      spellCastCount: nextSpellCastCount,
      enemyMagicVulnStacks: nextMagicVulnStacks,
      fortressImpact: Math.max(
        0,
        state.stacks.fortressImpact - result.fortressImpactToConsume,
      ),
      mutationWeight: result.mutationTransition.weightAfter,
      ...(landedSkillHits > 0 && frostChill.requestedGain > 0
        ? { enemyFrostChillStacks: frostChill.next }
        : {}),
      ironWallReflectCharges:
        result.ironWallReflectToApply?.charges ??
        state.stacks.ironWallReflectCharges,
      ...((state.stacks.lawInscriptions != null ||
        player.lawInscription ||
        result.lawInscriptionsToConsume != null)
        ? { lawInscriptions: nextLawInscriptions }
        : {}),
      // PR2-B 마나 보호막 — 흡수량(maxHP%+maxMP%)을 playerShield 풀에 누적.
      playerShield:
        state.stacks.playerShield +
        healShieldAmount +
        (result.shieldToApply
          ? result.shieldToApply.hp + result.shieldToApply.mp
          : 0),
      ...(nextTier7 ? { tier7: nextTier7 } : {}),
    },
    log: nextLog,
  };
  let tier6ExtraActions = 0;
  if (result.castSkillId && state.stacks.tier6Uniques) {
    const actionId = state.turn.completedPlayerTurns + 1;
    state = applyTier6UniquePveEvent(state, player, {
      kind: "action_start",
      shield: state.stacks.playerShield,
      maxHp: state.playerMaxHp,
      origin: { actionId, eventId: state.log.length },
    });
    if (costPaid > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "mp_spent",
        amount: costPaid,
        magicAtk: tier6Cast.tier6UnityMagicAtk,
        targetHasStatus: tier6StatusKindsBefore > 0,
        origin: { actionId, eventId: state.log.length },
      });
    }
    for (let index = 0; index < tier6SkillHitDamages.length; index += 1) {
      const attacksBefore = state.playerAttacksLeft;
      state = applyTier6UniquePveEvent(state, player, {
        kind: "direct_hit",
        damage: tier6SkillHitDamages[index]!,
        crit: skillCritFired,
        attackKind: "skill",
        paidMp: index === 0 ? costPaid : 0,
        statusKinds: tier6StatusKindsBefore,
        bleedStacks: tier6DotsBefore.bleed.stacks,
        bleedRemainingDamage: tier6DotsBefore.bleed.remainingDamage,
        poisonStacks: tier6DotsBefore.poison.stacks,
        poisonRemainingDamage: tier6DotsBefore.poison.remainingDamage,
        magicAtk: tier6Cast.tier6UnityMagicAtk,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length + index + 1 },
      });
      tier6ExtraActions += Math.max(0, state.playerAttacksLeft - attacksBefore);
    }
    if (resolvedSelfHeal > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "heal_calculated",
        amount: resolvedSelfHeal,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length },
      });
    }
    if (tier6ShieldGain > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "shield_gained",
        amount: tier6ShieldGain,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length },
      });
    }
    state = applyTier6UniquePveEvent(state, player, {
      kind: "hp_threshold",
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      origin: { actionId, eventId: state.log.length },
    });
  }
  if (provokeImmediateBasicAttacks > 0 && result.castSkillName) {
    state = applyImmediateProvokedEnemyBasicAttacks(
      state,
      player,
      playerName,
      provokeImmediateBasicAttacks,
      result.castSkillName,
    );
  }
  return {
    state,
    castFired: result.castSkillId != null,
    signatureExtraActions: signatureExtraActions + tier6ExtraActions,
    selfHastePct: Math.max(
      result.selfHasteToApply?.pct ?? 0,
      crossover?.hastePct ?? 0,
      formulaPreview?.completes ? 20 : 0,
    ),
    enemyDelayPct: Math.max(
      result.enemyDelayToApply?.pct ?? 0,
      crossover?.enemyDelayPct ?? 0,
      frostChill.triggered ? frostChill.delayPct : 0,
    ),
  };
}
