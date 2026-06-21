import {
  actorKeys,
  applyOnHitReflect,
  applyPerAttackDodge,
  applyPotionTo,
  applyPvPOnHitDots,
  applyShadowStepDodge,
  attackerFacingDef,
  decrementTimedEffects,
  endAttackerPhase,
  maybeApplyRuneCounter,
  maybeApplyMartialCounter,
  rollPvPAttackCount,
  setSide,
  type PvPAttackDamageResult,
  type PvPBattleState,
  type PvPSide,
  type PvPSideBuffs,
} from "./engine-pvp";
import {
  extractApEffect,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import {
  appendLog,
  damageBetween,
  type EquippedAPSkill,
  type PlayerAction,
} from "./engine";
import {
  elementDamageMult,
  V2_ELEMENT_ADV_PCT_PVP,
  V2_ELEMENT_DIS_PCT_PVP,
} from "@/adventure/data/v2/elements";
import {
  applyDefIgnore,
  computeAfterCrush,
  computeBalanceCritBonus,
  computeBerserkBonus,
  computeCritOverflowBonus,
  computeStormBonus,
} from "./engine.damageHelpers";
import {
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import {
  CRIT_MULT_BASE,
  ETERNAL_GALE_ABSOLUTE_CAP,
  GALE_CHAIN_MAX_PER_TURN,
  HEAVEN_DECREE_HP_PCT,
  IMPACT_WAVE_INTERVAL,
  LUCKY_STAR_DAMAGE_MULT,
  POWER_ATTACK_TURN_INTERVAL,
  attackMissPct,
} from "@/adventure/data/v2/v2CombatConstants";

// 평타 1회 데미지 캐스케이드 (engine.ts computeAttackDamage 의 PvP 미러).
// 암살/분쇄/방어관통 → ATK 보너스 → 크리 → 베이스뎀 → 처형·크리·행운별·암살 배수 →
// 천명·충돌파·폭풍·속박 합산까지. 모든 경로가 값 계산이며 동작은 인라인 시절과 1비트도 다르지
// 않다(combatGolden PvP 매트릭스 가드). 방어자 측 데미지 감산·로그·DoT 는 호출부에 남는다.
function computeAttackDamagePvP(
  attacker: PvPSide,
  defender: PvPSide,
  powerBonus: number,
  isFirstAttackOfTurn: boolean,
  turnNumber: number,
  nextBuffsTimedFromAp: PvPSide["buffs"],
  apMultEffect: Parameters<typeof extractApEffect>[0],
  apAtkMult: number,
  apHits: number,
  apIgnoresDef: boolean,
): PvPAttackDamageResult {
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
  const afterCrush = computeAfterCrush(baseDef, powerBonus, crushReduction);
  const targetDef = applyDefIgnore(
    afterCrush,
    assassinFires || weakpointDefIgnore || apIgnoresDef,
  );

  // 광전사 (특기) — 잃은 HP 비율만큼 ATK 가산.
  const berserkBonus = computeBerserkBonus(
    attacker.player.atk,
    attacker.hp,
    attacker.maxHp,
    attacker.player.berserkAtkPctPerLostHpPct,
  );
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
  const balanceCritBonus = computeBalanceCritBonus(
    effectiveAtkSpd,
    effectiveDefSpd,
    attacker.player.balanceCritPctPerSpdDiff,
  );
  const universalLuckBonus = attacker.player.universalLuckBonusPct ?? 0;
  // PR2-B 연환집중 — 치명률 temp 버프(%p).
  const skillCritThisTurn =
    attacker.stacks.skillCritTurns > 0 ? attacker.stacks.skillCritPct : 0;
  // 크리 확률 CRIT_PCT_CAP 캡 + 초과분 → 크리뎀 변환 (PvE 와 대칭, engine.ts 동일 패턴).
  const rawCritPct =
    baseCritPct +
    luckCritBonus +
    balanceCritBonus +
    universalLuckBonus +
    cyclingChiThisTurn +
    skillCritThisTurn;
  // PR-2 — 피격자(defender)의 치명타 저항(정신)만큼 공격자 크리 확률 차감. PvE 몹은 크리 없어 PvP 한정.
  const effectiveCritPct = Math.max(
    0,
    Math.min(CRIT_PCT_CAP, rawCritPct) - (defender.player.critResistPct ?? 0),
  );
  const critOverflowDmgBonus = computeCritOverflowBonus(rawCritPct);
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
  const baseDmgSingleHitRaw = damageBetween(atkForDmg, v2EffectiveTargetDef);
  // 속성 방어 상성(2026-06-20 양방향) — PvP 평타도 공격자속성 vs 방어자속성 배수(PvP 계수 15/15).
  //   PvP 스킬은 이미 combatShared 가 처리 → 평타만 신설. 무속성=×1(가드 스킵·골든 byte-identical).
  const pvpElemMult = elementDamageMult(
    attacker.player.characterElement ?? "neutral",
    defender.player.characterElement ?? "neutral",
    V2_ELEMENT_ADV_PCT_PVP,
    V2_ELEMENT_DIS_PCT_PVP,
  );
  const baseDmgSingleHit =
    pvpElemMult !== 1
      ? Math.max(1, Math.floor(baseDmgSingleHitRaw * pvpElemMult))
      : baseDmgSingleHitRaw;
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
  const stormBonus = computeStormBonus(attacker.player.atk, apMultEffect);
  const totalDmgBeforeVuln = dmg + decreeDmg + impactDmg + stormBonus;
  // PR2-B 속박 — 시전자(attacker)가 속박 활성 시 가하는 피해 +%. 모든 평타 배수 끝 마지막 곱(PvE 미러).
  const totalDmg =
    attacker.stacks.enemyVulnTurns > 0
      ? Math.max(
          1,
          Math.floor(totalDmgBeforeVuln * (1 + attacker.stacks.enemyVulnPct / 100)),
        )
      : totalDmgBeforeVuln;
  return {
    assassinFires, critRoll, crushReduction, cyclingChiThisTurn, decreeFires, dmg, enduringStrikeBonus, executionActive, fatedChainConsumed, focusedBreathConsumed, impactFires, luckyStarFires, totalDmg, weakpointDefIgnore,
  };
}

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
      attacksLeft: rollPvPAttackCount(a, st[defKey]),
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
  // AP 스킬은 v2 미장착(equippedAPSkills 항상 빈값) — 발동 경로 제거, no-op 상수로 통과.
  const apSel: {
    offensive: EquippedAPSkill | null;
    utilities: EquippedAPSkill[];
    totalCost: number;
  } = { offensive: null, utilities: [], totalCost: 0 };
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
    const nextSt = setSide(
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
    // 이중 행운 — 방어자 활성 시 회피 +bonus. 만물 행운 / 회전 운기도 회피레이팅에 합산.
    const luckEvadeBonus = defender.flags.luckyBuffActive
      ? defender.player.doubleLuck?.evade ?? 0
      : 0;
    const universalLuckEvadeBonus = defender.player.universalLuckBonusPct ?? 0;
    // PR2-B 선풍각 — 회피 temp 버프. PvP 는 회피가 유효축이라 실제 작동.
    const skillEvadeBonus =
      defender.stacks.skillEvasionTurns > 0 ? defender.stacks.skillEvasionPct : 0;
    // 회피 대결형 Slice 2(B안) — 미스 = 베이스미스(플랫) + dodgeChance(방어자 회피레이팅, 공격자 명중레이팅).
    //   정밀(precisionMult)은 base 회피레이팅에만 곱하고 버프는 가산. 무적 회피탱은 점근선 DODGE_MAX 로 완화.
    const defenderEvaR = Math.max(
      0,
      (defender.player.evaRating ?? defender.player.evasionPct ?? 0) * precisionMult +
        luckEvadeBonus +
        universalLuckEvadeBonus +
        defender.buffs.cyclingChiBonus +
        skillEvadeBonus,
    );
    const attackerAccR = attacker.player.accRating ?? attacker.player.accuracyPct ?? 0;
    const missPct = attackMissPct(defenderEvaR, attackerAccR);
    if (Math.random() * 100 < missPct) {
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
  const nextBuffsTimedFromAp = attacker.buffs;

  const { assassinFires, critRoll, crushReduction, cyclingChiThisTurn, decreeFires, dmg, enduringStrikeBonus, executionActive, fatedChainConsumed, focusedBreathConsumed, impactFires, luckyStarFires, totalDmg, weakpointDefIgnore } = computeAttackDamagePvP(
    attacker,
    defender,
    powerBonus,
    isFirstAttackOfTurn,
    turnNumber,
    nextBuffsTimedFromAp,
    apMultEffect,
    apAtkMult,
    apHits,
    apIgnoresDef,
  );
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
  // 별빛 인내(enchant endure) — 받는 피해 -pct%. 결의 다음·가드 전 곱연산, 항상 활성, 최소 1.
  //   PvE(enemyPhase)에선 적용되나 PvP 에선 inert 였던 걸 미러(2026-06-19, full mirror).
  const endurePct = defender.player.enchantEndurePct ?? 0;
  const enduredDmg =
    endurePct > 0
      ? Math.max(1, Math.floor(dmgAfterResolve * (1 - endurePct / 100)))
      : dmgAfterResolve;
  const endureApplied = enduredDmg < dmgAfterResolve;
  // 받피감(패시브 passiveDamageTakenReductionPct·철벽검류 등) — 인내 다음·가드 전 곱연산, 최소 1.
  //   PvE 전용이던 걸 미러(2026-06-19). 철포 버프(skillDmgReduce)는 별개로 미포함(여기선 패시브만).
  const passiveReducePct = defender.player.passiveDamageTakenReductionPct ?? 0;
  const passiveReduced =
    passiveReducePct > 0
      ? Math.max(1, Math.floor(enduredDmg * (1 - passiveReducePct / 100)))
      : enduredDmg;
  const passiveReduceApplied = passiveReduced < enduredDmg;
  const guard = defender.player.guard;
  const guarded =
    guard && guard.turns > 0 && defender.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, passiveReduced - guard.reduction)
      : passiveReduced;
  const guardApplied = guarded < passiveReduced;
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
  if (endureApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[인내] ${defender.name} 피해 -${dmgAfterResolve - enduredDmg}`,
    });
  }
  if (passiveReduceApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[받피감] ${defender.name} 피해 -${enduredDmg - passiveReduced}`,
    });
  }
  if (guardApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[가드] ${defender.name} 피해 -${passiveReduced - guarded}`,
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
  // 별빛 흡혈(enchant lifesteal) + 포식 패시브(둘 다 enchantLifestealPct 로 합류) — 가한 피해의 pct%
  //   HP 회복. PvE(playerPhase)에선 항상 소비되나 PvP 에선 inert 였던 걸 미러(2026-06-19, full mirror).
  const enchantLifestealHeal =
    (attacker.player.enchantLifestealPct ?? 0) > 0
      ? Math.floor((dmg * attacker.player.enchantLifestealPct!) / 100)
      : 0;
  const totalLifestealHeal =
    lifestealHeal +
    luckyLifestealHeal +
    runeLifestealHeal +
    apLifestealHeal +
    enchantLifestealHeal;
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
    if (enchantLifestealHeal > 0) lsLabels.push("별빛 흡혈");
    log = appendLog(log, {
      kind: "info",
      text: `[${lsLabels.join(" + ")}] ${attacker.name}의 HP +${actualLifesteal}`,
    });
  }
  // 출혈/중독 — 적중 시 defender.v2Dots 에 tagged DoT 로 누적.
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
  // 지속 효과 (PR-2 미러).
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
  const newDefender: PvPSide = applyPvPOnHitDots({
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
  }, attacker, { bleedStacks: apBleedAdd });
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
  // ── 무도가/절정 반격 패시브 — 피격 후 일정 확률로 ATK 카운터(PvE enemyPhase 미러) ──
  const martialCounterResult = maybeApplyMartialCounter(next, atkKey, defKey);
  next = martialCounterResult.state;
  if (martialCounterResult.attackerKilled) return next;
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
