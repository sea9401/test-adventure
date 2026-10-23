import type { UnexploredBossEffectKind } from "@/adventure/data/v2/unexploredBossUniqueEffects";

// 미개척지 보스 고유 장비 효과의 순수 상태 기계. 전투 엔진 상태를 모르고 숫자와 명령만 돌려준다.
// PvE·PvP 어댑터가 미개척지 세트 효과와 같은 연결 지점에서 호출한다.

type Effects = readonly UnexploredBossEffectKind[] | undefined;

export const TRACKING_EDGE_MAX = 5;
export const TRACKING_EDGE_PCT = 3;
export const PHANTOM_HASTE_PCT = 15;
export const ORBIT_PURSUIT_MAX = 10;
export const ORBIT_DAMAGE_MULT = 2;
export const ORBIT_DEFENSE_MULT = 0.5;
export const TOXIC_CLAW_POISON_STACKS = 5;
export const TOXIC_CLAW_MULT = 1.08;
export const COAGULATION_MAX = 3;
export const COAGULATION_POISON = 2;
export const TOXIC_BLOOD_MAX = 6;
export const TOXIC_BLOOD_HEAL_PCT = 15;
export const TOXIC_BLOOD_DAMAGE_PCT = 8;
export const TOXIC_BLOOD_POISON = 3;
export const CHILL_MAX = 10;
export const CHILL_SPEED_PCT_PER_STACK = 2;
export const FREEZE_DAMAGE_MULT = 1.3;
export const MAGISTEEL_SHIELD_PCT = 5;
export const MAGISTEEL_DAMAGE_MULT = 0.92;
export const SEAL_SHIELD_PCT = 4;
export const SEAL_CHARGES = 3;
export const BULWARK_SHIELD_PCT = 15;
export const BULWARK_DAMAGE_MULT = 0.85;
export const BULWARK_REFLECT_PCT = 40;
export const BULWARK_REBUILD_ACTIONS = 6;
export const CORRECTION_MULT = 1.25;
export const CORRECTION_HITS = 3;
export const STARPATH_MULT = 1.15;
export const FOCUS_MAX = 20;
export const FOCUS_DAMAGE_MULT = 1.5;
export const FOCUS_DEBUFF_PCT = 20;
export const FOCUS_DEBUFF_ACTIONS = 3;
export const FRENZY_PCT_PER_STEP = 2;
export const FRENZY_MAX_STEPS = 7;
export const PULSING_REGEN_PCT = 1;
export const ETERNAL_CHARGES_PVE = 2;
export const ETERNAL_CHARGES_PVP = 1;
export const ETERNAL_HEAL_PCTS = [35, 20] as const;
export const ETERNAL_DAMAGE_MULT = 1.2;
export const ETERNAL_SPEED_MULT = 1.15;

export type BossUniqueRuntime = {
  orbitCalc: number;
  pursuit: number;
  coagulation: number;
  toxicBlood: number;
  /** 이 장비 보유자가 상대에게 쌓은 혹한. 상대 속도에 적용한다. */
  targetChill: number;
  freezeBonusPending: boolean;
  correctionHits: number;
  correctionPending: boolean;
  starpathPending: boolean;
  focus: number;
  /** 공용 보호막 중 불괴 방벽 전용 잔량. 다른 보호막이 먼저 깎인다. */
  bulwarkShield: number;
  bulwarkSize: number;
  bulwarkBrokePending: boolean;
  /** 방벽 재건까지 남은 자기 행동 수. 0이면 서 있거나 미보유. */
  bulwarkRebuildIn: number;
  sealCharges: number;
  eternalCharges: number;
  eternalUsed: number;
  eternalFrenzy: boolean;
  pendingHastePct: number;
  actionDamaged: boolean;
  /** 이번 적 행동에서 회피로 줄인 피해 비율의 최댓값(완전 회피 = 1). */
  actionEvadedFraction: number;
};

export type BossUniqueCommand =
  | { kind: "damage_fixed"; label: string; amount: number }
  | { kind: "apply_poison"; label: string; stacks: number }
  | { kind: "def_debuff" | "mdef_debuff"; label: string; pct: number; actions: number }
  | { kind: "shield"; label: string; amount: number }
  | { kind: "heal"; label: string; amount: number }
  | { kind: "cleanse_dots"; label: string }
  | { kind: "freeze"; label: string };

