import { STAT_LABELS } from "@/adventure/data/stats";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import { applyEvasionDamageReduction } from "@/adventure/data/v2/v2CombatConstants";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import { healingReductionPct } from "./burnHealing";
import { recordCombatDamage, recordCombatMetric } from "./combatDiagnostics";
import { combatRandom } from "./combatRandom";
import { applyV2BuffsToMap, applyV2DotsToTarget, healingAfterReceivedMultiplier, resolveV2SkillCast, type V2SkillCastResult } from "./combatShared";
import { distributeBoostedHits } from "./hitDistribution";
import { sumMagicBarrierDamage, unyieldingDamagePve } from "./unexploredSetPveAdapter";
import { resolveEnemySkillReflection } from "./engine.enemySkillReflection";
import { applyBerserkerHostileDamage, applyCounterIfAny, applyTrackedSetShieldAbsorptionPve, recordEnemyDamage } from "./engine.pveOperations";
import { applyPassiveCounterOnHitIfAny } from "./engine.passiveCounter";
import { type BattleLogEntry, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog, appendSkillCastLog, playerPveEvasionReductionPct } from "./engineSupport";
import { consumeReactiveDefenseCharges, ironWallDamageReductionPct, resolveFortressReaction } from "./fortressKnight";
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage, type MagicBarrierDamageResult } from "./magicBarrier";
import { effectiveMutationDef } from "./mutationCombat";
import { applyNextAttackDamageDown, consumeNextAttackDamageDown } from "./paragonCombat";
import { healToShield, lowHpDamageReductionPct, onDodgeSpeedBuff, statusBlockOnce } from "./signatureEffects";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import { consumePurificationWard, resolveTripleWardDamage, TRIPLE_WARD_LABELS, tripleWardStabilityReductionPct, type TripleWardDamageKind, type TripleWardState } from "./tripleWard";
import { type EnemyHitResolution } from "./unexploredSetEffects";
import { recordUnexploredEnemySkillHits } from "./unexploredSetPveAdapter";
export { resolveEnemySkillReflection } from "./engine.enemySkillReflection";

export type EnemySkillMitigation = {
  damage: number;
  evasionReductionPct: number;
  evasionReducedBy: number;
  resolveReducedBy: number;
  endureReducedBy: number;
  passiveReducedBy: number;
  stabilityReducedBy: number;
  stabilityStacksBefore: number;
  wardReductions: Array<{
    kind: TripleWardDamageKind;
    reductionPct: number;
    reducedBy: number;
    remaining: number;
  }>;
  tripleWard: TripleWardState;
  guardReducedBy: number;
  steadfastReducedBy: number;
};

