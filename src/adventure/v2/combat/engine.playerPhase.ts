import {
  BOSS_PCT_HP_DAMAGE_MULT,
  COMBO_FINISHER_PERIOD,
  NORMAL_MONSTER_EXECUTION_HP_FRACTION,
  appendLog,
  applyPhaseTriggerIfAny,
  applyPlayerOnHitDots,
  applyPotionEffect,
  finishPlayerTurn,
  playerFacingEnemyDef,
  rollPlayerAttackCountWithBleed,
  type BattleState,
  type EquippedAPSkill,
  type PlayerAction,
  type PlayerCombat,
} from "./engine";
import {
  applyDefIgnore,
  computeAfterCrush,
  computeBalanceCritBonus,
  computeBerserkBonus,
  computeCritOverflowBonus,
  computeStormBonus,
} from "./engine.damageHelpers";
import {
  applyV2DotsToTarget,
  damageBetween,
  extractApEffect,
  makePoisonDot,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import {
  everyNHitsValue,
  firesOnCritPoison,
  onCritEnemyChill,
  onCritSpeedBuff,
  SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
} from "./signatureEffects";
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

type AttackDamageResult = {
  assassinFires: boolean;
  breakerActive: boolean;
  critRoll: boolean;
  crushReduction: number;
  cyclingChiThisTurn: number;
  decreeFires: boolean;
  dmg: number;
  enchantBerserkActive: boolean;
  enchantExeActive: boolean;
  enduringStrikeBonus: number;
  executionActive: boolean;
  fatedChainConsumed: boolean;
  focusedBreathConsumed: boolean;
  impactFires: boolean;
  luckyStarFires: boolean;
  nextComboAtkBonus: number;
  nextComboHitCount: number;
  totalDmg: number;
  weakpointDefIgnore: boolean;
};

function computeAttackDamage(
  state: BattleState,
  player: PlayerCombat,
  bonus: number,
  isFirstAttackOfTurn: boolean,
  turnNumber: number,
  nextBuffsTimed: BattleState["buffs"],
  apMultEffect: Parameters<typeof extractApEffect>[0],
  apAtkMult: number,
  apHits: number,
  apIgnoresDef: boolean,
): AttackDamageResult {
  // 암살 (특기) — 전투 첫 공격이면 발동: 적 DEF 무시 + 데미지 배수 (배수는 아래에서 적용).
  const assassinFires =
    (player.assassinateDmgMult ?? 0) > 1 &&
    !state.flags.assassinateUsed &&
    state.turn.completedPlayerTurns === 0 &&
    isFirstAttackOfTurn;
  // 약점 적중 (2티어 특기) — 큐가 있으면 이 공격은 적 DEF 일부 관통. 트리거 자체는 아래 크리 처리 후.
  const weakpointDefIgnore = state.stacks.weakpointDefIgnoreLeft > 0;
  // 분쇄 — 강공격 발동 턴, 그 공격에 한해 적 DEF -crushDefReduction (분쇄 먼저 적용).
  // baseDef 는 보스 취약(armorVulnerable) + 정확(armorPierceFraction) 비례 관통이 이미 반영된 값.
  // 2026-05-23: 암살/약점/AP 의 방어 관통은 완전 무시(0)가 아니라 DEF_IGNORE_FRACTION(30%)만 무시.
  // 분쇄(고정 감산) 후 30% 관통을 곱연산으로 적용 — 방어 투자가 70% 는 항상 유효.
  const crushReduction = player.crushDefReduction ?? 0;
  const baseDef = playerFacingEnemyDef(state, player, nextBuffsTimed);
  const afterCrush = computeAfterCrush(baseDef, bonus, crushReduction);
  const afterIgnore = applyDefIgnore(
    afterCrush,
    assassinFires || weakpointDefIgnore || apIgnoresDef,
  );
  // 궁수 패시브 — 평타 방어 관통(%). 위 30% 무시 레이어 뒤에 곱연산(방어 투자가 항상 일부 유효).
  const archerPenPct = player.passiveDefPenetrationPct ?? 0;
  const targetDef =
    archerPenPct > 0
      ? Math.round(afterIgnore * (1 - archerPenPct / 100))
      : afterIgnore;
  // 광전사 (특기) — 잃은 HP 비율만큼 ATK 가산.
  // berserkAtkPctPerLostHpPct=0.5 → 잃은 HP 1%당 ATK +0.5% → 보너스ATK = atk × lostFraction × 0.5.
  const berserkBonus = computeBerserkBonus(
    player.atk,
    state.playerHp,
    state.playerMaxHp,
    player.berserkAtkPctPerLostHpPct,
  );
  // 별빛 폭주(enchant berserk) — 자신 HP 30% 이하일 때 atk +pct%. 단계형 (광전사 특기와
  // 별개 누적).
  const enchantBerserkPct = player.enchantBerserkBonusPct ?? 0;
  const enchantBerserkActive =
    enchantBerserkPct > 0 && state.playerHp / state.playerMaxHp <= 0.3;
  const enchantBerserkBonus = enchantBerserkActive
    ? Math.floor((player.atk * enchantBerserkPct) / 100)
    : 0;
  // 질풍검 (특기) — 턴 첫 공격에 (그 턴 공격 횟수 × N) ATK 보너스.
  const gustBonus =
    (player.gustAtkPerAttack ?? 0) > 0 && isFirstAttackOfTurn
      ? state.playerAttacksLeft * player.gustAtkPerAttack!
      : 0;
  // 불굴의 일격 (2티어 특기) — 본타(턴 첫 공격) 에만 (이번 전투 누적 받은 피해 × N) 추가.
  const enduringStrikeBonus =
    (player.enduringStrikeMult ?? 0) > 0 && isFirstAttackOfTurn
      ? Math.floor(state.stacks.damageTakenThisCombat * player.enduringStrikeMult!)
      : 0;
  // 회전 운기 (2티어 특기) — 매 플레이어 턴 시작 시 +cyclingChiPerTurn(%) 누적. 그 턴 즉시 적용.
  const cyclingChiThisTurn =
    state.buffs.cyclingChiBonus +
    (isFirstAttackOfTurn ? player.cyclingChiPerTurn ?? 0 : 0);
  // 크리티컬 — 매 공격마다 critChancePct 확률로 발동. 이중 행운 발동 후엔 +crit 보너스.
  const baseCritPct =
    (player.critChancePct ?? 0) +
    // PR2-B-2c 연환집중 — 치명률 temp 버프.
    (state.stacks.skillCritTurns > 0 ? state.stacks.skillCritPct : 0);
  const luckCritBonus = state.flags.luckyBuffActive
    ? player.doubleLuck?.crit ?? 0
    : 0;
  // 천칭 — 내 SPD 가 적보다 빠른 만큼 크리티컬 확률 가산.
  // SPD 버프/디버프 (폭주/둔화) 가 활성이면 곱연산으로 반영.
  const effectivePlayerSpd =
    nextBuffsTimed.playerSpdTurnsLeft > 0
      ? player.spd * nextBuffsTimed.playerSpdMult
      : player.spd;
  const effectiveEnemySpd =
    nextBuffsTimed.enemySpdTurnsLeft > 0
      ? state.enemy.spd * nextBuffsTimed.enemySpdMult
      : state.enemy.spd;
  const balanceCritBonus = computeBalanceCritBonus(
    effectivePlayerSpd,
    effectiveEnemySpd,
    player.balanceCritPctPerSpdDiff,
  );
  // 만물 행운 (6티어) — 크리티컬 확률 +N%.
  const universalLuckBonus = player.universalLuckBonusPct ?? 0;
  // 크리 확률은 CRIT_PCT_CAP(75%) 캡. 초과분은 크리 데미지로 자동 변환 — 캡 도달 후에도
  // LUK 투자 의미를 유지(빌드 수렴 방지, 회피 오버플로와 대칭).
  const rawCritPct =
    baseCritPct + luckCritBonus + balanceCritBonus + universalLuckBonus + cyclingChiThisTurn;
  const effectiveCritPct = Math.min(CRIT_PCT_CAP, rawCritPct);
  const critOverflowDmgBonus = computeCritOverflowBonus(rawCritPct);
  // 연쇄 운명 (2티어 특기) — 큐가 있으면 이 공격 크리 강제. 큐는 아래에서 소비.
  const fatedChainConsumed = state.flags.fatedChainCritPending;
  // 집중의 호흡 (AP) — 큐가 있으면 이 공격 크리 강제 + 크리뎀 보너스. 1회 소비.
  // 발동 attack 자체는 fire 후에 셋팅돼서 그 다음 공격부터 적용 (자연스럽게 분리).
  const focusedBreathConsumed = state.turn.focusedBreathCritDmgBonusPct > 0;
  const focusedBreathCritDmgBonus =
    focusedBreathConsumed
      ? state.turn.focusedBreathCritDmgBonusPct / 100
      : 0;
  const critRoll =
    fatedChainConsumed || focusedBreathConsumed
      ? true
      : effectiveCritPct > 0
        ? Math.random() * 100 < effectiveCritPct
        : false;
  // AP 스킬의 atk_multiplier 는 모든 ATK 합산 후 곱 (강공격·격노·질풍 등의 보너스 포함).
  // 광기 (AP) — 자신 ATK +pct%. atk_multiplier 적용 전에 같이 합산.
  const madnessAtkBonus =
    nextBuffsTimed.playerAtkBuffTurnsLeft > 0 && nextBuffsTimed.playerAtkBuffPct > 0
      ? Math.floor((player.atk * nextBuffsTimed.playerAtkBuffPct) / 100)
      : 0;
  // 명시적 마법 평타 훅 — 평타를 마법공격력 기반으로 전환. PvE 적(몬스터)은 magicDef 가 없어
  // targetDef(물방)로 경감된다(의도 — "마공 vs 물방"). PvP(아레나)는 engine-pvp 별도.
  const basicAttackPower = player.passiveMagicBasicAttack
    ? (player.magicAtk ?? player.atk)
    : player.atk;
  const atkBeforeApMult =
    basicAttackPower +
    state.buffs.rampageAtkBonus +
    bonus +
    berserkBonus +
    enchantBerserkBonus +
    gustBonus +
    enduringStrikeBonus +
    madnessAtkBonus +
    // 연격세 (연환 시그니처) — 전투 내 누적 ATK 보너스. 미보유면 0 → 무변.
    state.stacks.comboAtkBonus;
  // PR-5a: v2 buff/debuff 격리 해제 — 일반 공격 damage 에도 atk 곱셈으로 반영.
  // attacker 의 v2 self buff (str/dex/spd/luk) 합산, target 의 v2 vit debuff/buff 가 def 곱셈.
  const v2AtkMultPlayer = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMultEnemy = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const v2EffectiveAtk = v2AtkMultPlayer !== 1 ? Math.floor(atkBeforeApMult * v2AtkMultPlayer) : atkBeforeApMult;
  const v2EffectiveTargetDef = v2DefMultEnemy !== 1 ? Math.floor(targetDef * v2DefMultEnemy) : targetDef;
  const baseDmgSingleHit = damageBetween(
    apAtkMult !== 1 ? Math.floor(v2EffectiveAtk * apAtkMult) : v2EffectiveAtk,
    v2EffectiveTargetDef,
  );
  // 광살참 (AP) — 같은 fire 에서 hits 번 반복 데미지. apHits=1 이면 baseDmgSingleHit 그대로.
  const baseDmg = apHits > 1 ? baseDmgSingleHit * apHits : baseDmgSingleHit;
  // 폭풍 일격 (AP) — fire 시 (player.atk × spdPct/100) 추가 고정 데미지. targetDef 무시.
  const stormBonus = computeStormBonus(player.atk, apMultEffect);
  // 처형 — 적 HP 비율 < executionHpFraction 일 때 데미지 ×executionDamageMult.
  // 강공격/분쇄 후 데미지에 곱하고, 크리티컬은 그 위에 다시 곱한다 (다단 누적).
  const exMult = player.executionDamageMult ?? 1;
  const exFraction = player.executionHpFraction ?? 0;
  const effectiveExFraction =
    state.isBoss === true
      ? exFraction
      : Math.max(exFraction, NORMAL_MONSTER_EXECUTION_HP_FRACTION);
  const enemyMaxHp = state.enemy.hp;
  const executionActive =
    exMult > 1 &&
    exFraction > 0 &&
    state.enemyHp / enemyMaxHp < effectiveExFraction;
  const dmgAfterExecution = executionActive
    ? Math.max(1, Math.floor(baseDmg * exMult))
    : baseDmg;
  // 별빛 처형(enchant execute) — 적 HP 25% 이하일 때 추가 피해(%). 기존 처형 위에 곱연산.
  const enchantExePct = player.enchantExecuteBonusPct ?? 0;
  const enchantExeFraction =
    state.isBoss === true ? 0.25 : NORMAL_MONSTER_EXECUTION_HP_FRACTION;
  const enchantExeActive =
    enchantExePct > 0 && state.enemyHp / enemyMaxHp <= enchantExeFraction;
  const dmgAfterEnchantExe = enchantExeActive
    ? Math.max(1, Math.floor(dmgAfterExecution * (1 + enchantExePct / 100)))
    : dmgAfterExecution;
  // 집중의 호흡 (AP) — 그 1발 한정 critMult 에 +pct% 추가 (가산 후 한 번에 곱).
  // critOverflowDmgBonus — 크리 확률 캡 초과분이 변환된 크리뎀 보너스(stats.ts 참조).
  const critMult =
    (player.critMult ?? CRIT_MULT_BASE) +
    focusedBreathCritDmgBonus +
    critOverflowDmgBonus;
  const dmgAfterCrit = critRoll
    ? Math.floor(dmgAfterEnchantExe * critMult)
    : dmgAfterEnchantExe;
  // 행운의 별 (5티어) — 크리티컬과 별개, 발동 시 데미지 ×LUCKY_STAR_DAMAGE_MULT.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(dmgAfterCrit * LUCKY_STAR_DAMAGE_MULT)
    : dmgAfterCrit;
  // 암살 (특기) — 위 모든 배수(처형/크리/행운의 별) 후에 다시 ×N.
  const dmgBeforeBrace = assassinFires
    ? Math.floor(dmgAfterLuckyStar * player.assassinateDmgMult!)
    : dmgAfterLuckyStar;
  // 잡몹 스킬 "방어 태세" — 이 적을 공격할 때 데미지 -damageReduction (최소 1로 클램프).
  // 천뢰 일격 silence 활성 시 brace 도 비활성.
  const braceReduction =
    nextBuffsTimed.enemySilenceTurnsLeft <= 0 &&
    state.enemy.skill?.kind === "brace"
      ? state.enemy.skill.damageReduction
      : 0;
  const dmgAfterBrace =
    braceReduction > 0 ? Math.max(1, dmgBeforeBrace - braceReduction) : dmgBeforeBrace;
  // 별빛 파괴(enchant breaker) — 보스 적에게 가하는 피해 +pct%. 모든 배수 끝나고 마지막 곱연산.
  const breakerPct = player.enchantBreakerBossBonusPct ?? 0;
  const breakerActive = breakerPct > 0 && state.isBoss === true;
  const dmgAfterBreaker = breakerActive
    ? Math.max(1, Math.floor(dmgAfterBrace * (1 + breakerPct / 100)))
    : dmgAfterBrace;
  // 난사 (궁사 시그니처) — 그 턴 첫 타(본타)가 아닌 추가타에 한해 데미지 +extraHitDmgPct%.
  // 다단 히트(연사) 본체를 키우는 시그니처라 본타는 영향 없음. 모든 배수 뒤 마지막 곱.
  const extraHitPct = player.extraHitDmgPct ?? 0;
  const dmgAfterExtraHit =
    extraHitPct > 0 && !isFirstAttackOfTurn
      ? Math.max(1, Math.floor(dmgAfterBreaker * (1 + extraHitPct / 100)))
      : dmgAfterBreaker;
  // 절초 (연환 시그니처) — 누적 적중 COMBO_FINISHER_PERIOD 타째 본타에 마무리 강타 +%.
  // comboHitCount 는 이 적중이 적용되면 afterDamage 에서 +1 → (현재 count + 1) 이 이번 타 순번.
  const comboFinisherPct = player.comboFinisherBonusPct ?? 0;
  const comboFinisherFires =
    comboFinisherPct > 0 &&
    (state.stacks.comboHitCount + 1) % COMBO_FINISHER_PERIOD === 0;
  const dmgBeforeVuln = comboFinisherFires
    ? Math.max(1, Math.floor(dmgAfterExtraHit * (1 + comboFinisherPct / 100)))
    : dmgAfterExtraHit;
  // PR2-B-2c 속박 — 적 취약(받는 피해 +%). 모든 평타 배수 끝 마지막 곱.
  const dmg =
    state.stacks.enemyVulnTurns > 0
      ? Math.max(1, Math.floor(dmgBeforeVuln * (1 + state.stacks.enemyVulnPct / 100)))
      : dmgBeforeVuln;
  // 연격세 (연환 시그니처) — 이 적중으로 ATK 보너스 누적(상한 = 기본 ATK).
  const comboAtkPct = player.comboAtkPctPerHit ?? 0;
  const nextComboAtkBonus =
    comboAtkPct > 0
      ? Math.min(
          player.atk,
          state.stacks.comboAtkBonus +
            Math.floor((player.atk * comboAtkPct) / 100),
        )
      : state.stacks.comboAtkBonus;
  // 절초 — 적중 누적 카운트 +1(절초 보유 시에만 증가, 미보유는 0 고정).
  const nextComboHitCount =
    comboFinisherPct > 0
      ? state.stacks.comboHitCount + 1
      : state.stacks.comboHitCount;
  // 천명 (4티어) — 일정 확률로 적 현재 HP 의 일부를 추가 고정 피해 (이 공격의 보통 피해와 별개로 합산).
  // 보스 전투에는 BOSS_PCT_HP_DAMAGE_MULT 배 적용 (%HP 누진 폭딜 방지).
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < player.heavenDecreeChancePct!;
  const decreeBaseDmg = decreeFires
    ? Math.floor((state.enemyHp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const decreeDmg = state.isBoss
    ? Math.floor(decreeBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
    : decreeBaseDmg;
  // 충돌파 (6티어) — 매 IMPACT_WAVE_INTERVAL 턴마다 본타 첫 공격에 적 현재 HP 의 N% 추가 고정 피해.
  const impactPct = player.impactWaveHpPct ?? 0;
  const impactFires =
    impactPct > 0 &&
    isFirstAttackOfTurn &&
    turnNumber % IMPACT_WAVE_INTERVAL === 0;
  const impactBaseDmg = impactFires
    ? Math.floor((state.enemyHp * impactPct) / 100)
    : 0;
  const impactDmg = state.isBoss
    ? Math.floor(impactBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
    : impactBaseDmg;
  const totalDmg = dmg + decreeDmg + impactDmg + stormBonus;

  return {
    assassinFires,
    breakerActive,
    critRoll,
    crushReduction,
    cyclingChiThisTurn,
    decreeFires,
    dmg,
    enchantBerserkActive,
    enchantExeActive,
    enduringStrikeBonus,
    executionActive,
    fatedChainConsumed,
    focusedBreathConsumed,
    impactFires,
    luckyStarFires,
    nextComboAtkBonus,
    nextComboHitCount,
    totalDmg,
    weakpointDefIgnore,
  };
}

// 플레이어 페이즈 전체 — advanceTurn 에서 적 페이즈(resolveEnemyPhase)와 대칭으로 분리한다.
// 평타 1회 해상도: 포션 → 강공격/AP 선택 → 회피(미스) 판정 → 데미지 파이프라인(분쇄·처형·크리·
// 흡혈·천명·충돌파 등) → 적중 후 추가타 캐스케이드(연타·광속·풍사슬·연참) → finishPlayerTurn.
// state.phase === "player" 가드는 호출부(advanceTurn)에 남고 이 함수는 진입 직후 상태를 받는다.
// 모든 경로가 return 으로 끝나며 동작은 인라인 시절과 1비트도 다르지 않다(combatGolden 가드).
export function resolvePlayerPhase(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  action: PlayerAction,
): BattleState {
  if (action.kind === "use_potion") {
    const next = applyPotionEffect(state, action.potion, playerName);
    // 포션은 공격이 아니라 그 턴의 공격 "1회" 를 소모한다. 추가타 빌드(attackCount>1)는
    // 마신 뒤에도 남은 공격으로 계속 싸울 수 있고, 마지막 1회였다면 적 페이즈로 넘어간다.
    // (기본 1회 공격 캐릭터는 attacksLeft 가 0 이 되어 기존과 동일하게 턴이 끝난다.)
    // turn 플래그(firstAttackPending 등)는 그대로 둔다 — 포션은 공격이 아니므로 다음 실제
    // 공격이 여전히 그 턴의 첫 공격(강공격/AP 트리거)으로 취급된다.
    const attacksLeft = next.playerAttacksLeft - 1;
    if (attacksLeft > 0) {
      return { ...next, playerAttacksLeft: attacksLeft };
    }
    return {
      ...next,
      phase: "enemy",
      playerAttacksLeft: rollPlayerAttackCountWithBleed(next, player),
      turn: { ...next.turn, firstAttackPending: true },
    };
  }

  // 강공격 발동 — POWER_ATTACK_TURN_INTERVAL 턴마다 그 턴의 첫 공격이 ATK + bonus.
  // 진행 중인 턴 번호 = completedPlayerTurns + 1. 첫 공격 여부는 firstAttackPending 으로 판단
  // (확률 기반 추가 공격 / 기습 보너스로 attackCount 비교가 신뢰할 수 없음).
  const turnNumber = state.turn.completedPlayerTurns + 1;
  const isFirstAttackOfTurn = state.turn.firstAttackPending;
  const bonus =
    isFirstAttackOfTurn &&
    turnNumber % POWER_ATTACK_TURN_INTERVAL === 0 &&
    (player.powerAttackBonus ?? 0) > 0
      ? player.powerAttackBonus!
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
  // atk_multiplier 계열 효과 — 광살참(multi_hit_self_damage)과 천뢰 일격
  // (atk_multiplier_with_silence) 도 atkMult/ignoresDef/ignoresEvasion 을 공유.
  // apMultEffect 는 아래(atk_plus_spd_pct_bonus·multi_hit_self_damage 자해)에서도 쓰여 유지.
  // atkMult/ignoresDef/ignoresEvasion/hits 파생은 combatShared.extractApEffect 로 단일화
  // (PvP 엔진과 공유 — ignoresEvasion = true 면 적 회피 굴림 스킵, 광살참 hits = N 번 누적).
  const apMultEffect = apOffensiveSkill?.effect;
  const {
    atkMult: apAtkMult,
    ignoresDef: apIgnoresDef,
    ignoresEvasion: apIgnoresEvasion,
    hits: apHits,
  } = extractApEffect(apMultEffect);

  // 적 회피 — 데미지 굴리기 전에 1차 판정. 회피하면 공격 1회가 그대로 빗나간다.
  // 정확 슬롯 시 적 회피레이팅에 배수(<1) 가 곱해져 부분 무력화.
  // 회피 대결형 Slice 2(B안): 미스 = 베이스미스(플랫) + dodgeChance(몹 회피레이팅, 플레이어 명중레이팅).
  //   명중은 대결 항만 누르고 플랫 베이스미스는 못 깎는다. 일반몹(회피 0)은 미스=베이스(현 평타 느낌 보존).
  // AP 스킬의 ignoresEvasion = true 면 회피 판정 자체 스킵.
  const precisionMult = player.precisionEvasionMult ?? 1;
  // 실명(원소술사 빛) — 적 회피레이팅 차감. 디버프 없으면 0 → 회피 0 몹은 dodgeChance=0(byte-identical).
  const evaDown =
    state.stacks.enemyEvasionDownTurns > 0 ? state.stacks.enemyEvasionDownPct : 0;
  const enemyEvaRating =
    Math.max(0, (state.enemy.evasionPct ?? 0) - evaDown) * precisionMult;
  const playerAccRating = player.accRating ?? player.accuracyPct ?? 0;
  const missPct = attackMissPct(enemyEvaRating, playerAccRating);
  if (!apIgnoresEvasion && Math.random() * 100 < missPct) {
    const log = appendLog(state.log, {
      kind: "player_attack",
      text:
        enemyEvaRating > 0
          ? `${state.enemy.name}이(가) 공격을 피했다.`
          : "공격이 빗나갔다.",
    });
    const attacksLeft = state.playerAttacksLeft - 1;
    if (attacksLeft > 0) {
      return {
        ...state,
        log,
        playerAttacksLeft: attacksLeft,
        turn: { ...state.turn, firstAttackPending: false },
      };
    }
    const ended: BattleState = {
      ...state,
      log,
      phase: "enemy",
      playerAttacksLeft: rollPlayerAttackCountWithBleed(state, player),
      turn: {
        ...state.turn,
        completedPlayerTurns: state.turn.completedPlayerTurns + 1,
        doubleStrikeUsedThisTurn: false,
        lightspeedUsedThisTurn: false,
        critThisTurn: false,
        riposteUsedThisTurn: false,
        firstAttackPending: true,
        galeChainsThisTurn: 0,
        weakpointUsedThisTurn: false,
        fatedChainTriggeredThisTurn: false,
        // fatedChainCritPending 은 "다음 공격" 까지 살아 있어야 하므로 턴 경계에서 리셋 안 함.
      },
    };
    return finishPlayerTurn(ended, player, playerName);
  }

  // AP 스킬 시한부 버프 — 발동턴 damage calc 부터 효과 받도록 buffs 를 미리 갱신.
  // decrementTimedEffects 는 다음 플레이어 턴 진입 시 -1 → 발동턴 + (turns-1) 후속턴 = 총 turns 턴.
  // evasion 직후이라 — 회피된 공격에는 AP 가 발동 안 하니 그 분기는 위에서 이미 return 된 상태.
  const nextBuffsTimed = state.buffs;

  const { assassinFires, breakerActive, critRoll, crushReduction, cyclingChiThisTurn, decreeFires, dmg, enchantBerserkActive, enchantExeActive, enduringStrikeBonus, executionActive, fatedChainConsumed, focusedBreathConsumed, impactFires, luckyStarFires, nextComboAtkBonus, nextComboHitCount, totalDmg, weakpointDefIgnore } = computeAttackDamage(
    state,
    player,
    bonus,
    isFirstAttackOfTurn,
    turnNumber,
    nextBuffsTimed,
    apMultEffect,
    apAtkMult,
    apHits,
    apIgnoresDef,
  );
  const labels: string[] = [];
  if (bonus > 0) labels.push("강공격");
  if (bonus > 0 && crushReduction > 0) labels.push("분쇄");
  if (executionActive) labels.push("처형");
  if (enchantExeActive) labels.push("별빛 처형");
  if (enchantBerserkActive) labels.push("폭주");
  if (breakerActive) labels.push("파괴");
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
  // 항상 "공격! " 접두 → 라벨(크리티컬·강공격 등)은 [..] 인라인(스킬 "마탄! [크리티컬] N…"과 통일).
  let log = appendLog(state.log, {
    kind: "player_attack",
    text: `공격! ${prefix}${totalDmg} 피해를 입혔다.`,
    damage: totalDmg,
    critical: critRoll,
  });
  // 이중 행운 — 첫 크리티컬 발동 순간 활성화, 후속 공격/회피 부터 보너스 적용.
  const shouldActivateLucky =
    critRoll &&
    !state.flags.luckyBuffActive &&
    (player.doubleLuck?.crit ?? 0) > 0;
  if (shouldActivateLucky) {
    log = appendLog(log, {
      kind: "info",
      text: `[이중 행운] 회피/크리티컬 +${player.doubleLuck!.crit}% 발동!`,
    });
  }
  const luckyBuffActive = state.flags.luckyBuffActive || shouldActivateLucky;
  // 흡혈 (특기) — 크리티컬로 준 피해의 % 만큼 HP 회복.
  const lifestealHeal =
    critRoll && (player.lifestealCritHealPct ?? 0) > 0
      ? Math.floor((dmg * player.lifestealCritHealPct!) / 100)
      : 0;
  // 행운의 흡혈 (2티어 특기) — 모든 공격 피해의 N% HP 회복 (크리 외도 포함).
  const luckyLifestealHeal =
    (player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((dmg * player.luckyLifestealPct!) / 100)
      : 0;
  // 흡혈의 룬 — 명중 시 가한 피해의 N% HP 회복 (luckyLifesteal 과 같은 trigger, 별도 가산).
  const runeLifestealHeal =
    (player.runeLifestealPct ?? 0) > 0
      ? Math.floor((dmg * player.runeLifestealPct!) / 100)
      : 0;
  // 흡령 (AP 시한부) — buffs 의 turnsLeft 가 살아 있는 동안 가한 데미지의 pct% HP 회복.
  // 룬/특기 흡혈과 별개 가산. 같은 trigger(공격 명중) 라 같은 라인에서 합산 라벨.
  const apLifestealHeal =
    nextBuffsTimed.playerLifestealTurnsLeft > 0 && nextBuffsTimed.playerLifestealPct > 0
      ? Math.floor((dmg * nextBuffsTimed.playerLifestealPct) / 100)
      : 0;
  // 별빛 흡혈(enchant lifesteal) — 가한 피해의 pct% HP 회복. 다른 흡혈류와 별개 가산.
  const enchantLifestealHeal =
    (player.enchantLifestealPct ?? 0) > 0
      ? Math.floor((dmg * player.enchantLifestealPct!) / 100)
      : 0;
  const totalLifestealHeal =
    lifestealHeal +
    luckyLifestealHeal +
    runeLifestealHeal +
    apLifestealHeal +
    enchantLifestealHeal;
  const newPlayerHp =
    totalLifestealHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + totalLifestealHeal)
      : state.playerHp;
  const actualLifesteal = newPlayerHp - state.playerHp;
  if (actualLifesteal > 0) {
    const lifestealLabels: string[] = [];
    if (lifestealHeal > 0) lifestealLabels.push("흡혈");
    if (luckyLifestealHeal > 0) lifestealLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) lifestealLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) lifestealLabels.push("흡령");
    if (enchantLifestealHeal > 0) lifestealLabels.push("별빛 흡혈");
    log = appendLog(log, {
      kind: "info",
      text: `[${lifestealLabels.join(" + ")}] ${playerName}의 HP +${actualLifesteal}`,
    });
  }
  const enemyHp = Math.max(0, state.enemyHp - totalDmg);
  // 출혈/중독 — 적중 시 tagged DoT 로 누적 (다음 적 턴부터 tick).
  // 약점 적중 (2티어 특기) — 크리 발동 시 그 턴 1회, DEF 무시 큐 + 추가타 1회.
  const weakpointFires =
    critRoll &&
    (player.weakpointExtraAttacks ?? 0) > 0 &&
    !state.turn.weakpointUsedThisTurn;
  const weakpointAdd = weakpointFires ? player.weakpointExtraAttacks! : 0;
  if (weakpointFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[약점 적중] 빈틈을 — 한 번 더!`,
    });
  }
  // 연쇄 운명 (2티어 특기) — 크리 발동 시 그 턴 1회, 다음 공격 1회 크리 강제 큐.
  const fatedChainFires =
    critRoll &&
    !!player.fatedChainActive &&
    !state.turn.fatedChainTriggeredThisTurn;
  if (fatedChainFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[연쇄 운명] 별빛이 다음 결을 점지했다 — 다음 공격 크리 보장.`,
    });
  }
  // 약점 큐 카운터: 이 공격에 사용된 경우 -1, 트리거 발화 시 +weakpointAdd.
  const newWeakpointDefIgnoreLeft =
    Math.max(0, state.stacks.weakpointDefIgnoreLeft - (weakpointDefIgnore ? 1 : 0)) +
    weakpointAdd;
  // 비-atk_multiplier AP 효과 처리 — 본타와 같이 발동되는 부가 효과.
  let playerHpAfterAPHeal = newPlayerHp;
  let apBleedAdd = 0;
  let apEvadesAdd = 0;
  let comboExtraAttacks = 0;
  let queuedExtraAttacksAdd = 0;
  let focusedBreathQueueBonusPct = 0;
  let shouldCleanseDebuffs = false;

  for (const skill of apAllFiredSkills) {
    const effect = skill.effect;
    if (effect.kind === "heal_pct") {
      const amount = Math.floor((state.playerMaxHp * effect.pct) / 100);
      const healed = Math.min(state.playerMaxHp, playerHpAfterAPHeal + amount);
      const actual = healed - playerHpAfterAPHeal;
      playerHpAfterAPHeal = healed;
      if (actual > 0) {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${playerName}의 HP +${actual}`,
        });
      }
    } else if (effect.kind === "apply_bleed") {
      apBleedAdd += effect.stacks;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${state.enemy.name}에게 출혈 +${effect.stacks}스택`,
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
      shouldCleanseDebuffs = true;
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${playerName}의 모든 디버프 해제`,
      });
    } else if (effect.kind === "player_dmg_reduction_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 받는 피해 -${effect.pct}%`,
      });
    } else if (effect.kind === "enemy_def_debuff_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 ${state.enemy.name}의 DEF -${effect.pct}%`,
      });
    } else if (effect.kind === "player_atk_buff_def_debuff_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 ATK +${effect.atkPct}%, DEF -${effect.defPct}%`,
      });
    } else if (effect.kind === "enemy_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 ${state.enemy.name}의 SPD ×${effect.mult}`,
      });
    } else if (effect.kind === "player_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 SPD ×${effect.mult}`,
      });
    } else if (effect.kind === "atk_multiplier_with_silence") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${state.enemy.name} ${effect.silenceTurns}행동 동안 스킬 봉인`,
      });
    } else if (effect.kind === "block_next_enemy_attack") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${state.enemy.name}의 다음 공격 ${effect.count}회 무효`,
      });
    } else if (effect.kind === "lifesteal_dmg_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${skill.name}] ${effect.turns}행동 동안 가한 피해의 ${effect.pct}% HP 회복`,
      });
    }
  }

  // 광살참 (multi_hit_self_damage) — 공격형 fire 에서만 자해 HP 적용.
  const madSlashSelfDmg =
    apMultEffect?.kind === "multi_hit_self_damage"
      ? Math.floor((state.playerMaxHp * apMultEffect.selfDmgPct) / 100)
      : 0;
  const playerHpAfterMadSlash =
    madSlashSelfDmg > 0
      ? Math.max(0, playerHpAfterAPHeal - madSlashSelfDmg)
      : playerHpAfterAPHeal;
  if (madSlashSelfDmg > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[${apOffensiveSkill!.name}] ${playerName}의 HP -${madSlashSelfDmg} (자해)`,
    });
  }
  // 고유 시그니처 on-crit(Phase 2) — 크리 + 피해 발생 시 발동. 미장착=null/false → byte-identical.
  //   군림목걸이=속도 버프(playerSpdMult), 독니 단검=대상 중독 DoT. 둘 다 아래 afterDamage 에 합류.
  const sigDealtDamage = totalDmg > 0;
  // 포식자 every-N(Phase 2) — N타마다 추가타 1회. 미장착(N=0)이면 카운터 불변·추가타 0 → byte-identical.
  const sigEveryN = everyNHitsValue(player.equipSignatures);
  const nextSigHitCount =
    sigEveryN > 0 && sigDealtDamage
      ? state.stacks.signatureHitCount + 1
      : state.stacks.signatureHitCount;
  const sigExtraAttack =
    sigEveryN > 0 &&
    nextSigHitCount > state.stacks.signatureHitCount &&
    nextSigHitCount % sigEveryN === 0
      ? 1
      : 0;
  if (sigExtraAttack > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[포식자] 연격 — 한 번 더!`,
    });
  }
  const sigCritSpeedBuff = onCritSpeedBuff(
    player.equipSignatures,
    critRoll,
    sigDealtDamage,
  );
  const sigCritPoison = firesOnCritPoison(
    player.equipSignatures,
    critRoll,
    sigDealtDamage,
  );
  const sigEnemyDots = sigCritPoison
    ? applyV2DotsToTarget(state.enemyV2Dots, [
        makePoisonDot({
          stacks: 1,
          pctMaxHpPerStack: SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
          sourceAtk: player.atk,
        }),
      ])
    : state.enemyV2Dots;
  // 시그니처 발동 시 속도 버프 병합 — 기존 버프(폭주 등)보다 약하면 유지(Math.max·미감소).
  const sigSpdActiveMult =
    nextBuffsTimed.playerSpdTurnsLeft > 0 ? nextBuffsTimed.playerSpdMult : 1;
  const sigSpdBuff = sigCritSpeedBuff
    ? {
        playerSpdMult: Math.max(sigSpdActiveMult, sigCritSpeedBuff.mult),
        playerSpdTurnsLeft: Math.max(
          nextBuffsTimed.playerSpdTurnsLeft,
          sigCritSpeedBuff.turns,
        ),
      }
    : null;
  // 한기(동결의 갑주) — 크리 시 적 둔화. enemySpdMult 슬로우 슬롯에 병합(가장 강한 슬로우=Math.min).
  const sigCritChill = onCritEnemyChill(
    player.equipSignatures,
    critRoll,
    sigDealtDamage,
  );
  const sigEnemySlowActiveMult =
    nextBuffsTimed.enemySpdTurnsLeft > 0 ? nextBuffsTimed.enemySpdMult : 1;
  const sigChillDebuff = sigCritChill
    ? {
        enemySpdMult: Math.min(sigEnemySlowActiveMult, sigCritChill.mult),
        enemySpdTurnsLeft: Math.max(
          nextBuffsTimed.enemySpdTurnsLeft,
          sigCritChill.turns,
        ),
      }
    : null;
  if (sigCritPoison) {
    log = appendLog(log, {
      kind: "info",
      text: `[독니] ${state.enemy.name}을(를) 중독시켰다!`,
    });
  }
  if (sigSpdBuff) {
    log = appendLog(log, {
      kind: "info",
      text: `[군림] 결정타 — 속도가 솟구친다!`,
    });
  }
  if (sigChillDebuff) {
    log = appendLog(log, {
      kind: "info",
      text: `[한기] ${state.enemy.name}이(가) 얼어붙어 굼떠진다!`,
    });
  }
  // 페이즈 트리거 검사 — 데미지 적용 직후, 사망 분기 전에 처리해야 트리거된 def 가
  // 같은 턴 후속 공격(다중공격/연타)에 즉시 반영된다.
  const afterDamage = applyPhaseTriggerIfAny(applyPlayerOnHitDots({
    ...state,
    enemyHp,
    enemyV2Dots: sigEnemyDots, // 고유 시그니처 on-crit 독(독니) 합류·미발동=state 그대로.
    playerHp: playerHpAfterMadSlash,
    log,
    flags: {
      ...state.flags,
      assassinateUsed: state.flags.assassinateUsed || assassinFires,
      luckyBuffActive,
      fatedChainCritPending: fatedChainFires
        ? true
        : fatedChainConsumed
          ? false
          : state.flags.fatedChainCritPending,
    },
    buffs: {
      ...nextBuffsTimed,
      // 2티어 특기 상태 갱신.
      cyclingChiBonus: cyclingChiThisTurn,
      // 고유 시그니처 on-crit 속도 버프(군림) 병합 — 미발동이면 빈 객체(불변).
      ...(sigSpdBuff ?? {}),
      // 고유 시그니처 on-crit 한기(동결의 갑주) 적 둔화 — 미발동이면 빈 객체(불변).
      ...(sigChillDebuff ?? {}),
    },
    stacks: {
      ...state.stacks,
      chillStacks: shouldCleanseDebuffs ? 0 : state.stacks.chillStacks,
      evadesRemaining: state.stacks.evadesRemaining + apEvadesAdd,
      weakpointDefIgnoreLeft: newWeakpointDefIgnoreLeft,
      comboAtkBonus: nextComboAtkBonus,
      comboHitCount: nextComboHitCount,
      signatureHitCount: nextSigHitCount, // 포식자 every-N 카운터(미장착=불변)
    },
    turn: {
      ...state.turn,
      critThisTurn: state.turn.critThisTurn || critRoll,
      fatedChainTriggeredThisTurn:
        state.turn.fatedChainTriggeredThisTurn || fatedChainFires,
      weakpointUsedThisTurn: state.turn.weakpointUsedThisTurn || weakpointFires,
      // 집중의 호흡 — 발동되면 이번 fire 후부터 큐잉, 큐 활성 중 평타 1회 발사 시 0 으로 소비.
      focusedBreathCritDmgBonusPct: focusedBreathQueueBonusPct > 0
        ? focusedBreathQueueBonusPct
        : focusedBreathConsumed
          ? 0
          : state.turn.focusedBreathCritDmgBonusPct,
      // 빛의 활공 — 다음 턴 attacksLeft 에 가산할 큐. 일반 평타에선 0 유지.
      queuedExtraAttacks: queuedExtraAttacksAdd > 0
        ? queuedExtraAttacksAdd
        : state.turn.queuedExtraAttacks,
    },
  }, player, { bleedStacks: apBleedAdd }));
  if (enemyHp <= 0) {
    return {
      ...afterDamage,
      log: appendLog(afterDamage.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
      turn: {
        ...afterDamage.turn,
        completedPlayerTurns: state.turn.completedPlayerTurns + 1,
      },
    };
  }
  const attacksLeft =
    state.playerAttacksLeft - 1 + weakpointAdd + comboExtraAttacks + sigExtraAttack;
  if (attacksLeft > 0) {
    return {
      ...afterDamage,
      playerAttacksLeft: attacksLeft,
      turn: { ...afterDamage.turn, firstAttackPending: false },
    };
  }
  // 마지막 공격이 끝난 시점 — 연타 발동 가능 여부 검사.
  const interval = player.extraAttackEveryNTurns;
  const canDoubleStrike =
    !!interval &&
    interval > 0 &&
    turnNumber % interval === 0 &&
    !state.turn.doubleStrikeUsedThisTurn;
  if (canDoubleStrike) {
    return {
      ...afterDamage,
      log: appendLog(afterDamage.log, { kind: "info", text: "[연타] 한 번 더!" }),
      phase: "player",
      playerAttacksLeft: 1,
      turn: {
        ...afterDamage.turn,
        doubleStrikeUsedThisTurn: true,
        firstAttackPending: false,
      },
    };
  }
  // 광속 — 마지막 공격 후 일정 확률로 추가 1회. 연타와 별개라 둘 다 슬롯 시
  // 한 턴에 +2 까지 발동 가능 (연타 → 광속 순서 — 연타가 먼저 빠져나간 다음 광속).
  const lightspeedPct = player.lightspeedExtraAttackPct ?? 0;
  const canLightspeed =
    lightspeedPct > 0 &&
    !state.turn.lightspeedUsedThisTurn &&
    Math.random() * 100 < lightspeedPct;
  if (canLightspeed) {
    return {
      ...afterDamage,
      log: appendLog(afterDamage.log, {
        kind: "info",
        text: "[광속] 잔상이 한 번 더 휘둘렀다!",
      }),
      phase: "player",
      playerAttacksLeft: 1,
      turn: {
        ...afterDamage.turn,
        lightspeedUsedThisTurn: true,
        firstAttackPending: false,
      },
    };
  }
  // 풍사슬 (5티어) — 추가 공격(연타·광속·이전 풍사슬) 발동 후 확률로 1회 더. 캡: GALE_CHAIN_MAX_PER_TURN.
  // 6티어 무한 풍사슬: 확률 +eternalGaleBonusPct% + 캡 해제.
  const baseGalePct = player.galeChainChancePct ?? 0;
  const eternalBonusPct = player.eternalGaleBonusPct ?? 0;
  const effectiveGalePct = baseGalePct + eternalBonusPct;
  const galeChainReady =
    state.turn.doubleStrikeUsedThisTurn ||
    state.turn.lightspeedUsedThisTurn ||
    state.turn.galeChainsThisTurn > 0;
  // 무한 풍사슬 시 절대 캡 (ETERNAL_GALE_ABSOLUTE_CAP) 까지만 — 정상 확률엔 도달 불가, cheese 방지용.
  const galeCap = player.eternalGaleNoCap
    ? ETERNAL_GALE_ABSOLUTE_CAP
    : GALE_CHAIN_MAX_PER_TURN;
  const canGaleChain =
    effectiveGalePct > 0 &&
    galeChainReady &&
    state.turn.galeChainsThisTurn < galeCap &&
    Math.random() * 100 < effectiveGalePct;
  if (canGaleChain) {
    return {
      ...afterDamage,
      log: appendLog(afterDamage.log, {
        kind: "info",
        text: "[풍사슬] 바람이 한 번 더 휘몰아친다!",
      }),
      phase: "player",
      playerAttacksLeft: 1,
      turn: {
        ...afterDamage.turn,
        galeChainsThisTurn: state.turn.galeChainsThisTurn + 1,
        firstAttackPending: false,
      },
    };
  }
  // 연참 (특기) — 이번 턴에 크리티컬이 났으면 추가 공격 N회 (턴당 1회).
  const canRiposte =
    (player.riposteExtra ?? 0) > 0 &&
    !state.turn.riposteUsedThisTurn &&
    afterDamage.turn.critThisTurn;
  if (canRiposte) {
    return {
      ...afterDamage,
      log: appendLog(afterDamage.log, {
        kind: "info",
        text: "[연참] 빈틈을 파고든다 — 한 번 더!",
      }),
      phase: "player",
      playerAttacksLeft: player.riposteExtra!,
      turn: {
        ...afterDamage.turn,
        riposteUsedThisTurn: true,
        firstAttackPending: false,
      },
    };
  }
  const ended: BattleState = {
    ...afterDamage,
    phase: "enemy",
    playerAttacksLeft: rollPlayerAttackCountWithBleed(afterDamage, player),
    turn: {
      ...afterDamage.turn,
      completedPlayerTurns: state.turn.completedPlayerTurns + 1,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      firstAttackPending: true,
      galeChainsThisTurn: 0,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
    },
  };
  return finishPlayerTurn(ended, player, playerName);
}