const has = (effects: Effects, kind: UnexploredBossEffectKind) =>
  effects?.includes(kind) ?? false;

const pctOf = (value: number, pct: number) =>
  Math.max(0, Math.floor((Math.max(0, value) * pct) / 100));

export function initialBossUniqueRuntime(
  effects: Effects,
  input: { maxHp: number; pvp: boolean; scaleShield?: (amount: number) => number },
): { runtime: BossUniqueRuntime; startShield: number } {
  const scale = input.scaleShield ?? ((amount: number) => amount);
  const bulwark = has(effects, "invincible_bulwark")
    ? scale(pctOf(input.maxHp, BULWARK_SHIELD_PCT))
    : 0;
  const magisteel = has(effects, "magisteel_guard")
    ? scale(pctOf(input.maxHp, MAGISTEEL_SHIELD_PCT))
    : 0;
  return {
    runtime: {
      orbitCalc: 0,
      pursuit: 0,
      coagulation: 0,
      toxicBlood: 0,
      targetChill: 0,
      freezeBonusPending: false,
      correctionHits: 0,
      correctionPending: false,
      starpathPending: false,
      focus: 0,
      bulwarkShield: bulwark,
      bulwarkSize: bulwark,
      bulwarkBrokePending: false,
      bulwarkRebuildIn: 0,
      sealCharges: has(effects, "sealing_barrier") ? SEAL_CHARGES : 0,
      eternalCharges: has(effects, "eternal_life")
        ? input.pvp ? ETERNAL_CHARGES_PVP : ETERNAL_CHARGES_PVE
        : 0,
      eternalUsed: 0,
      eternalFrenzy: false,
      pendingHastePct: 0,
      actionDamaged: false,
      actionEvadedFraction: 0,
    },
    startShield: bulwark + magisteel,
  };
}

/** 공격 시도마다 한 번. 다단 공격 전체에 같은 배율을 쓰고, 소비형 보너스는 시도 시 소비한다. */
export function beginBossUniqueAttack(
  runtime: BossUniqueRuntime,
  effects: Effects,
  input: { direct: boolean; targetPoisonStacks: number; hp: number; maxHp: number },
): { runtime: BossUniqueRuntime; damageMult: number; defenseMult: number; logs: string[] } {
  if (!input.direct || !effects?.length) {
    return { runtime, damageMult: 1, defenseMult: 1, logs: [] };
  }
  let next = runtime;
  let damageMult = 1;
  let defenseMult = 1;
  const logs: string[] = [];
  if (has(effects, "tracking_edge")) {
    damageMult *= 1 + (next.orbitCalc * TRACKING_EDGE_PCT) / 100;
  }
  if (has(effects, "infinite_orbit") && next.pursuit >= ORBIT_PURSUIT_MAX) {
    damageMult *= ORBIT_DAMAGE_MULT;
    defenseMult *= ORBIT_DEFENSE_MULT;
    next = { ...next, pursuit: 0 };
    logs.push("궤도 절단");
  }
  if (has(effects, "toxic_claw") && input.targetPoisonStacks >= TOXIC_CLAW_POISON_STACKS) {
    damageMult *= TOXIC_CLAW_MULT;
  }
  if (next.freezeBonusPending) {
    damageMult *= FREEZE_DAMAGE_MULT;
    next = { ...next, freezeBonusPending: false };
    logs.push("빙결 일격");
  }
  if (next.starpathPending) {
    damageMult *= STARPATH_MULT;
    next = { ...next, starpathPending: false };
    logs.push("별궤 조준");
  }
  if (next.correctionPending) {
    damageMult *= CORRECTION_MULT;
    next = { ...next, correctionPending: false };
    logs.push("보정 사격");
  }
  if (has(effects, "immortal_frenzy") && input.maxHp > 0) {
    const lostRatio = Math.max(0, input.maxHp - input.hp) / input.maxHp;
    const steps = Math.min(FRENZY_MAX_STEPS, Math.floor(lostRatio * 10 + 1e-9));
    damageMult *= 1 + (steps * FRENZY_PCT_PER_STEP) / 100;
  }
  if (next.eternalFrenzy) damageMult *= ETERNAL_DAMAGE_MULT;
  return { runtime: next, damageMult, defenseMult, logs };
}

