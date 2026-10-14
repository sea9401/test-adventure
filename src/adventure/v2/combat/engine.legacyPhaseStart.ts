import { STAT_LABELS } from "@/adventure/data/stats";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import { healingReductionPct } from "./burnHealing";
import { recordCombatDamage, recordCombatDotDamage, recordCombatMetric } from "./combatDiagnostics";
import { combatRandom } from "./combatRandom";
import { applyV2BuffsToMap, applyV2DotsToTarget, distributeV2DotTicks, resolveV2SkillCast, statusDamageAfterReduction, tickV2BuffMap, tickV2Dots, v2DotLogCause } from "./combatShared";
import { deferPainPveSkill } from "./darkPriestAdapters";
import { appendEnemySkillMitigationLogs, evadeIncomingEnemySkill, resolveIncomingEnemySkillWithBarrier } from "./engine.enemySkills";
import { resolveEnemySkillReflection } from "./engine.enemySkillReflection";
import { applyPassiveCounterOnHitIfAny } from "./engine.passiveCounter";
import { applyBerserkerHostileDamage, applyTrackedSetShieldAbsorptionPve } from "./engine.pveOperations";
import { type BattleState, type PlayerCombat } from "./engineState";
import { appendLog, appendSkillCastLog } from "./engineSupport";
import { consumeReactiveDefenseCharges, resolveFortressReaction } from "./fortressKnight";
import { magicBarrierCombatLogEntries } from "./magicBarrier";
import { canMartialCounterHit } from "./martialCounter";
import { effectiveMutationDef } from "./mutationCombat";
import { consumeNextAttackDamageDown } from "./paragonCombat";
import { statusBlockOnce } from "./signatureEffects";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import { consumePurificationWard, TRIPLE_WARD_LABELS } from "./tripleWard";
import { hasUnexploredEffect, recordUnexploredEnemySkillHits, unyieldingDamagePve } from "./unexploredSetPveAdapter";

// 레거시(턴제) PvE 루프의 페이즈 진입 훅. resolveBattleLegacy 가 플레이어/적 페이즈마다 1회 호출한다.
//   ATB 경로(engine.atb)는 applyEnemyV2SkillCast 를 쓰며, 버프 tick 시점이 달라 이 구현과 합치지 않는다.