export function reduceIncomingEnemySkillDamage(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage" | "magicEnemyDamage">,
  applyTripleWard = true,
): EnemySkillMitigation {
  const damage = applyNextAttackDamageDown(result.enemyDamage, state.stacks.nextAttackDamageDownPct);
  if (damage <= 0) {
    return {
      damage: 0,
      evasionReductionPct: 0,
      evasionReducedBy: 0,
      resolveReducedBy: 0,
      endureReducedBy: 0,
      passiveReducedBy: 0,
      stabilityReducedBy: 0,
      stabilityStacksBefore: state.stacks.tripleWard.stabilityStacks,
      wardReductions: [],
      tripleWard: state.stacks.tripleWard,
      guardReducedBy: 0,
      steadfastReducedBy: 0,
    };
  }
  const evasionReductionPct = playerPveEvasionReductionPct(state, player);
  const afterEvasion = applyEvasionDamageReduction(
    damage,
    evasionReductionPct,
  );
  const afterUnyielding = unyieldingDamagePve(state, player, afterEvasion);
  const afterEnemyDamageDown =
    state.stacks.enemyDamageDownTurns > 0 &&
    state.stacks.enemyDamageDownPct > 0
      ? Math.max(
          1,
          Math.floor(
            afterUnyielding * (1 - state.stacks.enemyDamageDownPct / 100),
          ),
        )
      : afterUnyielding;
  const afterResolve =
    state.buffs.playerDmgReductionTurnsLeft > 0 &&
    state.buffs.playerDmgReductionPct > 0
      ? Math.max(
          1,
          Math.floor(
            afterEnemyDamageDown *
              (1 - state.buffs.playerDmgReductionPct / 100),
          ),
        )
      : afterEnemyDamageDown;
  const endurePct = player.enchantEndurePct ?? 0;
  const afterEndure =
    endurePct > 0
      ? Math.max(1, Math.floor(afterResolve * (1 - endurePct / 100)))
      : afterResolve;
  const activeReductionPct =
    state.stacks.skillDmgReduceTurns > 0
      ? state.stacks.skillDmgReducePct
      : 0;
  const lowHpReductionPct = lowHpDamageReductionPct(
    player.equipSignatures,
    state.playerHp,
    player.maxHp,
  );
  const generalReductionPct =
    (player.passiveDamageTakenReductionPct ?? 0) +
    activeReductionPct +
    ironWallDamageReductionPct(state.stacks.ironWallReflectCharges) +
    lowHpReductionPct;
  const openingMagicReductionPct =
    result.magicEnemyDamage > 0 &&
    state.turn.enemyPhasesCompleted <
      (player.passiveOpeningMagicDamageReductionPhases ?? 0)
      ? (player.passiveOpeningMagicDamageReductionPct ?? 0)
      : 0;
  const magicDamageShare = Math.min(
    1,
    Math.max(0, result.magicEnemyDamage / Math.max(1, damage)),
  );
  const passiveReductionPct =
    generalReductionPct + openingMagicReductionPct * magicDamageShare;
  const afterPassive = passiveReductionPct > 0
    ? Math.max(
        1,
        Math.floor(afterEndure * (1 - passiveReductionPct / 100)),
      )
    : afterEndure;
  const stabilityPct = applyTripleWard
    ? tripleWardStabilityReductionPct(state.stacks.tripleWard)
    : 0;
  const afterStability = stabilityPct > 0
    ? Math.max(1, Math.floor(afterPassive * (1 - stabilityPct / 100)))
    : afterPassive;
  let tripleWard = state.stacks.tripleWard;
  const wardReductions: EnemySkillMitigation["wardReductions"] = [];
  let afterWards = afterStability;
  if (applyTripleWard && afterStability > 0) {
    const physicalDamage = Math.floor(afterStability * (1 - magicDamageShare));
    const magicDamage = afterStability - physicalDamage;
    let resolvedTotal = 0;
    for (const [kind, part] of [
      ["physical", physicalDamage],
      ["magic", magicDamage],
    ] as const) {
      if (part <= 0) continue;
      const ward = resolveTripleWardDamage(tripleWard, kind, "pve", [part]);
      tripleWard = ward.state;
      resolvedTotal += ward.totalDamage;
      if (ward.consumed) {
        wardReductions.push({
          kind,
          reductionPct: ward.reductionPct,
          reducedBy: part - ward.totalDamage,
          remaining: ward.remaining,
        });
      }
    }
    afterWards = resolvedTotal;
  }
  const guard = player.guard;
  const afterGuard =
    guard &&
    guard.turns > 0 &&
    state.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, afterWards - guard.reduction)
      : afterWards;
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const afterSteadfast =
    steadfastFlat > 0 ? Math.max(0, afterGuard - steadfastFlat) : afterGuard;
  return {
    damage: afterSteadfast,
    evasionReductionPct,
    evasionReducedBy: damage - afterEvasion,
    resolveReducedBy: afterEnemyDamageDown - afterResolve,
    endureReducedBy: afterResolve - afterEndure,
    passiveReducedBy: afterEndure - afterPassive,
    stabilityReducedBy: afterPassive - afterStability,
    stabilityStacksBefore: state.stacks.tripleWard.stabilityStacks,
    wardReductions,
    tripleWard,
    guardReducedBy: afterWards - afterGuard,
    steadfastReducedBy: afterGuard - afterSteadfast,
  };
}