/** 공격 시도가 끝난 뒤 한 번. hit=false는 완전 회피(피해 0)다. */
export function finishBossUniqueAttack(
  runtime: BossUniqueRuntime,
  effects: Effects,
  input: { direct: boolean; hit: boolean; crit: boolean; atk: number; magicAtk: number },
): { runtime: BossUniqueRuntime; commands: BossUniqueCommand[] } {
  if (!input.direct || !effects?.length) return { runtime, commands: [] };
  let next = runtime;
  const commands: BossUniqueCommand[] = [];
  if (!input.hit) {
    if (has(effects, "tracking_edge")) next = { ...next, orbitCalc: 0 };
    return { runtime: next, commands };
  }
  if (has(effects, "tracking_edge")) {
    next = { ...next, orbitCalc: Math.min(TRACKING_EDGE_MAX, next.orbitCalc + 1) };
  }
  if (has(effects, "infinite_orbit")) {
    next = { ...next, pursuit: Math.min(ORBIT_PURSUIT_MAX, next.pursuit + 1) };
  }
  if (has(effects, "prismatic_correction")) {
    const correctionHits = next.correctionHits + 1;
    next = correctionHits >= CORRECTION_HITS
      ? { ...next, correctionHits: 0, correctionPending: true }
      : { ...next, correctionHits };
  }
  const chillGain = (has(effects, "glacial_crush") ? 2 : 0) + (has(effects, "absolute_zero") ? 3 : 0);
  if (chillGain > 0) {
    next = { ...next, targetChill: Math.min(CHILL_MAX, next.targetChill + chillGain) };
  }
  if (has(effects, "absolute_zero") && next.targetChill >= CHILL_MAX) {
    next = { ...next, targetChill: 0, freezeBonusPending: true };
    commands.push({ kind: "freeze", label: "절대영도" });
  }
  if (has(effects, "starpath_aim") && !input.crit) {
    next = { ...next, starpathPending: true };
  }
  if (has(effects, "infinite_focus")) {
    const focus = next.focus + (input.crit ? 2 : 1);
    if (focus >= FOCUS_MAX) {
      next = { ...next, focus: 0 };
      commands.push(
        { kind: "damage_fixed", label: "천공 포격", amount: Math.floor(Math.max(input.atk, input.magicAtk) * FOCUS_DAMAGE_MULT) },
        { kind: "def_debuff", label: "천공 포격", pct: FOCUS_DEBUFF_PCT, actions: FOCUS_DEBUFF_ACTIONS },
        { kind: "mdef_debuff", label: "천공 포격", pct: FOCUS_DEBUFF_PCT, actions: FOCUS_DEBUFF_ACTIONS },
      );
    } else {
      next = { ...next, focus };
    }
  }
  return { runtime: next, commands };
}

/** 적의 타격마다 한 번. shieldAfter는 이 타격 뒤 남은 공용 보호막이다. */
export function recordBossUniqueHit(
  runtime: BossUniqueRuntime,
  hit: { fullyEvaded: boolean; evadedFraction: number; hpDamage: number; shieldAbsorbed: number; shieldAfter: number },
): BossUniqueRuntime {
  const evaded = hit.fullyEvaded ? 1 : Math.min(1, Math.max(0, hit.evadedFraction || 0));
  let next = evaded > runtime.actionEvadedFraction ? { ...runtime, actionEvadedFraction: evaded } : runtime;
  if (hit.fullyEvaded) return next;
  if (hit.hpDamage + hit.shieldAbsorbed > 0 && !next.actionDamaged) {
    next = { ...next, actionDamaged: true };
  }
  if (next.bulwarkShield > 0) {
    const bulwarkShield = Math.min(next.bulwarkShield, Math.max(0, Math.floor(hit.shieldAfter)));
    next = {
      ...next,
      bulwarkShield,
      bulwarkBrokePending: next.bulwarkBrokePending || bulwarkShield === 0,
    };
  }
  return next;
}