// 플레이어 페이즈 진입 시 적이 건 DoT tick. DEF/보호막 무시. 쓰러지면 phase=ended·outcome=lose 로 반환.
// 일반 공격 레인과 섞이지 않도록 status_damage 효과 행으로 기록한다.
export function tickLegacyPlayerDotsAtPhaseStart(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const playerDotTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
  let playerDotDamage = statusDamageAfterReduction(
    playerDotTick.totalDmg,
    player.statusDamageReductionPct,
  );
  if (hasUnexploredEffect(player, "unyielding_dead")) {
    let hpBefore = state.playerHp;
    playerDotDamage = playerDotTick.ticks.reduce((sum, tick) => {
      const damage = statusDamageAfterReduction(unyieldingDamagePve({ ...state, playerHp: hpBefore }, player, tick.damage), player.statusDamageReductionPct);
      hpBefore = Math.max(0, hpBefore - damage);
      return sum + damage;
    }, 0);
  }
  if (playerDotDamage > 0) {
    recordCombatDotDamage(playerDotTick.ticks, "player", state.playerHp, playerDotDamage);
    const before = state.playerHp;
    const newHp = Math.max(0, before - playerDotDamage);
    const dotLog = distributeV2DotTicks(
      playerDotTick.ticks,
      playerDotDamage,
    ).reduce(
      (log, tick) =>
        appendLog(log, {
          kind: "info",
          effect: "status_damage",
          text: `${playerName}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
        }),
      state.log,
    );
    state = {
      ...state,
      playerV2Dots: playerDotTick.nextDots,
      log: dotLog,
    };
    const survival = applyBerserkerHostileDamage(
      state,
      player,
      newHp,
      "player",
    );
    state = survival.state;
    if (survival.triggered && state.berserker) {
      state = {
        ...state,
        berserker: finishBerserkerCurrentActionGuard(state.berserker),
      };
    }
    const dotEnduranceFires =
      state.playerHp <= 0 &&
      !!player.enduranceActive &&
      !state.flags.enduranceTriggered;
    if (dotEnduranceFires) {
      recordCombatMetric("survival_restoration", "endurance", "player", 1);
      state = {
        ...state,
        playerHp: 1,
        flags: { ...state.flags, enduranceTriggered: true },
        log: appendLog(state.log, {
          kind: "info",
          text: `[불굴] 마지막 한 숨! HP 1로 버텼다!`,
          turn: "player",
        }),
      };
    }
    if (state.playerHp <= 0) {
      state = {
        ...state,
        log: appendLog(state.log, {
          kind: "info",
          text: `플레이어가 쓰러졌다.`,
          turn: "player",
        }),
        outcome: "lose",
        phase: "ended",
      };
      return state;
    }
  } else {
    // 누적 데미지 0 (dot 비어있음) 라도 tick 결과 next 로 갱신.
    state = { ...state, playerV2Dots: playerDotTick.nextDots };
  }
  return state;
}

// 적 페이즈 진입 시 v2 스킬 시전(플레이어 cast hook 미러). monster.v2Skills 미지정이면 no-op.
// skillFired=true 면 이 적 페이즈 평타를 생략한다(스킬이 평타를 대체 — 더블어택 fix).
export function applyLegacyEnemyPhaseSkillCast(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; skillFired: boolean } {
  const tickedEnemySelfBuffs = tickV2BuffMap(state.enemyV2SelfBuffs);
  const tickedEnemyDebuffsLocal = tickV2BuffMap(state.enemyV2Debuffs);
  const tickedPlayerDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
  let result = resolveV2SkillCast({
    diagnosticActor: "enemy",
    skills: state.enemyV2Skills,
    cooldowns: state.enemyV2SkillCooldowns,
    procRoll: combatRandom() * 100,
    procChanceBonus:
      state.stacks.enemySkillProcDownTurns > 0
        ? -state.stacks.enemySkillProcDownPct
        : 0,
    // 속성 양방향(2026-06-20): 몹→플레이어 스킬도 방어 상성 적용. adv/dis 생략 = elementDamageMult
    //   기본값(전역 V2_ELEMENT_ADV/DIS_PCT=25/15) 사용 — 몹 평타(enemyPhase enemyElemMult)와 일관.
    //   내가 몹 속성에 강하면 몹 스킬 피해 감소, 약하면 증가. 🔑 #881 로 몹 더블어택(스킬+평타) 수정
    //   완료(스킬 시전 턴엔 평타 생략) → 한 턴 1회 공격이라 스킬+평타 이중 곱 없음(옛 0/0 제약 해소).
    //   무속성 매치업=×1(기존 전투 byte-identical).
    attacker: {
      mp: state.enemyMp,
      atk: state.enemy.atk,
      maxHp: state.enemy.hp, // monster.hp = max hp (정적)
      // PR2-B — 상대 caster(Monster 타입)는 def/현재HP/maxMp 만(vit/차수 없음 → 기본값 안전).
      def: state.enemy.def,
      currentHp: state.enemyHp,
      maxMp: state.enemyMaxMp,
      selfBuffs: tickedEnemySelfBuffs,
      selfDebuffs: tickedEnemyDebuffsLocal,
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
      selfDebuffs: tickedPlayerDebuffs,
      // PR2-B — 상대(플레이어)의 처단/스택 payoff 대상 = 시전자 player.
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      bleedStacks: state.playerV2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
      poisonStacks: state.playerV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
    },
  });
  if (result.castSkillId && result.castSkillName) {
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
  let nextPlayerHp = state.playerHp;
  const hpBeforeEnemySkill = state.playerHp;
  let nextEnemyHp = state.enemyHp;
  let nextLog = state.log;
  // 스킬이 실제 발동(castSkillId)했으면 이 enemy 페이즈 평타 생략 — 스킬이 평타를 대체(플레이어
  //   대칭). resolveEnemyPhase 가 skipEnemyBasicAttack 으로 받아 데미지/회피/반사 스킵. 더블어택 fix.
  const skillFired = result.castSkillId != null;
  const guaranteedEvade = evadeIncomingEnemySkill(state, player, result);
  state = guaranteedEvade.state;
  result = guaranteedEvade.result;
  if (state.phase === "ended") {
    state = {
      ...state,
      enemyMp: result.nextMp,
      enemyV2SkillCooldowns: result.nextCooldowns,
    };
    return { state, skillFired };
  }
  const legacyFortressReaction = resolveFortressReaction({
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
  // 구조화된 시전 경계와 별개로 damage/heal 로그에도 스킬명을 포함한다.
  // 적의 v2 damage 는 일반 적 공격과 같은 enemy_attack kind 로 통일.
  const resolvedEnemySkill = resolveIncomingEnemySkillWithBarrier(
    state,
    player,
    result,
  );
  const mitigation = resolvedEnemySkill.mitigation;
  nextLog = appendEnemySkillMitigationLogs(nextLog, mitigation);
  const enemySkillMagicBarrier = resolvedEnemySkill.barrier;
  const enemySkillShieldBefore = state.stacks.playerShield;
  const enemySkillShieldAbsorbed = Math.min(
    enemySkillShieldBefore,
    enemySkillMagicBarrier.hpBoundDamage,
  );
  let enemySkillDamageToHp: number;
  [state, nextLog, enemySkillDamageToHp] = deferPainPveSkill(state, result.hitDamages.length ? result.hitDamages : [result.enemyDamage], enemySkillMagicBarrier.hpBoundDamage, state.stacks.playerShield, nextLog);
  const enemySkillAfterShield = enemySkillDamageToHp;
  const nextPlayerShield =
    enemySkillShieldBefore - enemySkillShieldAbsorbed;
  const legacyEnemySkillReflection = resolveEnemySkillReflection(
    state,
    player,
    result,
    mitigation,
    enemySkillDamageToHp,
    enemySkillShieldAbsorbed,
    legacyFortressReaction,
  );
  const legacyReactiveDefenseCharges = consumeReactiveDefenseCharges(
    {
      evasion: state.stacks.skillEvasionTurns,
      damageReduction: state.stacks.skillDmgReduceTurns,
      reflect: state.stacks.skillReflectBoostTurns,
    },
    {
      evasionUsed:
        result.enemyDamage > 0 && state.stacks.skillEvasionTurns > 0,
      landed: result.enemyDamage > 0,
      reflectEligible: legacyEnemySkillReflection.genericReflectEligible,
    },
  );
  if (result.enemyDamage > 0 && result.castSkillName) {
    recordCombatDamage(result.castSkillId ?? "enemy_skill", "player", nextPlayerHp, enemySkillDamageToHp, enemySkillShieldAbsorbed + enemySkillMagicBarrier.absorbedDamage);
    if (enemySkillShieldAbsorbed > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[철벽] 보호막이 ${enemySkillShieldAbsorbed} 흡수 (남은 ${nextPlayerShield})`,
        turn: "enemy",
      });
    }
    for (const entry of magicBarrierCombatLogEntries(enemySkillMagicBarrier)) {
      nextLog = appendLog(nextLog, { ...entry, turn: "enemy" });
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
  if (legacyFortressReaction.impact > state.stacks.fortressImpact) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[충격 방벽] 충격 +1 (현재 ${legacyFortressReaction.impact}/3)`,
      turn: "enemy",
    });
  }
  if (legacyEnemySkillReflection.damage > 0) {
    recordCombatDamage("reflect", "enemy", nextEnemyHp, legacyEnemySkillReflection.damage);
    nextEnemyHp = Math.max(
      0,
      nextEnemyHp - legacyEnemySkillReflection.damage,
    );
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${legacyEnemySkillReflection.labels.join(" + ")}] ${state.enemy.name}에게 ${legacyEnemySkillReflection.damage} 반사 피해.`,
      turn: "enemy",
    });
  }
  if (legacyFortressReaction.ironWallReflected) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[철벽 태세] 철벽 반사 ${legacyFortressReaction.ironWallReflectCharges}회 남음`,
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
      text: `[불굴] 마지막 한 숨! HP 1로 버텼다!`,
      turn: "enemy",
    });
  }
  // 적의 self heal — enemy_attack kind (적 측 행동). 화상(enemyHealReduce)이 있으면 회복 감소.
  //   디버프 없으면(0) Math.floor 미적용 → byte-identical. (라이브 ATB 는 적 cast 미발동이라 inert)
  if (
    nextEnemyHp > 0 &&
    result.selfHeal > 0 &&
    result.castSkillName
  ) {
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
  // PR2-B 사혈격(상대 시전) — 상대 HP 소모(자살 방지 최소 1).
  if (nextEnemyHp > 0 && result.selfHpCost > 0) {
    nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
  }
  const nextEnemySelfBuffs = applyV2BuffsToMap(tickedEnemySelfBuffs, result.selfBuffsToApply);
  // 적대 상태는 장비 1회 방어를 먼저, 그 다음 정화결계를 소비한다.
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
  // enemyDebuff effect (적이 player 에 거는 약화) → state.v2SelfDebuffs 갱신.
  const nextPlayerDebuffs = blockHostileStatus
    ? tickedPlayerDebuffs
    : applyV2BuffsToMap(tickedPlayerDebuffs, result.enemyDebuffsToApply);
  // PR-8 — enemy cast 의 dot 결과 → state.playerV2Dots 박힘 (target=player).
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
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (${d.turns}행동)`,
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
    canMartialCounterHit(player, enemySkillDamageToHp, enemySkillShieldAbsorbed, enemySkillMagicBarrier.absorbedDamage) && result.castSkillName
      ? applyPassiveCounterOnHitIfAny(
          {
            ...state,
            stacks: { ...state.stacks, fortressImpact: legacyFortressReaction.impact },
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
  state = {
    ...state,
    playerHp: nextPlayerHp,
    playerMagicBarrier: enemySkillMagicBarrier.durabilityLeft,
    enemyHp: nextEnemyHp,
    enemyMp: result.nextMp,
    enemyV2SkillCooldowns: result.nextCooldowns,
    enemyV2SelfBuffs: nextEnemySelfBuffs,
    enemyV2Debuffs: tickedEnemyDebuffsLocal,
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
      skillEvasionTurns: legacyReactiveDefenseCharges.evasion,
      skillDmgReduceTurns:
        legacyReactiveDefenseCharges.damageReduction,
      skillReflectBoostTurns: legacyReactiveDefenseCharges.reflect,
      ...(countered?.stacks.dreadnought ? { dreadnought: countered.stacks.dreadnought } : {}),
      fortressImpact: countered?.stacks.fortressImpact ?? legacyFortressReaction.impact,
      ironWallReflectCharges:
        legacyFortressReaction.ironWallReflectCharges,
    },
    log: nextLog,
  };
  state = applyTrackedSetShieldAbsorptionPve(
    state,
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
  state = recordUnexploredEnemySkillHits(state, player, skillHits, actualEnemySkillHpDamage);
  if (
    state.stacks.tier6Uniques &&
    enemySkillShieldBefore > 0 &&
    nextPlayerShield <= 0 &&
    enemySkillShieldAbsorbed > 0
  ) {
    state = applyTier6UniquePveEvent(state, player, {
      kind: "shield_broken",
      shieldBefore: enemySkillShieldBefore,
      overflowDamage: enemySkillAfterShield,
      maxHp: state.playerMaxHp,
      origin: {
        actionId: state.turn.enemyPhasesCompleted + 1,
        eventId: state.log.length,
      },
    });
  }
  if (state.stacks.tier6Uniques) {
    state = applyTier6UniquePveEvent(state, player, {
      kind: "hp_threshold",
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      origin: {
        actionId: state.turn.enemyPhasesCompleted + 1,
        eventId: state.log.length,
      },
    });
  }
  // lethal — enemy v2 damage 로 player 사망 시 outcome=lose.
  if (countered?.phase === "ended") {
    state = {
      ...state,
      phase: "ended",
      outcome: countered.outcome,
    };
    return { state, skillFired };
  }
  if (state.playerHp <= 0) {
    state = {
      ...state,
      log: appendLog(state.log, {
        kind: "info",
        text: `플레이어가 쓰러졌다.`,
        turn: "enemy",
      }),
      outcome: "lose",
      phase: "ended",
    };
    return { state, skillFired };
  }
  if (state.enemyHp <= 0) {
    state = {
      ...state,
      enemyHp: 0,
      log: appendLog(state.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        turn: "enemy",
      }),
      outcome: "win",
      phase: "ended",
    };
    return { state, skillFired };
  }
  if (state.berserker) {
    state = {
      ...state,
      berserker: finishBerserkerCurrentActionGuard(state.berserker),
    };
  }
  return { state, skillFired };
}