export function resolveIncomingEnemySkillWithBarrier(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage" | "magicEnemyDamage"> & Partial<Pick<V2SkillCastResult, "hitDamages">>,
): {
  barrier: MagicBarrierDamageResult;
  mitigation: EnemySkillMitigation;
  hits?: EnemyHitResolution[];
} {
  if (state.unexploredSetRuntime && (result.hitDamages?.length ?? 0) > 1 && result.enemyDamage > 0) {
    const rawHits = distributeBoostedHits(result.hitDamages!, result.enemyDamage);
    const magicHits = distributeBoostedHits(result.hitDamages!, result.magicEnemyDamage);
    let current = state;
    let combined: ReturnType<typeof resolveIncomingEnemySkillWithBarrier> | undefined;
    const hits: EnemyHitResolution[] = [];
    for (let index = 0; index < rawHits.length; index++) {
      const resolved = resolveIncomingEnemySkillWithBarrier(current, player, {
        enemyDamage: rawHits[index]!, magicEnemyDamage: magicHits[index]!,
      });
      const shieldAbsorbed = Math.min(current.stacks.playerShield, resolved.barrier.hpBoundDamage);
      const hpDamage = Math.min(current.playerHp, resolved.barrier.hpBoundDamage - shieldAbsorbed);
      hits.push({ rawDirectDamage: rawHits[index]!, damageAfterEvasion: rawHits[index]! - resolved.mitigation.evasionReducedBy,
        evasionPreventedDamage: resolved.mitigation.evasionReducedBy, shieldAbsorbed, hpDamage, fullyEvaded: false });
      current = { ...current, playerHp: Math.max(0, current.playerHp - hpDamage), playerMagicBarrier: resolved.barrier.durabilityLeft,
        stacks: { ...current.stacks, playerShield: current.stacks.playerShield - shieldAbsorbed, tripleWard: resolved.mitigation.tripleWard } };
      if (!combined) {
        combined = resolved;
      } else {
        const mitigation = { ...resolved.mitigation, wardReductions: [...combined.mitigation.wardReductions, ...resolved.mitigation.wardReductions], stabilityStacksBefore: combined.mitigation.stabilityStacksBefore };
        for (const key of ["damage", "evasionReducedBy", "resolveReducedBy", "endureReducedBy", "passiveReducedBy", "stabilityReducedBy", "guardReducedBy", "steadfastReducedBy"] as const) {
          mitigation[key] += combined.mitigation[key];
        }
        combined = { barrier: sumMagicBarrierDamage(combined.barrier, resolved.barrier), mitigation };
      }
    }
    return { ...combined!, hits };
  }
  let mitigation: EnemySkillMitigation | undefined;
  const magicShare = Math.min(
    1,
    Math.max(0, result.magicEnemyDamage / Math.max(1, result.enemyDamage)),
  );
  const barrier = resolveMagicBarrierDamage({
    rawDamage: result.enemyDamage,
    durability: state.playerMagicBarrier ?? 0,
    absorbPct: player.magicBarrierAbsorbPct,
    efficiencyPct: player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) => {
      mitigation = reduceIncomingEnemySkillDamage(state, player, {
        enemyDamage: bodyRawDamage,
        magicEnemyDamage: Math.floor(bodyRawDamage * magicShare),
      });
      return mitigation.damage;
    },
  });
  return {
    barrier,
    mitigation:
      mitigation ?? reduceIncomingEnemySkillDamage(state, player, result, false),
  };
}