/** 적대 피해 공통 관문(사망 극복 다음, 불굴 앞)에서 HP가 0 이하가 될 때 한 번. */
export function bossUniqueLethalSave(
  runtime: BossUniqueRuntime | undefined,
  effects: Effects,
  input: { hpAfterDamage: number; maxHp: number },
): { runtime: BossUniqueRuntime; hp: number } | null {
  if (!runtime || !has(effects, "eternal_life") || runtime.eternalCharges <= 0 || input.hpAfterDamage > 0) {
    return null;
  }
  const pct = ETERNAL_HEAL_PCTS[Math.min(runtime.eternalUsed, ETERNAL_HEAL_PCTS.length - 1)];
  return {
    runtime: {
      ...runtime,
      eternalCharges: runtime.eternalCharges - 1,
      eternalUsed: runtime.eternalUsed + 1,
      eternalFrenzy: true,
    },
    hp: Math.max(1, pctOf(input.maxHp, pct)),
  };
}

/** 적 행동 하나가 끝날 때 한 번. 피격 계열 중첩은 여기서 행동당 1회만 쌓는다. */
export function finishBossUniqueEnemyAction(
  runtime: BossUniqueRuntime,
  effects: Effects,
  input: { maxHp: number; hasDots: boolean; scaleShield?: (amount: number) => number },
): { runtime: BossUniqueRuntime; commands: BossUniqueCommand[] } {
  if (!effects?.length) return { runtime, commands: [] };
  const scale = input.scaleShield ?? ((amount: number) => amount);
  let next = runtime;
  const commands: BossUniqueCommand[] = [];
  if (next.actionDamaged) {
    if (has(effects, "coagulated_venom")) {
      const coagulation = next.coagulation + 1;
      if (coagulation >= COAGULATION_MAX) {
        commands.push({ kind: "apply_poison", label: "응고독 반격", stacks: COAGULATION_POISON });
        next = { ...next, coagulation: 0 };
      } else {
        next = { ...next, coagulation };
      }
    }
    if (has(effects, "uncorrupted_heart")) {
      const toxicBlood = next.toxicBlood + 1;
      if (toxicBlood >= TOXIC_BLOOD_MAX) {
        commands.push(
          { kind: "cleanse_dots", label: "독혈 역류" },
          { kind: "heal", label: "독혈 역류", amount: pctOf(input.maxHp, TOXIC_BLOOD_HEAL_PCT) },
          { kind: "damage_fixed", label: "독혈 역류", amount: pctOf(input.maxHp, TOXIC_BLOOD_DAMAGE_PCT) },
          { kind: "apply_poison", label: "독혈 역류", stacks: TOXIC_BLOOD_POISON },
        );
        next = { ...next, toxicBlood: 0 };
      } else {
        next = { ...next, toxicBlood };
      }
    }
    if (has(effects, "frozen_bulwark")) {
      next = { ...next, targetChill: Math.min(CHILL_MAX, next.targetChill + 1) };
    }
  }
  if (next.actionEvadedFraction > 0 && has(effects, "phantom_haste")) {
    next = { ...next, pendingHastePct: Math.max(next.pendingHastePct, PHANTOM_HASTE_PCT * next.actionEvadedFraction) };
  }
  if (next.bulwarkBrokePending) {
    commands.push({
      kind: "damage_fixed",
      label: "불괴 방벽 붕괴",
      amount: pctOf(next.bulwarkSize, BULWARK_REFLECT_PCT),
    });
    next = { ...next, bulwarkBrokePending: false, bulwarkRebuildIn: BULWARK_REBUILD_ACTIONS };
  }
  if (input.hasDots && next.sealCharges > 0) {
    commands.push({ kind: "shield", label: "봉인 결계", amount: scale(pctOf(input.maxHp, SEAL_SHIELD_PCT)) });
    next = { ...next, sealCharges: next.sealCharges - 1 };
  }
  return { runtime: { ...next, actionDamaged: false, actionEvadedFraction: 0 }, commands };
}

