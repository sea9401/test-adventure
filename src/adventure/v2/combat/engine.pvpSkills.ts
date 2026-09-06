import { applySkillHealing, skillSelfHealingAmount } from "./engine.skillHealing";
import { combatRandom } from "./combatRandom";
import { recordCombatDamage, recordCombatMetric } from "./combatDiagnostics";
import { CRIT_PCT_CAP, STAT_LABELS } from "@/adventure/data/stats";
import { tier7CombatJobIdForSkillId, tier7PvpDirectDamagePct } from "@/adventure/data/v2/tier7SkillMechanics";
import {
  applyEvasionDamageReduction,
  EVASION_DAMAGE_REDUCTION_MAX_PCT,
  MAGIC_VULN_STACK_CAP,
  pvpEvasionDamageReductionPct,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  aggregateEquippedPassives,
  isLimitedRecoverySkillId,
  rebalanceDynamicV2SkillEffects,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import { applyBerserkerCastTransition, finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import { advancePatternAlternateState, preservePatternAlternateTransition } from "./combatPattern";
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
  removeMissedV2SkillTargetEffects,
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
import {
  computeCritOverflowBonus,
  computeDirectSkillDamage,
  resolveCriticalChanceAfterResistance,
} from "./engine.damageHelpers";
import {
  applyDodgeEffects,
  applyOnHitReflect,
  applyPoisonDamageToDots,
  applyTrackedSetShieldAbsorptionPvP,
  effectivePvPAccuracyRating,
  finishPvPBerserkerAttackAction,
  maybeApplyMartialCounter,
  releaseSwordShadowAfterPvPAction,
  setSide,
  skillTargetDef,
  skillTargetMagicDef,
} from "./engine.pvpOperations";
import { applyImmediateProvokedBasicAttacksPvP } from "./engine.pvpProvoke";
import { scalePvPDamage, scalePvPHealing, scalePvPShield } from "./engine.pvpScaling";
import { preparePvPSkillCast } from "./engine.pvpSkillInput";
import { type PvPBattleState, type PvPSide, type PvPSideStacks } from "./engine.pvpState";
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
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage } from "./magicBarrier";
import { mutationTransitionLogLines } from "./mutationCombat";
import {
  formulaStagesForCast,
  previewFormulaCast,
  settleFormulaManaRecovery,
} from "./primordialSageCombat";
import { pvpSideDamageTakenReductionPct } from "./pvpDamageReduction";
import { applyBerserkerHostileDamagePvP } from "./pvpHostileDamage";
import {
  canStartRuinCharge,
  gainSwordIntent,
  recordChargeHpLoss,
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
  onHitTakenDefGain,
  onSkillCastMpRefund,
  resolveDirectSkillHitSignatures,
  resolveOffensiveSignatureTriggers,
  SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
  SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
  statusBlockOnce,
} from "./signatureEffects";
import { resolveCrossover, type CrossFamily } from "./skyAscendantCombat";
import {
  applyTier6UniquePvpEvent,
  tier6PvpDotContext,
  tier6PvpStatusKindCount,
} from "./tier6UniquePvpAdapter";
import {
  consumePurificationWard,
  refreshTripleWardState,
  resolveTripleWardDamage,
  TRIPLE_WARD_LABELS,
  tripleWardStabilityReductionPct,
} from "./tripleWard";
export { applyImmediateProvokedBasicAttacksPvP } from "./engine.pvpProvoke";
export function castV2SkillOnAttackerTurnPvP(
  state: PvPBattleState,
  who: "p1" | "p2",
): {
  state: PvPBattleState;
  /** 실제 스킬이 발동했으면 true. 호출부는 해당 행동의 기본 공격을 생략한다. */
  castFired: boolean;
  /** 스킬 적중으로 얻어 같은 행동 묶음에서 실행할 추가 기본 공격 수. */
  signatureExtraActions: number;
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
  const {
    tier6UnityMult,
    tier6UnityMagicAtk,
    tickedSelfBuffs,
    tickedSelfDebuffs,
    shadowCoreEquipped,
    shadowCoreMechanic,
    formulaCoreEquipped,
    formulaOptimizationEquipped,
    formulaState,
    castInput,
  } = preparePvPSkillCast(side, opp, who);
  const ruinChargeAtActionStart = side.stacks.tier7?.ruinCharge;
  const ruinSwordMechanic = V2_SKILLS.v2c_ruinblade_ruinsword.tier7Mechanic;
  const ruinChargeReady =
    ruinSwordMechanic?.kind === "chargedFinisher" &&
    canStartRuinCharge(
      side.stacks.tier7?.swordIntent ?? 0,
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
          ...side.v2SkillCooldowns,
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
        ? {
            str: Math.max(
              side.player.strStat ?? 0,
              side.player.lukStat ?? 0,
            ),
          }
        : current.castSkillId === "v2c_celestialdragon_combo" &&
            side.v2Skills.equipped.includes("v2c_skyascendant_crossover")
          ? {
              str: Math.max(
                side.player.strStat ?? 0,
                side.player.dexStat ?? 0,
              ),
            }
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
  if (
    result.castSkillId === "v2c_swordsaint_flash" &&
    shadowCoreEquipped
  ) {
    result = rerunSelectedCast(result, {});
  } else if (
    result.castSkillId === "v2c_celestialdragon_combo" &&
    side.v2Skills.equipped.includes("v2c_skyascendant_crossover")
  ) {
    result = rerunSelectedCast(result, {});
  }
  if (ruinChargeAtActionStart) {
    result = {
      ...result,
      nextMp: side.mp,
      nextCooldowns: side.v2SkillCooldowns,
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
      hitManaShieldEligible: [],
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
  const crossCoreEquipped = side.v2Skills.equipped.includes(
    "v2c_skyascendant_crossover",
  );
  const crossFamily: CrossFamily | undefined = result.castSkillId
    ? ["v2c_skyascendant_fallingstar", "v2c_heavenlybow_orbit"].includes(
        result.castSkillId,
      )
      ? "ranged"
      : [
            "v2c_skyascendant_voidbreak",
            "v2c_celestialdragon_combo",
          ].includes(result.castSkillId)
        ? "martial"
        : undefined
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
  const potentialCrossover = crossCoreEquipped
    ? resolveCrossover({
        state: { lastFamily: side.stacks.tier7?.lastCrossFamily },
        currentFamily: crossFamily,
        hit: true,
        pvp: true,
      })
    : undefined;
  // 보장 회피는 스킬 전체를 무효화한다. 일반 회피도는 빗나감 대신 직접 피해만 줄이며,
  // DoT·디버프·제어 같은 적중 시 효과는 정상 적용한다.
  let skillGuaranteedEvaded = false;
  let skillEvasionReductionPct = 0;
  if (
    result.castSkillId &&
    result.enemyDamage > 0 &&
    opp.stacks.evadesRemaining > 0
  ) {
    // 그림자 도약 등 보장 회피는 평타뿐 아니라 다음 직접 피해 스킬에도 우선 적용한다.
    // 스킬 다단히트는 일반 명중 판정과 마찬가지로 한 번의 공격 행동으로 취급해 전체를 회피한다.
    skillGuaranteedEvaded = true;
    result = removeMissedV2SkillTargetEffects(result);
  } else if (result.castSkillId && result.enemyDamage > 0) {
    // 평타와 동일하게 기본 회피도에 전투 중 증가율을 곱하고 공격자의 적중도와 대결한다.
    const sPrecisionMult = side.player.precisionEvasionMult ?? 1;
    const sLuckEvadeBonus = opp.flags.luckyBuffActive
      ? opp.player.doubleLuck?.evade ?? 0
      : 0;
    const sSkillEvadeBonus =
      opp.stacks.skillEvasionTurns > 0 ? opp.stacks.skillEvasionPct : 0;
    const sTemporaryEvasionIncreasePct =
      sLuckEvadeBonus +
      (opp.player.universalLuckBonusPct ?? 0) +
      opp.buffs.cyclingChiBonus +
      sSkillEvadeBonus;
    const sDefenderEvaR = Math.max(
      0,
      (opp.player.evaRating ?? opp.player.evasionPct ?? 0) *
        sPrecisionMult *
        (1 + Math.max(0, sTemporaryEvasionIncreasePct) / 100),
    );
    skillEvasionReductionPct = Math.min(
      EVASION_DAMAGE_REDUCTION_MAX_PCT,
      pvpEvasionDamageReductionPct(
        sDefenderEvaR,
        effectivePvPAccuracyRating(side) +
          (castDefinition?.accuracyBonusPct ?? 0) +
          result.skillAccuracyBonusPct +
          (potentialCrossover?.accuracyBonusPct ?? 0),
      ) + Math.max(0, opp.player.finalEvasionReductionPctAdd ?? 0),
    );
  }
  const crossover = crossCoreEquipped
    ? resolveCrossover({
        state: { lastFamily: side.stacks.tier7?.lastCrossFamily },
        currentFamily: crossFamily,
        hit: result.enemyDamage > 0 && !skillGuaranteedEvaded,
        pvp: true,
      })
    : undefined;
  const formulaPierceAdd = formulaPreview?.completes ? 20 : 0;
  const crossoverPierceAdd =
    crossover?.bonus === "capture" ? crossover.penetrationPct : 0;
  if (
    !skillGuaranteedEvaded &&
    (formulaPierceAdd > 0 ||
      crossoverPierceAdd > 0 ||
      ruinChargeAtActionStart)
  ) {
    result = rerunSelectedCast(result, {
      directDamagePiercePctAdd: formulaPierceAdd + crossoverPierceAdd,
      ...(ruinChargeAtActionStart
        ? { directDamagePiercePctOverride: 30 }
        : {}),
    });
    if (ruinChargeAtActionStart) {
      result = {
        ...result,
        nextMp: side.mp,
        nextCooldowns: side.v2SkillCooldowns,
      };
    }
  }
  // 3) state 업데이트. 앞 단계에서 만든 st 의 로그를 이어서 누적한다.
  // 구조화된 시전 경계와 별개로 damage/heal 로그에도 스킬명을 포함한다.
  let nextLog =
    result.castSkillId && result.castSkillName
      ? appendSkillCastLog(
          st.log,
          result.castSkillId,
          result.castSkillName,
          { side: who },
        )
      : st.log;
  let nextSideHp = side.hp;
  let nextOppHp = opp.hp;
  let tier6SkillHitDamages: number[] = [];
  let nextOppShield = opp.stacks.playerShield;
  let nextOppMagicBarrier = opp.magicBarrier ?? 0;
  let nextOppTripleWard = opp.stacks.tripleWard;
  let skillStabilityReducedBy = 0;
  const skillWardReductions: Array<{
    kind: "physical" | "magic";
    reductionPct: number;
    remaining: number;
  }> = [];
  const skillWardConsumedKinds = new Set<"physical" | "magic">();
  let skillShieldAbsorbed = 0;
  let skillMagicBarrierAbsorbed = 0;
  let skillMagicBarrierDurabilitySpent = 0;
  let skillMagicBarrierDestroyed = false;
  let skillDamageToHp = 0;
  let healShieldAmount = 0;
  let actualSkillDamage = 0;
  // hpCostDamage는 명중한 공격에 HP를 피해로 교환한다. 확정 회피에서는
  // removeMissedV2SkillTargetEffects가 selfHpCost를 0으로 만들며, 일반 회피 경감에서는
  // 흡혈보다 먼저 비용을 내 최대 HP에서도 회복할 공간이 생기게 한다.
  if (result.selfHpCost > 0) {
    const cost = Math.min(Math.max(0, nextSideHp - 1), result.selfHpCost);
    if (cost > 0) {
      nextSideHp -= cost;
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `${result.castSkillName ?? "사혈"}! ${side.name} 생명력 ${cost} 소모`,
        side: who,
      });
    }
  }
  // 스킬 데미지 배수 — 주문중첩(워메이지)·약점노출(마도사 magicVuln)·속박(enemyVuln). 현재 누적
  //   기준, 적용은 이번 시전부터(적중 후 아래에서 스택 증가). 전부 미보유면 배수 1 → 무변(PvE 미러).
  const spellStackMult =
    1 + (side.stacks.spellCastCount * (side.player.skillDmgPctPerCast ?? 0)) / 100;
  const magicVulnMult =
    1 +
    (opp.stacks.magicVulnStacks * (side.player.enemyMagicVulnPctPerStack ?? 0)) /
      100;
  const erosionMult =
    opp.stacks.dotVulnTurns > 0 && opp.stacks.magicVulnStacks > 0
      ? 1 + opp.stacks.dotVulnPct / 100
      : 1;
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
  const magicSkillDamageBonus =
    result.magicEnemyDamage > 0 && (side.player.magicSkillDamagePct ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage * (side.player.magicSkillDamagePct ?? 0)) /
            100,
        )
      : 0;
  const lawMagicVulnBonus =
    result.magicEnemyDamage > 0 &&
    (side.stacks.enemyMagicVulnTurns ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage *
            (side.stacks.enemyMagicVulnPct ?? 0)) /
            100,
        )
      : 0;
  const skillDamageBase =
    result.enemyDamage + magicSkillDamageBonus + lawMagicVulnBonus;
  // 스킬 치명타 — PvE 미러. 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT
  //   로 분리. PvP 확률 판정은 대상의 치명타 저항을 차감하며, 강제 치명타는 저항을 무시한다.
  //   데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → RNG 스트림 보존).
  const rawSkillCritPct =
    (side.player.critChancePct ?? 0) +
    (castDefinition?.skillCritChancePct ?? 0);
  const skillCritResolution = resolveCriticalChanceAfterResistance(
    rawSkillCritPct,
    opp.player.critResistPct ?? 0,
    CRIT_PCT_CAP,
  );
  const effectiveSkillCritPct = skillCritResolution.effectiveCritPct;
  const skillCritAfterEvadeFired =
    result.enemyDamage > 0 && side.flags.skillCritAfterEvadePending;
  const guaranteedSkillCrit =
    result.berserkerTransition.forceSkillCrit || skillCritAfterEvadeFired;
  const skillCritFired =
    result.enemyDamage > 0 &&
    (guaranteedSkillCrit ||
      (effectiveSkillCritPct > 0 &&
        combatRandom() * 100 < effectiveSkillCritPct));
  const directSkillSignature = resolveDirectSkillHitSignatures(
    side.player.equipSignatures,
    {
      dealtDamage:
        Boolean(result.castSkillId) &&
        result.enemyDamage > 0 &&
        !skillGuaranteedEvaded,
      targetPoisoned: opp.v2Dots.some(
        (dot) => dot.tag === "poison" && dot.stacks > 0 && dot.turns > 0,
      ),
    },
  );
  // 스킬 다단히트(PvE 미러) — 시전자가 이 턴 굴려둔 공격 횟수(attacksLeft)만큼 데미지 스킬 반복 타격.
  //   데미지 스킬에만(버프/힐/마나/DoT 부여는 1회). 추가 공격 0 빌드는 skillHitCount=1 → 기존 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, side.attacksLeft)
      : 1;
  const skillPreCriticalMultiplier =
    spellStackMult *
    magicVulnMult *
    erosionMult *
    vulnMult *
    directSkillSignature.damageMult *
    (side.stacks.damageDownTurns > 0
      ? 1 - side.stacks.damageDownPct / 100
      : 1);
  const skillCriticalMultiplier = skillCritFired
    ? SKILL_CRIT_MULT +
      Math.max(0, side.player.skillCritDmgPct ?? 0) / 100 +
      result.berserkerTransition.bonusSkillCritDamagePct / 100 +
      (side.player.skillCritOverflow
        ? guaranteedSkillCrit
          ? computeCritOverflowBonus(rawSkillCritPct)
          : skillCritResolution.overflowDamageBonus
        : 0)
    : 1;
  const baseSingleSkillDamage = computeDirectSkillDamage({
    totalDamage: skillDamageBase,
    magicDamage:
      result.magicEnemyDamage + magicSkillDamageBonus + lawMagicVulnBonus,
    preCriticalMultiplier: skillPreCriticalMultiplier,
    criticalMultiplier: skillCriticalMultiplier,
    equipmentMagicCritBonus:
      Math.max(0, side.player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
    critical: skillCritFired,
  });
  const intentCoreEquipped = side.v2Skills.equipped.includes(
    "v2c_ruinblade_oneintent",
  );
  let tier7FinalDamagePct = 0;
  if (
    intentCoreEquipped &&
    isSinglePhysicalSkill &&
    result.castSkillId !== "v2c_ruinblade_ruinsword"
  ) {
    tier7FinalDamagePct += (side.stacks.tier7?.swordIntent ?? 0) * 8;
  }
  if (result.castSkillId === "v2c_ruinblade_limitstrike") {
    tier7FinalDamagePct += ruinIntentStrikeBonus({
      hp: side.hp,
      maxHp: side.maxHp,
      mechanic: V2_SKILLS.v2c_ruinblade_limitstrike.tier7Mechanic,
    });
  }
  if (ruinChargeAtActionStart) {
    tier7FinalDamagePct += ruinSwordBonusesForMechanic({
      state: ruinChargeAtActionStart,
      hp: side.hp,
      maxHp: side.maxHp,
      pvp: true, mechanic: ruinSwordMechanic,
    }).damagePct;
  }
  if (crossover?.bonus === "capture") {
    tier7FinalDamagePct += crossover.damagePct;
  }
  if (formulaPreview?.completes) tier7FinalDamagePct += 30;
  const shadowFollowUp = consumeShadowFollowUp({
    pendingPct: side.stacks.tier7?.shadowFollowUpPct ?? 0,
    isSinglePhysical: Boolean(isSinglePhysicalSkill),
    hit: result.enemyDamage > 0 && !skillGuaranteedEvaded,
    damage: Math.round(
      baseSingleSkillDamage * (1 + tier7FinalDamagePct / 100),
    ),
  });
  const castTier7Mechanic = result.castSkillId
    ? V2_SKILLS[result.castSkillId]?.tier7Mechanic
    : undefined;
  const singleSkillDamage = Math.round(
    shadowFollowUp.damage *
      (tier7PvpDirectDamagePct(castTier7Mechanic) / 100),
  );
  let nextComboHitCount = side.stacks.comboHitCount;
  let landedSkillHits = 0;
  let skillReflectBase = 0;
  let dealtDirectSkillDamage = 0;
  let pursuitDamageAfterReduction = 0;
  if (skillCritAfterEvadeFired && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] ${side.name}의 ${result.castSkillName}이(가) 치명타가 된다.`,
      side: who,
    });
  }
  // damage: 일반 공격 player_attack kind 미러.
  if (result.enemyDamage > 0 && result.castSkillName) {
    // 다단 스킬은 타마다 한 줄(PvE 미러). 부스트는 타당 raw 비율 분배(합 = 1회분 singleSkillDamage).
    // 다단히트(추가 공격)면 1회분 타격 묶음을 skillHitCount 번 반복.
    const singleHits =
      result.hitDamages.length > 1
        ? distributeBoostedHits(result.hitDamages, singleSkillDamage)
        : [singleSkillDamage];
    const singleHitManaShieldEligible = singleHits.map((_, index) => result.hitManaShieldEligible[index] ?? true);
    const repeatedHits: number[] = [];
    const repeatedHitManaShieldEligible: boolean[] = [];
    for (let h = 0; h < skillHitCount; h++) {
      repeatedHits.push(...singleHits);
      repeatedHitManaShieldEligible.push(...singleHitManaShieldEligible);
    }
    const comboResult = applyComboFinisherToHits(
      repeatedHits,
      side.stacks.comboHitCount,
      side.player.comboFinisherBonusPct,
    );
    const pursuitRawDamage =
      crossover?.bonus === "pursuit"
        ? Math.round(
            comboResult.hitDamages.reduce((sum, hit) => sum + hit, 0) *
              (crossover.damagePct / 100),
          )
        : 0;
    const directHits = pursuitRawDamage > 0 ? [...comboResult.hitDamages, pursuitRawDamage] : comboResult.hitDamages;
    const directHitManaShieldEligible = pursuitRawDamage > 0 ? [...repeatedHitManaShieldEligible, true] : repeatedHitManaShieldEligible;
    const perHitAfterEvasion = directHits.map((hit) =>
      applyEvasionDamageReduction(hit, skillEvasionReductionPct),
    );
    const rawDamageBeforeEvasion = directHits.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    const rawDamageAfterEvasion = perHitAfterEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (rawDamageAfterEvasion < rawDamageBeforeEvasion) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[회피 경감 ${skillEvasionReductionPct.toFixed(1)}%] ${opp.name} 피해 -${rawDamageBeforeEvasion - rawDamageAfterEvasion}`,
        side: otherKey,
      });
    }
    const damageReductionPct = pvpSideDamageTakenReductionPct(opp);
    const perHitBeforeReduction = perHitAfterEvasion.map((hit) =>
      scalePvPDamage(st, hit),
    );
    const perHit = perHitAfterEvasion.map((hit) => {
      const reduced =
        damageReductionPct > 0
          ? Math.max(
              1,
              Math.floor(hit * (1 - damageReductionPct / 100)),
            )
          : hit;
      return scalePvPDamage(st, reduced);
    });
    tier6SkillHitDamages = perHit.filter((hit) => hit > 0);
    landedSkillHits = perHit.filter((hit) => hit > 0).length;
    nextComboHitCount = comboResult.nextComboHitCount;
    const skillDamage = perHit.reduce((sum, hit) => sum + hit, 0);
    dealtDirectSkillDamage = perHit
      .slice(0, comboResult.hitDamages.length)
      .reduce((sum, hit) => sum + hit, 0);
    pursuitDamageAfterReduction =
      pursuitRawDamage > 0 ? perHit.at(-1) ?? 0 : 0;
    const skillDamageBeforeReduction = perHitBeforeReduction.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    // 평타 반사와 같은 기준: 회피 경감 후, 그 밖의 받피감·아레나 배율 적용 전 스킬 피해.
    skillReflectBase = perHitAfterEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (skillDamage < skillDamageBeforeReduction) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[받피감] ${opp.name} 피해 -${skillDamageBeforeReduction - skillDamage}`,
        side: otherKey,
      });
    }
    // 모든 직접 피해 스킬은 보호막을 먼저 소모한다. 보호막을 뚫고 실제 HP 피해가
    // 남은 경우에만 아래 반사 판정이 활성화된다.
    const hpHits = directHits.map((rawHit, hitIndex) => {
      const barrier = resolveMagicBarrierDamage({
        rawDamage: rawHit,
        durability: nextOppMagicBarrier,
        absorbPct: opp.player.magicBarrierPvpAbsorbPct,
        efficiencyPct: opp.player.magicBarrierPvpEfficiencyPct,
        eligible: result.selfHpCost <= 0 && (directHitManaShieldEligible[hitIndex] ?? true),
        mitigateBody: (bodyRawDamage) => {
          if (bodyRawDamage <= 0) return 0;
          const afterEvasion = applyEvasionDamageReduction(
            bodyRawDamage,
            skillEvasionReductionPct,
          );
          const reduced =
            damageReductionPct > 0
              ? Math.max(
                  1,
                  Math.floor(
                    afterEvasion * (1 - damageReductionPct / 100),
                  ),
                )
              : afterEvasion;
          const stabilityPct = tripleWardStabilityReductionPct(
            nextOppTripleWard,
          );
          const afterStability = stabilityPct > 0
            ? Math.max(1, Math.floor(reduced * (1 - stabilityPct / 100)))
            : reduced;
          skillStabilityReducedBy += reduced - afterStability;
          const magicShare = Math.min(
            1,
            Math.max(
              0,
              result.magicEnemyDamage / Math.max(1, result.enemyDamage),
            ),
          );
          const physicalDamage = Math.floor(
            afterStability * (1 - magicShare),
          );
          const magicDamage = afterStability - physicalDamage;
          let wardedDamage = 0;
          for (const [kind, part] of [
            ["physical", physicalDamage],
            ["magic", magicDamage],
          ] as const) {
            if (part <= 0) continue;
            if (skillWardConsumedKinds.has(kind)) {
              wardedDamage += part;
              continue;
            }
            const ward = resolveTripleWardDamage(
              nextOppTripleWard,
              kind,
              "pvp",
              [part],
            );
            nextOppTripleWard = ward.state;
            wardedDamage += ward.totalDamage;
            if (ward.consumed) {
              skillWardConsumedKinds.add(kind);
              skillWardReductions.push({
                kind,
                reductionPct: ward.reductionPct,
                remaining: ward.remaining,
              });
            }
          }
          return scalePvPDamage(st, wardedDamage);
        },
      });
      nextOppMagicBarrier = barrier.durabilityLeft;
      skillMagicBarrierAbsorbed += barrier.absorbedDamage;
      skillMagicBarrierDurabilitySpent += barrier.durabilitySpent;
      skillMagicBarrierDestroyed ||= barrier.destroyed;
      const absorbed = Math.min(nextOppShield, barrier.hpBoundDamage);
      nextOppShield -= absorbed;
      skillShieldAbsorbed += absorbed;
      recordCombatDamage(hitIndex >= comboResult.hitDamages.length ? "crossover:pursuit" : result.castSkillId ?? "skill", otherKey, nextOppHp, barrier.hpBoundDamage - absorbed, barrier.absorbedDamage + absorbed);
      const actualHpDamage = Math.min(
        nextOppHp,
        barrier.hpBoundDamage - absorbed,
      );
      nextOppHp -= actualHpDamage;
      skillDamageToHp += actualHpDamage;
      return actualHpDamage;
    });
    if (skillStabilityReducedBy > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[영역 안정] ${opp.name} 피해 -${skillStabilityReducedBy}`,
        side: otherKey,
      });
    }
    for (const ward of skillWardReductions) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[${TRIPLE_WARD_LABELS[ward.kind]}] ${opp.name} 직접 ${ward.kind === "magic" ? "마법" : "물리"} 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
        side: otherKey,
      });
    }
    if (skillShieldAbsorbed > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[철벽] ${opp.name} 보호막이 ${skillShieldAbsorbed} 흡수 (남은 ${nextOppShield})`,
        side: otherKey,
      });
    }
    if (skillMagicBarrierAbsorbed > 0) {
      for (const entry of magicBarrierCombatLogEntries({
        bodyRawDamage: 0,
        mitigatedBodyDamage: 0,
        absorbedDamage: skillMagicBarrierAbsorbed,
        spillDamage: 0,
        hpBoundDamage: 0,
        durabilitySpent: skillMagicBarrierDurabilitySpent,
        durabilityLeft: nextOppMagicBarrier,
        destroyed: skillMagicBarrierDestroyed,
      })) {
        nextLog = appendLog(nextLog, { ...entry, side: otherKey });
      }
    }
    actualSkillDamage =
      skillShieldAbsorbed + skillMagicBarrierAbsorbed + skillDamageToHp;
    if (pursuitDamageAfterReduction > 0) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        effect: "extra_damage",
        additionalHpDamage: hpHits.at(-1) ?? 0,
        text: `[교차·추격] ${pursuitDamageAfterReduction} 추가 피해.`,
        side: who,
      });
    }
    for (const hit of hpHits.slice(0, comboResult.hitDamages.length)) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [치명타]" : ""} ${hit} 피해를 입혔다.`,
        side: who,
      });
    }
  }
  // on_hit_taken 방어 누적은 기본 공격뿐 아니라 직접 피해 스킬에도 동일하게 발동한다.
  // 보호막·마법 장벽을 통과해 실제 HP에 들어간 피해만 사용하고, 지속 피해는 이 경로를 타지 않는다.
  const sigSkillDefGain = onHitTakenDefGain(opp.player.equipSignatures);
  const prevOppBraceDefBonus = opp.stacks.braceDefBonus ?? 0;
  const nextOppBraceDefBonus =
    sigSkillDefGain && skillDamageToHp > 0
      ? Math.min(
          opp.player.def,
          prevOppBraceDefBonus +
            Math.floor((skillDamageToHp * sigSkillDefGain.pct) / 100),
        )
      : prevOppBraceDefBonus;
  const skillBraceDefDelta = nextOppBraceDefBonus - prevOppBraceDefBonus;
  if (sigSkillDefGain && skillBraceDefDelta > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkillDefGain.label}] ${opp.name} 방어 +${skillBraceDefDelta}`,
      side: otherKey,
    });
  }
  const sigSkill = resolveOffensiveSignatureTriggers(
    side.player.equipSignatures,
    {
      critical: skillCritFired,
      dealtDamage: landedSkillHits > 0,
      allowShock: canApplyShock(opp.stacks.shockAction),
    },
  );
  const sigSkillTargetDots = [
    ...(directSkillSignature.poison
      ? [
          makePoisonDot({
            stacks: directSkillSignature.poison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
    ...(sigSkill.critPoison
      ? [
          makePoisonDot({
            stacks: 1,
            pctMaxHpPerStack: SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitPoison
      ? [
          makePoisonDot({
            stacks: sigSkill.hitPoison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitBleed
      ? [
          makeBleedDot({
            stacks: sigSkill.hitBleed.stacks,
            flatPerStack: 0,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
  ];
  const sigSkillTargetStatusFired =
    !!directSkillSignature.poison ||
    sigSkill.critPoison ||
    !!sigSkill.hitPoison ||
    !!sigSkill.hitBleed ||
    !!sigSkill.critChill ||
    !!sigSkill.critDefDebuff ||
    !!sigSkill.hitShock;
  const sigStatusBlock = statusBlockOnce(opp.player.equipSignatures);
  const hasHostileStatus =
    (landedSkillHits > 0 && result.frostChillGain > 0) ||
    result.enemyDebuffsToApply.length > 0 ||
    result.dotsToApplyToTarget.length > 0 ||
    result.enemyVulnToApply != null ||
    result.enemyEvasionDownToApply != null ||
    result.enemyAccuracyDownToApply != null ||
    result.enemyDelayToApply != null ||
    result.enemyHealReduceToApply != null ||
    result.enemyDamageDownToApply != null ||
    result.enemySkillProcDownToApply != null ||
    result.enemyDotVulnToApply != null ||
    result.bleedChangeToApply != null ||
    ((side.player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
      result.enemyDamage > 0) ||
    sigSkillTargetStatusFired;
  const statusBlockTargetEffects =
    hasHostileStatus &&
    !!sigStatusBlock &&
    !opp.flags.statusBlockUsed;
  const purificationBlockTargetEffects =
    hasHostileStatus &&
    !statusBlockTargetEffects &&
    nextOppTripleWard.purification > 0;
  const blockHostileStatus =
    statusBlockTargetEffects || purificationBlockTargetEffects;
  if (purificationBlockTargetEffects) {
    nextOppTripleWard = consumePurificationWard(nextOppTripleWard).state;
  }
  const frostChill = resolveFrostChillGain(
    opp.stacks.frostChillStacks,
    !blockHostileStatus && landedSkillHits > 0 ? result.frostChillGain : 0,
    {
      damagePct: side.player.freezeDamagePct,
      delayPct: side.player.freezeDelayPct,
      retainStacks: side.player.freezeRetainStacks,
    },
  );
  if (frostChill.requestedGain > 0) {
    if (frostChill.triggered && result.castSkillId) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillTriggerLog(),
        side: who,
      });
      const effectiveInt = Math.floor(
        Math.max(0, side.player.intStat ?? 0) *
          v2MagicBuffMult(tickedSelfBuffs, tickedSelfDebuffs),
      );
      const rawFreezeDamage = freezeRawDamage({
        int: effectiveInt,
        maxMp: side.maxMp,
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
        attackerMagicMinDamage: side.player.magicMinDamage,
        scaling: "magic",
        targetDef: skillTargetDef(side, opp),
        targetMagicDef: skillTargetMagicDef(side, opp),
        statCoef: 0,
        baseFlat: tierScaledRaw,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: opp.v2SelfBuffs,
        targetSelfDebuffs: opp.v2SelfDebuffs,
      });
      const freezeMagicSkillBonus =
        (side.player.magicSkillDamagePct ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage *
                (side.player.magicSkillDamagePct ?? 0)) /
                100,
            )
          : 0;
      const freezeLawVulnBonus =
        (side.stacks.enemyMagicVulnTurns ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage *
                (side.stacks.enemyMagicVulnPct ?? 0)) /
                100,
            )
          : 0;
      const freezeMagicDamage =
        freezeBaseDamage + freezeMagicSkillBonus + freezeLawVulnBonus;
      const freezeBeforeMitigation = computeDirectSkillDamage({
        totalDamage: freezeMagicDamage,
        magicDamage: freezeMagicDamage,
        preCriticalMultiplier: skillPreCriticalMultiplier,
        criticalMultiplier: skillCriticalMultiplier,
        equipmentMagicCritBonus:
          Math.max(0, side.player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
        critical: skillCritFired,
      });
      const freezeAfterEvasion = applyEvasionDamageReduction(
        freezeBeforeMitigation,
        skillEvasionReductionPct,
      );
      skillReflectBase += freezeAfterEvasion;
      const freezeBarrier = resolveMagicBarrierDamage({
        rawDamage: freezeBeforeMitigation,
        durability: nextOppMagicBarrier,
        absorbPct: opp.player.magicBarrierPvpAbsorbPct,
        efficiencyPct: opp.player.magicBarrierPvpEfficiencyPct,
        eligible: true,
        mitigateBody: (bodyRawDamage) => {
          if (bodyRawDamage <= 0) return 0;
          const afterEvasion = applyEvasionDamageReduction(
            bodyRawDamage,
            skillEvasionReductionPct,
          );
          const damageReductionPct = pvpSideDamageTakenReductionPct(opp);
          const afterReduction =
            damageReductionPct > 0
              ? Math.max(
                  1,
                  Math.floor(
                    afterEvasion * (1 - damageReductionPct / 100),
                  ),
                )
              : afterEvasion;
          const stabilityPct = tripleWardStabilityReductionPct(
            nextOppTripleWard,
          );
          const afterStability =
            stabilityPct > 0
              ? Math.max(
                  1,
                  Math.floor(afterReduction * (1 - stabilityPct / 100)),
                )
              : afterReduction;
          const ward = resolveTripleWardDamage(
            nextOppTripleWard,
            "magic",
            "pvp",
            [afterStability],
          );
          nextOppTripleWard = ward.state;
          if (ward.consumed) {
            nextLog = appendLog(nextLog, {
              kind: "info",
              text: `[${TRIPLE_WARD_LABELS.magic}] ${opp.name} 직접 마법 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
              side: otherKey,
            });
          }
          return scalePvPDamage(st, ward.totalDamage);
        },
      });
      nextOppMagicBarrier = freezeBarrier.durabilityLeft;
      const freezeShieldAbsorbed = Math.min(
        nextOppShield,
        freezeBarrier.hpBoundDamage,
      );
      nextOppShield -= freezeShieldAbsorbed;
      const freezeHpDamage = Math.min(
        nextOppHp,
        freezeBarrier.hpBoundDamage - freezeShieldAbsorbed,
      );
      nextOppHp -= freezeHpDamage;
      skillDamageToHp += freezeHpDamage;
      tier6SkillHitDamages.push(freezeBarrier.hpBoundDamage);
      if (freezeBarrier.absorbedDamage > 0) {
        for (const entry of magicBarrierCombatLogEntries({
          bodyRawDamage: 0,
          mitigatedBodyDamage: 0,
          absorbedDamage: freezeBarrier.absorbedDamage,
          spillDamage: 0,
          hpBoundDamage: 0,
          durabilitySpent: freezeBarrier.durabilitySpent,
          durabilityLeft: freezeBarrier.durabilityLeft,
          destroyed: freezeBarrier.destroyed,
        })) {
          nextLog = appendLog(nextLog, { ...entry, side: otherKey });
        }
      }
      if (freezeShieldAbsorbed > 0) {
        nextLog = appendLog(nextLog, {
          kind: "info",
          text: `[철벽] ${opp.name} 보호막이 ${freezeShieldAbsorbed} 흡수 (남은 ${nextOppShield})`,
          side: otherKey,
        });
      }
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `빙결!${skillCritFired ? " [치명타]" : ""} ${freezeHpDamage} 피해를 입혔다.`,
        side: who,
      });
    } else {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillGainLog(
          frostChill.requestedGain,
          frostChill.next,
        ),
        side: who,
      });
    }
  }
  const activeSkillCritSpdMult =
    side.buffs.playerSpdTurnsLeft > 0 ? side.buffs.playerSpdMult : 1;
  const sigSkillCritSpdBuff = sigSkill.critSpeed
    ? {
        playerSpdMult: Math.max(
          activeSkillCritSpdMult,
          sigSkill.critSpeed.mult,
        ),
        playerSpdTurnsLeft: Math.max(
          side.buffs.playerSpdTurnsLeft,
          sigSkill.critSpeed.turns,
        ),
      }
    : null;
  const activeSkillEnemySpdMult =
    side.buffs.enemySpdTurnsLeft > 0 ? side.buffs.enemySpdMult : 1;
  const sigSkillEnemySlow =
    !blockHostileStatus && sigSkill.critChill
      ? {
          enemySpdMult: Math.min(
            activeSkillEnemySpdMult,
            sigSkill.critChill.mult,
          ),
          enemySpdTurnsLeft: Math.max(
            side.buffs.enemySpdTurnsLeft,
            sigSkill.critChill.turns,
          ),
        }
      : null;
  const activeSkillEnemyDefDebuffPct =
    side.buffs.enemyDefDebuffTurnsLeft > 0
      ? side.buffs.enemyDefDebuffPct
      : 0;
  const sigSkillEnemyDefDebuff =
    !blockHostileStatus && sigSkill.critDefDebuff
      ? {
          enemyDefDebuffPct: Math.max(
            activeSkillEnemyDefDebuffPct,
            sigSkill.critDefDebuff.pct,
          ),
          enemyDefDebuffTurnsLeft: Math.max(
            side.buffs.enemyDefDebuffTurnsLeft,
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
  if (sigSkillCritSpdBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.critSpeed?.label ?? "군림"}] ${side.name} 결정타 — 속도가 솟구친다!`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[독니] ${opp.name}을(를) 중독시켰다!`,
      side: who,
    });
  }
  if (!blockHostileStatus && directSkillSignature.poison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${directSkillSignature.poison.label}] ${opp.name}에게 중독 ${directSkillSignature.poison.stacks}스택을 남겼다.`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitPoison.label}] ${opp.name}에게 중독 ${sigSkill.hitPoison.stacks}스택을 남겼다.`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitBleed) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitBleed.label}] ${opp.name}에게 출혈 ${sigSkill.hitBleed.stacks}스택을 남겼다.`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critChill) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatChillSlowLog(opp.name, sigSkill.critChill),
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critDefDebuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatDefDebuffLog(opp.name, sigSkill.critDefDebuff),
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitShock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatShockAppliedLog(opp.name, sigSkill.hitShock),
      side: who,
    });
  }
  if (result.berserkerTransition.grantFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전] 다음 파멸일격 또는 멸왕일도를 준비한다.`,
      side: who,
    });
  }
  if (result.berserkerTransition.consumeFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전 해방] ${result.castSkillName ?? "필살기"}에 피의 기세를 터뜨린다.`,
      side: who,
    });
  }
  if (result.berserkerTransition.consumeDeathDamage) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[패황의 지배] ${result.castSkillName ?? "공격"}에 죽음 직전의 힘을 싣는다.`,
      side: who,
    });
  }
  let nextOppBerserker = opp.berserker;
  let berserkerSurvivalTriggered = false;
  if (skillDamageToHp > 0) {
    const survival = applyBerserkerHostileDamagePvP(
      { ...opp, hp: nextOppHp },
      nextOppHp,
      otherKey,
    );
    nextOppHp = survival.side.hp;
    nextOppBerserker = survival.side.berserker;
    berserkerSurvivalTriggered = survival.triggered;
  }
  if (berserkerSurvivalTriggered) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[사망 극복] ${opp.name}이(가) 쓰러지지 않고 HP ${nextOppHp}로 돌아왔다.`,
      side: otherKey,
    });
    if ((opp.player.berserkerMadnessRank ?? 0) >= 4) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
        side: otherKey,
      });
    }
  }
  const skillEnduranceFires =
    nextOppHp <= 0 &&
    !!opp.player.enduranceActive &&
    !opp.flags.enduranceTriggered;
  if (skillEnduranceFires) {
    recordCombatMetric("survival_restoration", "endurance", otherKey, 1);
    nextOppHp = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[불굴] ${opp.name} 마지막 한 숨 — HP 1 로 버텼다!`,
      side: otherKey,
    });
  }
  // 스킬 자체 회복에만 화상 회복 감소를 적용한다.
  const resolvedSelfHeal = skillSelfHealingAmount(result, actualSkillDamage, tier6UnityMult, side.player.receivedHealMult);
  const hr = side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0;
  const debuffAdjustedHeal =
    hr > 0 ? Math.floor(resolvedSelfHeal * (1 - hr / 100)) : resolvedSelfHeal;
  // 무자원 1회 회복기는 combatShared에서 PvP 제한을 이미 적용한다.
  const skillHeal = isLimitedRecoverySkillId(result.castSkillId)
    ? debuffAdjustedHeal
    : scalePvPHealing(st, debuffAdjustedHeal);
  const healed = applySkillHealing({
    hp: nextSideHp, maxHp: side.maxHp, player: side.player, playerName: side.name,
    skillName: result.castSkillName, skillId: result.castSkillId, skillHeal, log: nextLog, side: who,
    // 보호막을 제외한 HP 피해만 흡혈하며 일반 회복 스킬 증폭/감소는 중복 적용하지 않는다.
    passiveHeal: healingAfterReceivedMultiplier(
      scalePvPHealing(st, Math.floor(
        (skillDamageToHp * (side.player.passiveLifestealPct ?? 0)) / 100,
      )), side.player.receivedHealMult,
    ),
  });
  nextSideHp = healed.hp;
  nextLog = healed.log;
  healShieldAmount += healed.shield;
  // 마나 회복(명상 등) — 로그 한 줄(빈 턴 갭 방지). PvE 미러.
  if (result.manaRestored > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text:
        result.castSkillId === "v2c_primordialmage_return"
          ? `[근원공명] 태초회귀로 ${side.name} 마나 ${result.manaRestored} 회복했다.`
          : `${result.castSkillName}! ${side.name} 마나 ${result.manaRestored} 회복했다.`,
      side: who,
    });
  }
  if (result.guaranteedEvadesToAdd > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 확정 회피를 준비했다.`,
      side: who,
    });
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] ${side.name}이(가) 다음 공격 ${result.guaranteedEvadesToAdd}회를 반드시 회피한다.`,
      side: who,
    });
  }
  const sigMpRefund = onSkillCastMpRefund(side.player.equipSignatures);
  const costPaid = result.mpSpent;
  const sigMpRefundAmount =
    sigMpRefund && costPaid > 0
      ? Math.floor((costPaid * sigMpRefund.pct) / 100)
      : 0;
  if (sigMpRefund && sigMpRefundAmount > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigMpRefund.label}] ${side.name} 마나 ${sigMpRefundAmount} 환급`,
      side: who,
    });
  }
  // PR2-B — 보호막 + temp 버프(운기/연환집중/선풍각/속박) 적용(PvE applySkillTempBuffs/shield 미러).
  //   보호막 흡수는 기존 로직(stacks.playerShield)이 처리, 4 버프는 stacks 에 기록 후 전투에서 소비.
  //   (비전 작렬=마법취약 payoff 는 PvP magicVuln 트래커 없어 여전히 no-op — 별도 follow-up.)
  const rawShieldGain = result.shieldToApply
    ? result.shieldToApply.hp + result.shieldToApply.mp
    : 0;
  const shieldGain =
    result.castSkillId === "v2c_lawweaver_release" ||
    isLimitedRecoverySkillId(result.castSkillId)
    ? rawShieldGain
    : scalePvPShield(st, rawShieldGain);
  const critBuff = result.selfBuffPctToApply.find((b) => b.target === "crit");
  const evaBuff = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  const dmgReduceBuff = result.selfBuffPctToApply.find(
    (b) => b.target === "damageReduction",
  );
  const reflectBuff = result.selfBuffPctToApply.find((b) => b.target === "reflectDamage");
  const refreshedTripleWard = result.refreshTripleWards
    ? refreshTripleWardState(
        side.stacks.tripleWard,
        aggregateEquippedPassives(side.v2Skills.equipped).tripleWardRank,
      )
    : side.stacks.tripleWard;
  // PvE와 동일하게 직접 피해 스킬의 실제 타격 수를 every-N 카운터에 합산한다.
  // 다단 스킬이 한 번에 여러 주기를 넘기면 넘긴 횟수만큼 후속 행동을 추가한다.
  const sigEvery = everyNHitsEffect(side.player.equipSignatures);
  const sigEveryN = sigEvery?.hits ?? 0;
  const nextSigHitCount =
    sigEveryN > 0
      ? side.stacks.signatureHitCount + landedSkillHits
      : side.stacks.signatureHitCount;
  const signatureExtraActions =
    sigEveryN > 0
      ? Math.floor(nextSigHitCount / sigEveryN) -
        Math.floor(side.stacks.signatureHitCount / sigEveryN)
      : 0;
  const lawGain = addLawInscriptionGain(
    side.stacks.lawInscriptions,
    result.lawInscriptionGain,
  );
  const nextLawInscriptions = result.lawInscriptionsToConsume
    ? emptyLawInscriptionState()
    : lawGain.state;
  if (signatureExtraActions > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigEvery?.label ?? "연격"}] ${side.name} ${landedSkillHits}회 적중 — 추가 기본 공격 ${signatureExtraActions}회!`,
      side: who,
    });
  }
  let nextTier7 = side.stacks.tier7;
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
        pvpScalePct:
          shadowCoreMechanic?.kind === "shadowCore"
            ? shadowCoreMechanic.pvpScalePct
            : 80,
      });
    }
    if (
      result.castSkillId === "v2c_shadowblade_traceless" ||
      result.castSkillId === "v2c_blackmoon_flurry"
    ) {
      nextTier7.swordShadow = refineSwordShadow(
        nextTier7.swordShadow,
        12,
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
      side.hp / Math.max(1, side.maxHp) <= 0.4
        ? 2
        : 1;
    nextTier7.swordIntent = gainSwordIntent(
      nextTier7.swordIntent ?? 0,
      gain,
    );
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[검의] ${nextTier7.swordIntent}/3`,
      side: who,
    });
  }
  if (nextTier7 && startingRuinCharge) {
    nextTier7.ruinCharge = startRuinCharge({
      hp: side.hp,
      intent: nextTier7.swordIntent ?? 0,
    });
    nextTier7.swordIntent = 0;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 검의 3개를 소모해 충전을 시작했다. 다음 행동 기회에 자동 해방한다.`,
      side: who,
    });
  } else if (nextTier7 && ruinChargeAtActionStart) {
    nextTier7.ruinCharge = undefined;
    nextTier7.swordIntent = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 충전을 해방하고 검의 1개를 되찾았다.`,
      side: who,
    });
  }
  if (nextTier7 && crossover) {
    nextTier7.lastCrossFamily = crossover.state.lastFamily;
    if (crossover.bonus !== "none") {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[교차·${crossover.bonus === "capture" ? "포획" : "추격"}] 행동 가속 ${crossover.hastePct}%`,
        side: who,
      });
    }
  }
  const formulaManaSettlement = formulaPreview
    ? settleFormulaManaRecovery({
        state: formulaState,
        next: formulaPreview.next,
        completes: formulaPreview.completes,
        castMpSpent: result.mpSpent,
        castMpRestored: result.manaRestored + sigMpRefundAmount,
        requestedCompletionRestore: formulaOptimizationEquipped
          ? Math.floor(side.maxMp * 0.1)
          : 0,
        advancesFormula: formulaPreview.next !== formulaState,
      })
    : null;
  const formulaRestore = formulaManaSettlement?.completionRestore ?? 0;
  if (nextTier7 && formulaPreview) {
    nextTier7.formula = formulaManaSettlement?.next ?? formulaPreview.next;
    if (formulaPreview.completes) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[완전식] ${result.castSkillName ?? "주문"} 강화 발동.`,
        side: who,
      });
      if (formulaRestore > 0) {
        nextLog = appendLog(nextLog, {
          kind: "info",
          text: `[마력 최적화] ${side.name} 마나 ${formulaRestore} 회복`,
          side: who,
        });
      }
    }
  }
  // 차수… 아니라 temp 버프 turns 감소는 **자기 턴 시작(여기, cast hook = phase 당 1회)**에서.
  // 새 버프 시전이면 그 turns 로 리셋, 아니면 -1. 턴 시작 감소라 방어용 선풍각(상대 턴에 소비)도
  // 시전 턴 직후 1턴 손실 없이 N 턴 유지(PvE 는 자기 턴에 소비/감소라 turn-end, PvP 는 turn-start).
  const nextStacks: PvPSideStacks = {
    ...side.stacks,
    patternAlternateLastSkillByPair: advancePatternAlternateState(side.stacks.patternAlternateLastSkillByPair, result.patternAlternateTransition),
    ...(nextTier7 ? { tier7: nextTier7 } : {}),
    tripleWard: refreshedTripleWard,
    evadesRemaining:
      side.stacks.evadesRemaining + result.guaranteedEvadesToAdd,
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
      : side.stacks.skillEvasionTurns,
    accuracyDownPct: side.stacks.accuracyDownPct,
    accuracyDownTurns: Math.max(0, side.stacks.accuracyDownTurns - 1),
    skillDmgReducePct:
      dmgReduceBuff?.pct ?? side.stacks.skillDmgReducePct,
    skillDmgReduceTurns: dmgReduceBuff
      ? dmgReduceBuff.turns
      : side.stacks.skillDmgReduceTurns,
    skillReflectBoostPct: reflectBuff?.pct ?? side.stacks.skillReflectBoostPct,
    skillReflectBoostTurns: reflectBuff
      ? reflectBuff.turns
      : side.stacks.skillReflectBoostTurns,
    // 속박 — 위 스킬피해 배수와 동일 값(turn-start 감소/set) 사용 → 같은 턴 스킬·평타 일관.
    enemyVulnPct: blockHostileStatus
      ? side.stacks.enemyVulnPct
      : nextEnemyVulnPct,
    enemyVulnTurns: blockHostileStatus
      ? Math.max(0, side.stacks.enemyVulnTurns - 1)
      : nextEnemyVulnTurns,
    enemyMagicVulnPct:
      result.enemyMagicVulnToApply && !blockHostileStatus
        ? result.enemyMagicVulnToApply.pct
        : side.stacks.enemyMagicVulnPct ?? 0,
    enemyMagicVulnTurns:
      result.enemyMagicVulnToApply && !blockHostileStatus
        ? result.enemyMagicVulnToApply.turns
        : Math.max(0, (side.stacks.enemyMagicVulnTurns ?? 0) - 1),
    // 화상 — 이 side 에 걸린 회복 감소. 자기 턴 시작에 turns 감소(부착은 상대 cast 의 nextOpp 에서).
    healReducePct: side.stacks.healReducePct,
    healReduceTurns: Math.max(0, side.stacks.healReduceTurns - 1),
    damageDownPct: side.stacks.damageDownPct,
    damageDownTurns: Math.max(0, side.stacks.damageDownTurns - 1),
    skillProcDownPct: side.stacks.skillProcDownPct,
    skillProcDownTurns: Math.max(0, side.stacks.skillProcDownTurns - 1),
    dotVulnPct: side.stacks.dotVulnPct,
    dotVulnTurns: Math.max(0, side.stacks.dotVulnTurns - 1),
    // 주문 중첩 — 패시브 보유 + 시전 시 +1(데미지 무관, cap). PvE increment 미러.
    spellCastCount:
      (side.player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
        ? Math.min(SPELL_STACK_CAP, side.stacks.spellCastCount + 1)
        : side.stacks.spellCastCount,
    comboHitCount: nextComboHitCount,
    signatureHitCount: nextSigHitCount,
    signatureBonusAttacksLeft:
      side.stacks.signatureBonusAttacksLeft + signatureExtraActions,
    fortressImpact: Math.max(
      0,
      side.stacks.fortressImpact - result.fortressImpactToConsume,
    ),
    mutationWeight: result.mutationTransition.weightAfter,
    ironWallReflectCharges:
      result.ironWallReflectToApply?.charges ??
      side.stacks.ironWallReflectCharges,
    ...((side.stacks.lawInscriptions != null ||
      side.player.lawInscription ||
      result.lawInscriptionsToConsume != null)
      ? { lawInscriptions: nextLawInscriptions }
      : {}),
  };
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
      side: who,
    });
  }
  if (lawConsumeText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawConsumeText,
      side: who,
    });
  }
  if (result.lawInscriptionComplete) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: "공격·환류·침식·수호가 하나로 이어져 완성 각인이 발동했다.",
      side: who,
    });
  }
  if (result.ironWallReflectToApply && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 철벽 반사 ${result.ironWallReflectToApply.charges}회 준비`,
      side: who,
    });
  }
  if (result.refreshTripleWards && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] ${side.name} 삼중 결계 ${refreshedTripleWard.physical}회 재전개`,
      side: who,
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
      side: who,
    });
  }
  for (const text of mutationTransitionLogLines(
    result.castSkillName,
    result.mutationTransition,
  )) {
    nextLog = appendLog(nextLog, { kind: "info", text, side: who });
  }
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
      text: `[${result.castSkillName ?? "집중"}] 치명타 확률 +${critBuff.pct}%p (${critBuff.turns}행동)`,
      side: who,
    });
  }
  if (evaBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피도 +${evaBuff.pct}% (${evaBuff.turns}행동)`,
      side: who,
    });
  }
  if (dmgReduceBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "방어"}] 받는 피해 -${dmgReduceBuff.pct}% (${dmgReduceBuff.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 적 받는 피해 +${result.enemyVulnToApply.pct}% (${result.enemyVulnToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyMagicVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] ${opp.name}이(가) 받는 마법 피해 +${result.enemyMagicVulnToApply.pct}% (${result.enemyMagicVulnToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyAccuracyDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] ${opp.name} 적중도 −${result.enemyAccuracyDownToApply.pct}% (${result.enemyAccuracyDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyAccuracyDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] ${opp.name} 적중도 −${result.enemyAccuracyDownToApply.pct}% (${result.enemyAccuracyDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyDamageDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "쇠약"}] ${opp.name} 주는 피해 −${result.enemyDamageDownToApply.pct}% (${result.enemyDamageDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemySkillProcDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "금제"}] ${opp.name} 스킬 발동률 −${result.enemySkillProcDownToApply.pct}%p (${result.enemySkillProcDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyDotVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] ${opp.name} 지속/저주 피해 +${result.enemyDotVulnToApply.pct}% (${result.enemyDotVulnToApply.turns}행동)`,
      side: who,
    });
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  // enemyDebuff 결과는 상대 side 의 v2SelfDebuffs 에 박힌다.
  const nextOppSelfDebuffs = blockHostileStatus
    ? opp.v2SelfDebuffs
    : applyV2BuffsToMap(opp.v2SelfDebuffs, result.enemyDebuffsToApply);
  // PR-8 — dot 결과는 상대 side 의 v2Dots 에 박힌다.
  const dotsToApplyToTarget = applyPoisonDamageToDots(
    result.dotsToApplyToTarget,
    side.player,
  );
  const dotsBeforeBleedHunt = blockHostileStatus
    ? opp.v2Dots
    : applyV2DotsToTarget(
        applyV2DotsToTarget(opp.v2Dots, dotsToApplyToTarget),
        sigSkillTargetDots,
      );
  const nextOppDots = blockHostileStatus
    ? dotsBeforeBleedHunt
    : applyBleedChangeToDots(
        dotsBeforeBleedHunt,
        result.bleedChangeToApply,
      );
  const bleedBeforeChange = dotsBeforeBleedHunt.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const bleedAfterChange = nextOppDots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  if (
    !blockHostileStatus &&
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
      side: who,
    });
  }
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      side: who,
    });
  }
  for (const d of blockHostileStatus ? [] : result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (${d.turns}행동)`,
      side: who,
    });
  }
  if (statusBlockTargetEffects && sigStatusBlock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigStatusBlock.label}] ${opp.name} 상태이상을 막았다.`,
      side: who,
    });
  }
  if (purificationBlockTargetEffects) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS.purification}] ${opp.name} 상태이상을 막았다. (${nextOppTripleWard.purification}회 남음)`,
      side: otherKey,
    });
  }
  for (const dot of blockHostileStatus ? [] : dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? dot.label}] +${dot.stacks}스택 (${dot.turns}회)`,
      side: who,
    });
  }
  const transitionedBerserker = side.berserker
    ? applyBerserkerCastTransition(
        side.berserker,
        result.berserkerTransition,
      )
    : undefined;
  const nextBerserker = transitionedBerserker;
  const berserkerAttackStart =
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
      ? side.berserker
      : undefined;
  const castDeclaration = result.castSkillId
    ? composeDuelistDeclaration(side.v2Skills.equipped, result.castSkillId)
    : null;
  const nextDuelistBuff = castDeclaration
    ? castDeclaration
    : result.castSkillId
      ? interruptDuelistRamp(side.duelistBuff)
      : side.duelistBuff;
  if (castDeclaration) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: duelistDeclarationSummary(castDeclaration),
      side: who,
    });
  }
  const nextSide: PvPSide = {
    ...side,
    // 스킬은 이번 행동의 평타를 대체한다. 다단 적중 시그니처가 만든 추가 기본 공격만 남긴다.
    attacksLeft: result.castSkillId
      ? signatureExtraActions
      : side.attacksLeft,
    hp: nextSideHp,
    ...(nextBerserker ? { berserker: nextBerserker } : {}),
    mp: Math.min(
      side.maxMp,
      result.nextMp + sigMpRefundAmount + formulaRestore,
    ),
    duelistBuff: nextDuelistBuff,
    buffs: hasSigSkillBuffs
      ? { ...side.buffs, ...sigSkillBuffs }
      : side.buffs,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs,
    flags: skillCritAfterEvadeFired
      ? { ...side.flags, skillCritAfterEvadePending: false }
      : side.flags,
    stacks:
      healShieldAmount > 0
        ? {
            ...nextStacks,
            playerShield: nextStacks.playerShield + healShieldAmount,
          }
        : nextStacks,
  };
  // 약점 노출 — 시전자가 패시브 보유 + 시전 + 데미지 적중이면 확률로 상대 마법취약 +1(상한 클램프, 감쇠 없음).
  const magicVulnApplyChancePct = side.player.enemyMagicVulnApplyChancePct ?? 100;
  const magicVulnApplied =
    !blockHostileStatus &&
    (side.player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0 &&
    magicVulnApplyChancePct > 0 &&
    (magicVulnApplyChancePct >= 100 ||
      combatRandom() * 100 < magicVulnApplyChancePct);
  const nextOppMagicVuln =
    magicVulnApplied
      ? Math.min(MAGIC_VULN_STACK_CAP, opp.stacks.magicVulnStacks + 1)
      : opp.stacks.magicVulnStacks;
  const nextOppTier7 = opp.stacks.tier7?.ruinCharge
    ? {
        ...opp.stacks.tier7,
        ruinCharge: {
          ...recordChargeHpLoss(
            opp.stacks.tier7.ruinCharge,
            skillDamageToHp,
          ),
          deathBypassTriggered:
            opp.stacks.tier7.ruinCharge.deathBypassTriggered ||
            berserkerSurvivalTriggered,
        },
      }
    : opp.stacks.tier7;
  if (nextOppMagicVuln > opp.stacks.magicVulnStacks) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흉조] ${opp.name}에게 마법취약 +1 (${nextOppMagicVuln}/${MAGIC_VULN_STACK_CAP})`,
      side: who,
    });
  }
  const nextOppBeforeTrackedShield: PvPSide = {
    ...opp,
    hp: nextOppHp,
    magicBarrier: nextOppMagicBarrier,
    flags: {
      ...opp.flags,
      enduranceTriggered:
        opp.flags.enduranceTriggered || skillEnduranceFires,
      statusBlockUsed:
        opp.flags.statusBlockUsed || statusBlockTargetEffects,
    },
    ...(nextOppBerserker
      ? {
          berserker: finishBerserkerCurrentActionGuard(nextOppBerserker),
        }
      : {}),
    v2SelfDebuffs: nextOppSelfDebuffs,
    v2Dots: nextOppDots,
    stacks: {
      ...opp.stacks,
      ...(nextOppTier7 ? { tier7: nextOppTier7 } : {}),
      tripleWard: nextOppTripleWard,
      playerShield: nextOppShield,
      braceDefBonus: nextOppBraceDefBonus,
      magicVulnStacks: nextOppMagicVuln,
      ...(!blockHostileStatus && frostChill.requestedGain > 0
        ? { frostChillStacks: frostChill.next }
        : {}),
      // 화상 부착 — 시전자가 상대에게 회복 감소 디버프. 상대는 자기 턴(cast hook)에 turns 감소.
      healReducePct: !blockHostileStatus && result.enemyHealReduceToApply
        ? result.enemyHealReduceToApply.pct
        : opp.stacks.healReducePct,
      healReduceTurns: !blockHostileStatus && result.enemyHealReduceToApply
        ? result.enemyHealReduceToApply.turns
        : opp.stacks.healReduceTurns,
      accuracyDownPct:
        !blockHostileStatus && result.enemyAccuracyDownToApply
          ? result.enemyAccuracyDownToApply.pct
          : opp.stacks.accuracyDownPct,
      accuracyDownTurns: !blockHostileStatus && result.enemyAccuracyDownToApply
        ? result.enemyAccuracyDownToApply.turns
        : opp.stacks.accuracyDownTurns,
      damageDownPct: !blockHostileStatus && result.enemyDamageDownToApply
        ? result.enemyDamageDownToApply.pct
        : opp.stacks.damageDownPct,
      damageDownTurns: !blockHostileStatus && result.enemyDamageDownToApply
        ? result.enemyDamageDownToApply.turns
        : opp.stacks.damageDownTurns,
      skillProcDownPct:
        !blockHostileStatus && result.enemySkillProcDownToApply
          ? result.enemySkillProcDownToApply.pct
          : opp.stacks.skillProcDownPct,
      skillProcDownTurns:
        !blockHostileStatus && result.enemySkillProcDownToApply
        ? result.enemySkillProcDownToApply.turns
        : opp.stacks.skillProcDownTurns,
      dotVulnPct: !blockHostileStatus && result.enemyDotVulnToApply
        ? result.enemyDotVulnToApply.pct
        : opp.stacks.dotVulnPct,
      dotVulnTurns: !blockHostileStatus && result.enemyDotVulnToApply
        ? result.enemyDotVulnToApply.turns
        : opp.stacks.dotVulnTurns,
      ...(!blockHostileStatus && sigSkill.hitShock
        ? { shockAction: "pending" as const }
        : {}),
    },
  };
  const trackedSkillShieldBreak = applyTrackedSetShieldAbsorptionPvP(
    nextOppBeforeTrackedShield,
    skillShieldAbsorbed,
  );
  const nextOpp = trackedSkillShieldBreak.side;
  if (trackedSkillShieldBreak.triggered) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${trackedSkillShieldBreak.label ?? "보호막 해방"}] ${opp.name}의 해로운 효과가 해제되고 받는 피해가 감소한다.`,
      side: otherKey,
    });
  }
  const selfHastePct = Math.max(
    result.selfHasteToApply?.pct ?? 0,
    crossover?.hastePct ?? 0,
    formulaPreview?.completes ? 12 : 0,
  );
  const enemyDelayPct = blockHostileStatus
    ? 0
    : Math.max(
        result.enemyDelayToApply?.pct ?? 0,
        crossover?.enemyDelayPct ?? 0,
        frostChill.triggered ? frostChill.delayPct : 0,
      );
  let next: PvPBattleState = { ...st, log: nextLog };
  next = setSide(next, who, nextSide);
  next = setSide(next, otherKey, nextOpp);
  let tier6ExtraActions = 0;
  if (result.castSkillId && next[who].stacks.tier6Uniques) {
    const actionId = side.turn.completedPlayerTurns + 1;
    const dotsBefore = tier6PvpDotContext(opp);
    const statusKindsBefore = tier6PvpStatusKindCount(side, opp);
    next = applyTier6UniquePvpEvent(next, who, otherKey, {
      kind: "action_start",
      shield: side.stacks.playerShield,
      maxHp: side.maxHp,
      origin: { actionId, eventId: next.log.length },
    });
    if (costPaid > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "mp_spent",
        amount: costPaid,
        magicAtk: tier6UnityMagicAtk,
        targetHasStatus: statusKindsBefore > 0,
        origin: { actionId, eventId: next.log.length },
      });
    }
    for (let index = 0; index < tier6SkillHitDamages.length; index += 1) {
      const attacksBefore = next[who].attacksLeft;
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "direct_hit",
        damage: tier6SkillHitDamages[index]!,
        crit: skillCritFired,
        attackKind: "skill",
        paidMp: index === 0 ? costPaid : 0,
        statusKinds: statusKindsBefore,
        bleedStacks: dotsBefore.bleed.stacks,
        bleedRemainingDamage: dotsBefore.bleed.remainingDamage,
        poisonStacks: dotsBefore.poison.stacks,
        poisonRemainingDamage: dotsBefore.poison.remainingDamage,
        magicAtk: tier6UnityMagicAtk,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length + index + 1 },
      });
      tier6ExtraActions += Math.max(
        0,
        next[who].attacksLeft - attacksBefore,
      );
    }
    if (resolvedSelfHeal > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "heal_calculated",
        amount: resolvedSelfHeal,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length },
      });
    }
    const tier6ShieldGain = shieldGain + healShieldAmount;
    if (tier6ShieldGain > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "shield_gained",
        amount: tier6ShieldGain,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length },
      });
    }
    next = applyTier6UniquePvpEvent(next, who, otherKey, {
      kind: "hp_threshold",
      currentHp: next[who].hp,
      maxHp: side.maxHp,
      origin: { actionId, eventId: next.log.length },
    });
  }
  if (
    next[otherKey].stacks.tier6Uniques &&
    opp.stacks.playerShield > 0 &&
    nextOppShield <= 0 &&
    skillShieldAbsorbed > 0
  ) {
    next = applyTier6UniquePvpEvent(next, otherKey, who, {
      kind: "shield_broken",
      shieldBefore: opp.stacks.playerShield,
      overflowDamage: skillDamageToHp,
      maxHp: opp.maxHp,
      origin: {
        actionId: side.turn.completedPlayerTurns + 1,
        eventId: next.log.length,
      },
    });
  }
  if (next[otherKey].stacks.tier6Uniques) {
    next = applyTier6UniquePvpEvent(next, otherKey, who, {
      kind: "hp_threshold",
      currentHp: next[otherKey].hp,
      maxHp: next[otherKey].maxHp,
      origin: {
        actionId: side.turn.completedPlayerTurns + 1,
        eventId: next.log.length,
      },
    });
  }
  if (skillGuaranteedEvaded && result.castSkillName) {
    next = applyDodgeEffects(
      next,
      who,
      otherKey,
      `[회피 강화] ${opp.name}이(가) ${side.name}의 ${result.castSkillName}을(를) 회피했다.`,
      true,
      true,
    );
  }
  // 직접 피해 스킬도 한 번의 피격 행동으로 반사·반격을 발동한다. 다단 스킬은 회피 판정과
  // 동일하게 한 행동으로 취급하며, 스킬로 방어자가 쓰러진 경우에는 평타와 마찬가지로
  // 반사·반격하지 않는다.
  if (
    skillReflectBase > 0 &&
    next[otherKey].hp > 0 &&
    next.phase !== "ended"
  ) {
    const reflected = applyOnHitReflect(
      next,
      who,
      otherKey,
      skillReflectBase,
      false,
      skillDamageToHp <= 0,
    );
    next = reflected.state;
    if (reflected.attackerKilled) {
      return {
        state: releaseSwordShadowAfterPvPAction(next, who, otherKey),
        castFired: result.castSkillId != null,
        signatureExtraActions: signatureExtraActions + tier6ExtraActions,
        selfHastePct,
        enemyDelayPct,
      };
    }
  }
  if (
    skillDamageToHp > 0 &&
    next[otherKey].hp > 0 &&
    next[who].hp > 0 &&
    next.phase !== "ended"
  ) {
    const countered = maybeApplyMartialCounter(
      next,
      who,
      otherKey,
      false,
    );
    next = countered.state;
    if (countered.attackerKilled) {
      return {
        state: releaseSwordShadowAfterPvPAction(next, who, otherKey),
        castFired: result.castSkillId != null,
        signatureExtraActions: signatureExtraActions + tier6ExtraActions,
        selfHastePct,
        enemyDelayPct,
      };
    }
  }
  if (
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
  ) {
    next = finishPvPBerserkerAttackAction(
      next,
      who,
      berserkerAttackStart,
    );
  }
  // 스킬 데미지로 상대가 쓰러지면 즉시 전투 종료 (PvE resolveBattle 의 enemyHp<=0 가드 미러).
  //   이 가드가 없으면 상대 HP 0 인 채로 시전자의 후속 액션이 한 스텝 더 진행된다 — 평타면 시체를
  //   한 번 더 때려(cosmetic) 결국 종료되지만, 포션 등 비공격 액션이면 죽은 쪽으로 페이즈가 넘어가는
  //   잠재 버그. 다단히트로 치명 시전이 흔해져 가드 필수. main loop 가 phase==="ended" 를 받아 처리.
  if (nextOppHp <= 0 && next.phase !== "ended") {
    const endedState: PvPBattleState = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${opp.name}이(가) 쓰러졌다.`,
        side: who,
      }),
      phase: "ended",
      outcome: who === "p1" ? "p1_win" : "p2_win",
    };
    return {
      state: releaseSwordShadowAfterPvPAction(
        endedState,
        who,
        otherKey,
      ),
      castFired: result.castSkillId != null,
      signatureExtraActions: signatureExtraActions + tier6ExtraActions,
      selfHastePct,
      enemyDelayPct,
    };
  }
  const provokeImmediateBasicAttacks = result.castSkillId
    ? Math.max(
        0,
        Math.floor(
          V2_SKILLS[result.castSkillId]?.provokeImmediateBasicAttacks ?? 0,
        ),
      )
    : 0;
  if (provokeImmediateBasicAttacks > 0 && result.castSkillName) {
    next = applyImmediateProvokedBasicAttacksPvP(
      next,
      who,
      provokeImmediateBasicAttacks,
      result.castSkillName,
    );
  }
  return {
    state: next,
    castFired: result.castSkillId != null,
    signatureExtraActions: signatureExtraActions + tier6ExtraActions,
    selfHastePct,
    enemyDelayPct,
  };
}