export function appendEnemySkillMitigationLogs(
  log: BattleLogEntry[],
  mitigation: EnemySkillMitigation,
): BattleLogEntry[] {
  let next = log;
  if (mitigation.evasionReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[회피 경감 ${mitigation.evasionReductionPct.toFixed(1)}%] 피해 -${mitigation.evasionReducedBy}`,
    });
  }
  if (mitigation.resolveReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[결의] 피해 -${mitigation.resolveReducedBy}`,
    });
  }
  if (mitigation.endureReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[인내] 피해 -${mitigation.endureReducedBy}`,
    });
  }
  if (mitigation.passiveReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[받피감] 피해 -${mitigation.passiveReducedBy}`,
    });
  }
  if (mitigation.stabilityReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[영역 안정 ${mitigation.stabilityStacksBefore}중첩] 피해 -${mitigation.stabilityReducedBy}`,
    });
  }
  for (const ward of mitigation.wardReductions) {
    next = appendLog(next, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS[ward.kind]}] 직접 ${ward.kind === "magic" ? "마법" : "물리"} 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
    });
  }
  if (mitigation.guardReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[가드] 피해 -${mitigation.guardReducedBy}`,
    });
  }
  if (mitigation.steadfastReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[굳건한 의지] 피해 -${mitigation.steadfastReducedBy}`,
    });
  }
  return next;
}

export function evadeIncomingEnemySkill(
  state: BattleState,
  player: PlayerCombat,
  result: V2SkillCastResult,
): { state: BattleState; result: V2SkillCastResult } {
  if (
    !result.castSkillId ||
    result.enemyDamage <= 0 ||
    state.stacks.evadesRemaining <= 0
  ) {
    return { state, result };
  }

  let nextLog = appendLog(state.log, {
    kind: "info",
    text: `[회피 강화] ${state.enemy.name}의 ${result.castSkillName ?? "스킬 공격"}을(를) 회피했다!`,
  });
  const critAfterEvadePrepared =
    !!player.skillCritAfterEvade && !state.flags.skillCritAfterEvadePending;
  if (critAfterEvadePrepared) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] 다음 직접 피해 스킬 치명타 준비.`,
    });
  }

  const evadeHeal = healingAfterReceivedMultiplier(
    player.evadeHealAmount ?? 0,
    player.receivedHealMult,
  );
  const nextPlayerHp =
    evadeHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + evadeHeal)
      : state.playerHp;
  const actualHeal = nextPlayerHp - state.playerHp;
  recordCombatMetric("healing", "dodge", "player", actualHeal);
  const sigShield =
    actualHeal > 0
      ? healToShield(player.equipSignatures, {
          actualHeal,
          calculatedHeal: evadeHeal,
          maxHp: state.playerMaxHp,
        })
      : null;
  if (actualHeal > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[곡예] 플레이어의 HP +${actualHeal}`,
    });
  }
  if (sigShield) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigShield.label}] 플레이어 보호막 +${sigShield.amount}`,
    });
  }

  const speedBuff = onDodgeSpeedBuff(player.equipSignatures);
  if (speedBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${speedBuff.label}] 플레이어의 속도 +${Math.round((speedBuff.mult - 1) * 100)}% (${speedBuff.turns}행동)`,
    });
  }
  const activeSpeedMult =
    state.buffs.playerSpdTurnsLeft > 0 ? state.buffs.playerSpdMult : 1;
  let nextState: BattleState = {
    ...state,
    playerHp: nextPlayerHp,
    playerAttacksLeft:
      state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
    buffs: speedBuff
      ? {
          ...state.buffs,
          playerSpdMult: Math.max(activeSpeedMult, speedBuff.mult),
          playerSpdTurnsLeft: Math.max(
            state.buffs.playerSpdTurnsLeft,
            speedBuff.turns,
          ),
        }
      : state.buffs,
    flags: critAfterEvadePrepared
      ? { ...state.flags, skillCritAfterEvadePending: true }
      : state.flags,
    stacks: {
      ...state.stacks,
      evadesRemaining: state.stacks.evadesRemaining - 1,
      playerShield:
        state.stacks.playerShield + (sigShield?.amount ?? 0),
    },
    log: nextLog,
  };
  const counter = applyCounterIfAny(nextState, player);
  nextState = counter.state;

  return {
    state: nextState,
    result: {
      ...result,
      enemyDamage: 0,
      magicEnemyDamage: 0,
      dotsToApplyToTarget: [],
      enemyDebuffsToApply: [],
      enemyVulnToApply: undefined,
      enemyEvasionDownToApply: undefined,
      enemyAccuracyDownToApply: undefined,
      enemyDelayToApply: undefined,
      enemyHealReduceToApply: undefined,
      enemyDamageDownToApply: undefined,
      enemySkillProcDownToApply: undefined,
      enemyDotVulnToApply: undefined,
    },
  };
}

// v2 적(몬스터) 스킬 시전 — applyPlayerV2SkillCast 의 적 대칭판(ATB 라이브 경로용).
//   ⚠️ ATB 전용: 버프/디버프 tick 은 tickEnemyBundleEntry/tickPlayerBundleEntry(번들)가 이미 했으므로
//   여기선 tick 없이 cast 결정 + 효과 적용만 한다(player cast 헬퍼와 동일 소유권 모델 — 이중 tick 방지).
//   레거시 advanceTurn 의 인라인 적 cast 는 자체 tick 을 가지므로 별개이며, 양쪽 모두 직접 피해를
//   보호막으로 먼저 흡수하고 HP 피해가 남을 때만 피격 반격을 허용한다.
//   🔑 v2Skills 미장착 몹은 즉시 no-op → 기존 전투 전부 byte-identical(골든 불변). MP·쿨다운(소모) +
//   데미지/힐/HP비용/자버프/적디버프/도트 + lethal 까지. "시전=평타 XOR"(skipBasic)은 호출부가 처리.
export function applyEnemyV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; castFired: boolean } {
  if (state.enemyV2Skills.equipped.length === 0) {
    return { state, castFired: false };
  }
  let result = resolveV2SkillCast({
    diagnosticActor: "enemy",
    skills: state.enemyV2Skills,
    cooldowns: state.enemyV2SkillCooldowns,
    procRoll: combatRandom() * 100,
    procChanceBonus:
      state.stacks.enemySkillProcDownTurns > 0
        ? -state.stacks.enemySkillProcDownPct
        : 0,
    attacker: {
      mp: state.enemyMp,
      atk: state.enemy.atk,
      maxHp: state.enemy.hp,
      def: state.enemy.def,
      currentHp: state.enemyHp,
      maxMp: state.enemyMaxMp,
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: state.enemyV2Debuffs,
      characterElement: state.enemy.element,
    },
    target: {
      def: effectiveMutationDef(
        player.def + (state.unexploredSetRuntime?.ironWallDefBonus ?? 0),
        state.stacks.mutationWeight,
        player.stoneskinDefPctPerWeight ?? 0,
      ),
      magicDef: player.magicDef,
      selfBuffs: state.v2SelfBuffs,
      selfDebuffs: state.v2SelfDebuffs,
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      bleedStacks: state.playerV2Dots
        .filter((d) => d.tag === "bleed")
        .reduce((s, d) => s + d.stacks, 0),
      poisonStacks: state.playerV2Dots
        .filter((d) => d.tag === "poison")
        .reduce((s, d) => s + d.stacks, 0),
    },
  });
  // 미발동 — 쿨다운 tick(resolveV2SkillCast 내부) + MP(불변)만 반영, 평타로 폴백.
  if (!result.castSkillId) {
    return {
      state: {
        ...state,
        enemyMp: result.nextMp,
        enemyV2SkillCooldowns: result.nextCooldowns,
      },
      castFired: false,
    };
  }
  if (result.castSkillName) {
    state = {
      ...state,
      log: appendSkillCastLog(
        state.log,
        result.castSkillId,
        result.castSkillName,
        { turn: "enemy" },
      ),
    };
  }
  const guaranteedEvade = evadeIncomingEnemySkill(state, player, result);
  state = guaranteedEvade.state;
  result = guaranteedEvade.result;
  if (state.phase === "ended") {
    return {
      state: {
        ...state,
        enemyMp: result.nextMp,
        enemyV2SkillCooldowns: result.nextCooldowns,
      },
      castFired: true,
    };
  }
  let nextPlayerHp = state.playerHp;
  const hpBeforeEnemySkill = state.playerHp;
  let nextEnemyHp = state.enemyHp;
  let nextLog = state.log;
  const fortressReaction = resolveFortressReaction({
    landed: result.enemyDamage > 0,
    defenderDef: effectiveMutationDef(
      player.def,
      state.stacks.mutationWeight,
      player.stoneskinDefPctPerWeight ?? 0,
    ),
    impact: state.stacks.fortressImpact,
    impactOnHit: player.fortressImpactOnHit ?? false,
    ironWallReflectCharges: state.stacks.ironWallReflectCharges,
  });
  const resolvedEnemySkill = resolveIncomingEnemySkillWithBarrier(
    state,
    player,
    result,
  );
  const mitigation = resolvedEnemySkill.mitigation;
  nextLog = appendEnemySkillMitigationLogs(nextLog, mitigation);
  const enemySkillMagicBarrier = resolvedEnemySkill.barrier;
  const enemySkillShieldAbsorbed = Math.min(
    state.stacks.playerShield,
    enemySkillMagicBarrier.hpBoundDamage,
  );
  const enemySkillDamageToHp =
    enemySkillMagicBarrier.hpBoundDamage - enemySkillShieldAbsorbed;
  const nextPlayerShield =
    state.stacks.playerShield - enemySkillShieldAbsorbed;
  const enemySkillReflection = resolveEnemySkillReflection(
    state,
    player,
    result,
    mitigation,
    enemySkillDamageToHp,
    enemySkillShieldAbsorbed,
    fortressReaction,
  );
  const reactiveDefenseCharges = consumeReactiveDefenseCharges(
    {
      evasion: state.stacks.skillEvasionTurns,
      damageReduction: state.stacks.skillDmgReduceTurns,
      reflect: state.stacks.skillReflectBoostTurns,
    },
    {
      evasionUsed:
        result.enemyDamage > 0 && state.stacks.skillEvasionTurns > 0,
      landed: result.enemyDamage > 0,
      reflectEligible: enemySkillReflection.genericReflectEligible,
    },
  );
  if (result.enemyDamage > 0 && result.castSkillName) {
    recordCombatDamage(result.castSkillId ?? "enemy_skill", "player", nextPlayerHp, enemySkillDamageToHp, enemySkillShieldAbsorbed + enemySkillMagicBarrier.absorbedDamage);
    if (enemySkillShieldAbsorbed > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[철벽] 보호막이 ${enemySkillShieldAbsorbed} 흡수 (남은 ${nextPlayerShield})`,
      });
    }
    for (const entry of magicBarrierCombatLogEntries(enemySkillMagicBarrier)) {
      nextLog = appendLog(nextLog, entry);
    }
    nextPlayerHp = Math.max(0, nextPlayerHp - enemySkillDamageToHp);
    nextLog = appendLog(nextLog, {
      kind: "enemy_attack",
      text: `${result.castSkillName}! ${enemySkillDamageToHp} 피해를 입혔다.`,
      enemyHpDamage: enemySkillDamageToHp,
    });
    const survival = applyBerserkerHostileDamage(
      { ...state, playerHp: nextPlayerHp, log: nextLog },
      player,
      nextPlayerHp,
    );
    state = survival.state;
    nextPlayerHp = state.playerHp;
    nextLog = state.log;
  }
  if (fortressReaction.impact > state.stacks.fortressImpact) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[충격 방벽] 충격 +1 (현재 ${fortressReaction.impact}/3)`,
      turn: "enemy",
    });
  }
  if (enemySkillReflection.damage > 0) {
    recordCombatDamage("reflect", "enemy", nextEnemyHp, enemySkillReflection.damage);
    nextEnemyHp = Math.max(0, nextEnemyHp - enemySkillReflection.damage);
    state = recordEnemyDamage(state, enemySkillReflection.damage);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${enemySkillReflection.labels.join(" + ")}] ${state.enemy.name}에게 ${enemySkillReflection.damage} 반사 피해.`,
      turn: "enemy",
    });
  }
  if (fortressReaction.ironWallReflected) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[철벽 태세] 철벽 반사 ${fortressReaction.ironWallReflectCharges}회 남음`,
      turn: "enemy",
    });
  }
  const enemySkillEnduranceFires =
    nextPlayerHp <= 0 &&
    !!player.enduranceActive &&
    !state.flags.enduranceTriggered;
  if (enemySkillEnduranceFires) {
    recordCombatMetric("survival_restoration", "endurance", "player", 1);
    nextPlayerHp = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
      turn: "enemy",
    });
  }
  if (nextEnemyHp > 0 && result.selfHeal > 0 && result.castSkillName) {
    const healReduce =
      healingReductionPct(state.enemyV2Dots, state.stacks.enemyHealReduceTurns > 0 ? state.stacks.enemyHealReducePct : 0);
    const effHeal =
      healReduce > 0
        ? Math.floor(result.selfHeal * (1 - healReduce / 100))
        : result.selfHeal;
    const before = nextEnemyHp;
    nextEnemyHp = Math.min(state.enemy.hp, nextEnemyHp + effHeal);
    const actual = nextEnemyHp - before;
    recordCombatMetric("healing", result.castSkillId ?? "enemy_skill", "enemy", actual);
    if (actual > 0) {
      nextLog = appendLog(nextLog, {
        kind: "enemy_attack",
        text: `${result.castSkillName}! ${state.enemy.name} HP ${actual} 회복했다.`,
      });
    }
  }
  if (nextEnemyHp > 0 && result.selfHpCost > 0) {
    nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
  }
  const nextEnemySelfBuffs = applyV2BuffsToMap(
    state.enemyV2SelfBuffs,
    result.selfBuffsToApply,
  );
  const sigStatusBlock = statusBlockOnce(player.equipSignatures);
  const hasHostileStatus =
    result.enemyDebuffsToApply.length > 0 ||
    result.dotsToApplyToTarget.length > 0;
  const statusBlockTargetEffects =
    hasHostileStatus &&
    !!sigStatusBlock &&
    !state.flags.statusBlockUsed;
  const purificationBlockTargetEffects =
    hasHostileStatus &&
    !statusBlockTargetEffects &&
    mitigation.tripleWard.purification > 0;
  const blockHostileStatus =
    statusBlockTargetEffects || purificationBlockTargetEffects;
  const nextTripleWard = purificationBlockTargetEffects
    ? consumePurificationWard(mitigation.tripleWard).state
    : mitigation.tripleWard;
  const nextPlayerDebuffs = blockHostileStatus
    ? state.v2SelfDebuffs
    : applyV2BuffsToMap(state.v2SelfDebuffs, result.enemyDebuffsToApply);
  const nextPlayerDots = blockHostileStatus
    ? state.playerV2Dots
    : applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget, state.playerMaxHp);
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      turn: "enemy",
    });
  }
  for (const d of blockHostileStatus ? [] : result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (대상 행동 ${d.turns}회)`,
      turn: "enemy",
    });
  }
  if (statusBlockTargetEffects && sigStatusBlock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
      turn: "enemy",
    });
  }
  if (purificationBlockTargetEffects) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${nextTripleWard.purification}회 남음)`,
      turn: "enemy",
    });
  }
  for (const dot of blockHostileStatus ? [] : result.dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
      turn: "enemy",
    });
  }
  const actualEnemySkillHpDamage = Math.max(0, hpBeforeEnemySkill - nextPlayerHp);
  const countered =
    enemySkillDamageToHp > 0 && result.castSkillName
      ? applyPassiveCounterOnHitIfAny(
          {
            ...state,
            stacks: { ...state.stacks, fortressImpact: fortressReaction.impact },
            playerHp: nextPlayerHp,
            enemyHp: nextEnemyHp,
            log: nextLog,
          },
          player,
        )
      : null;
  if (countered) {
    nextPlayerHp = countered.playerHp;
    nextEnemyHp = countered.enemyHp;
    nextLog = countered.log;
  }
  let nextState: BattleState = {
    ...state,
    playerHp: nextPlayerHp,
    playerMagicBarrier: enemySkillMagicBarrier.durabilityLeft,
    enemyHp: nextEnemyHp,
    enemyMp: result.nextMp,
    enemyV2SkillCooldowns: result.nextCooldowns,
    enemyV2SelfBuffs: nextEnemySelfBuffs,
    v2SelfDebuffs: nextPlayerDebuffs,
    playerV2Dots: nextPlayerDots,
    flags: {
      ...state.flags,
      enduranceTriggered:
        state.flags.enduranceTriggered || enemySkillEnduranceFires,
      statusBlockUsed:
        state.flags.statusBlockUsed || statusBlockTargetEffects,
    },
    stacks: {
      ...state.stacks,
      tripleWard: nextTripleWard,
      ...consumeNextAttackDamageDown(state.stacks, result.enemyDamage > 0),
      playerShield: nextPlayerShield,
      skillEvasionTurns: reactiveDefenseCharges.evasion,
      skillDmgReduceTurns: reactiveDefenseCharges.damageReduction,
      skillReflectBoostTurns: reactiveDefenseCharges.reflect,
      ...(countered?.stacks.dreadnought ? { dreadnought: countered.stacks.dreadnought } : {}),
      fortressImpact: countered?.stacks.fortressImpact ?? fortressReaction.impact,
      ironWallReflectCharges: fortressReaction.ironWallReflectCharges,
    },
    log: nextLog,
  };
  nextState = applyTrackedSetShieldAbsorptionPve(
    nextState,
    player,
    enemySkillShieldAbsorbed,
  );
  const skillHits = resolvedEnemySkill.hits ?? [{
    rawDirectDamage: result.enemyDamage,
    damageAfterEvasion: result.enemyDamage - mitigation.evasionReducedBy,
    evasionPreventedDamage: mitigation.evasionReducedBy,
    shieldAbsorbed: enemySkillShieldAbsorbed,
    hpDamage: Math.max(0, hpBeforeEnemySkill - (enemySkillEnduranceFires ? 1 : Math.max(0, hpBeforeEnemySkill - enemySkillDamageToHp))),
    fullyEvaded: result.enemyDamage <= 0,
  }];
  nextState = recordUnexploredEnemySkillHits(nextState, player, skillHits, actualEnemySkillHpDamage);
  if (
    nextState.stacks.tier6Uniques &&
    state.stacks.playerShield > 0 &&
    nextPlayerShield <= 0 &&
    enemySkillShieldAbsorbed > 0
  ) {
    nextState = applyTier6UniquePveEvent(nextState, player, {
      kind: "shield_broken",
      shieldBefore: state.stacks.playerShield,
      overflowDamage: enemySkillDamageToHp,
      maxHp: nextState.playerMaxHp,
      origin: {
        actionId: nextState.turn.enemyPhasesCompleted + 1,
        eventId: nextState.log.length,
      },
    });
  }
  if (nextState.stacks.tier6Uniques) {
    nextState = applyTier6UniquePveEvent(nextState, player, {
      kind: "hp_threshold",
      currentHp: nextState.playerHp,
      maxHp: nextState.playerMaxHp,
      origin: {
        actionId: nextState.turn.enemyPhasesCompleted + 1,
        eventId: nextState.log.length,
      },
    });
  }
  if (countered?.phase === "ended") {
    nextState = {
      ...nextState,
      phase: "ended",
      outcome: countered.outcome,
    };
  } else if (nextState.playerHp <= 0) {
    nextState = {
      ...nextState,
      log: appendLog(nextState.log, {
        kind: "info",
        text: `플레이어가 쓰러졌다.`,
        turn: "enemy",
      }),
      outcome: "lose",
      phase: "ended",
    };
  } else if (nextState.enemyHp <= 0) {
    nextState = {
      ...nextState,
      enemyHp: 0,
      log: appendLog(nextState.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        turn: "enemy",
      }),
      outcome: "win",
      phase: "ended",
    };
  }
  if (nextState.berserker) {
    nextState = {
      ...nextState,
      berserker: finishBerserkerCurrentActionGuard(nextState.berserker),
    };
  }
  return { state: nextState, castFired: true };
}