/** 받는 피해 보정. shield는 이 피해를 받을 때 남아 있는 공용 보호막이다. */
export function bossUniqueDamageTaken(
  runtime: BossUniqueRuntime | undefined,
  effects: Effects,
  input: { damage: number; shield: number },
): number {
  if (!runtime || !effects?.length || input.damage <= 0) return input.damage;
  let mult = 1;
  if (has(effects, "magisteel_guard") && input.shield > 0) mult *= MAGISTEEL_DAMAGE_MULT;
  if (has(effects, "invincible_bulwark") && runtime.bulwarkShield > 0) mult *= BULWARK_DAMAGE_MULT;
  return mult === 1 ? input.damage : Math.max(1, Math.floor(input.damage * mult));
}

/** 자기 행동(평타·스킬 선택) 시작마다 한 번. */
export function startBossUniquePlayerAction(
  runtime: BossUniqueRuntime,
  effects: Effects,
  input: { hp: number; maxHp: number; healMult: number },
): { runtime: BossUniqueRuntime; commands: BossUniqueCommand[] } {
  if (!effects?.length) return { runtime, commands: [] };
  let next = runtime;
  const commands: BossUniqueCommand[] = [];
  if (has(effects, "pulsing_regen") && input.hp > 0) {
    const missing = Math.max(0, input.maxHp - input.hp);
    const amount = Math.floor(((missing * PULSING_REGEN_PCT) / 100) * Math.max(0, input.healMult));
    if (amount > 0) commands.push({ kind: "heal", label: "재생 고동", amount });
  }
  if (next.bulwarkRebuildIn > 0) {
    const bulwarkRebuildIn = next.bulwarkRebuildIn - 1;
    next = { ...next, bulwarkRebuildIn };
    if (bulwarkRebuildIn === 0 && next.bulwarkSize > 0) {
      next = { ...next, bulwarkShield: next.bulwarkSize };
      commands.push({ kind: "shield", label: "불괴 방벽", amount: next.bulwarkSize });
    }
  }
  return { runtime: next, commands };
}

export function consumeBossUniqueHaste(runtime: BossUniqueRuntime): { runtime: BossUniqueRuntime; pct: number } {
  return runtime.pendingHastePct > 0
    ? { runtime: { ...runtime, pendingHastePct: 0 }, pct: runtime.pendingHastePct }
    : { runtime, pct: 0 };
}

export function bossUniqueSelfSpeedMult(runtime: BossUniqueRuntime | undefined): number {
  return runtime?.eternalFrenzy ? ETERNAL_SPEED_MULT : 1;
}

export function bossUniqueTargetSpeedMult(runtime: BossUniqueRuntime | undefined): number {
  return runtime && runtime.targetChill > 0
    ? 1 - (runtime.targetChill * CHILL_SPEED_PCT_PER_STACK) / 100
    : 1;
}

export function bossUniqueResourceSnapshot(
  runtime: BossUniqueRuntime | undefined,
): Record<string, string> | undefined {
  if (!runtime) return undefined;
  const out: Record<string, string> = {};
  if (runtime.orbitCalc > 0) out.unexploredBossOrbit = `궤도 ${runtime.orbitCalc}/${TRACKING_EDGE_MAX}`;
  if (runtime.pursuit > 0) out.unexploredBossPursuit = `추적 ${runtime.pursuit}/${ORBIT_PURSUIT_MAX}`;
  if (runtime.coagulation > 0) out.unexploredBossCoagulation = `응고 ${runtime.coagulation}/${COAGULATION_MAX}`;
  if (runtime.toxicBlood > 0) out.unexploredBossToxicBlood = `독혈 ${runtime.toxicBlood}/${TOXIC_BLOOD_MAX}`;
  if (runtime.targetChill > 0) out.unexploredBossChill = `혹한 ${runtime.targetChill}/${CHILL_MAX}`;
  if (runtime.focus > 0) out.unexploredBossFocus = `조준 ${runtime.focus}/${FOCUS_MAX}`;
  if (runtime.bulwarkShield > 0) out.unexploredBossBulwark = `불괴 방벽 ${runtime.bulwarkShield}`;
  if (runtime.eternalFrenzy) out.unexploredBossEternal = "영겁";
  return Object.keys(out).length ? out : undefined;
}
