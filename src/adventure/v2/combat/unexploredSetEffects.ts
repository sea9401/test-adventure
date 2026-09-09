/** 전투마다 새로 생성한다. 카운터는 타격별이 아니라 해당 행동당 한 번만 갱신한다. */
export type UnexploredSetRuntime = {
  revengePending: boolean;
  paidDirectSkillCount: number;
  manualBasicAttackCount: number;
  manaSkillCount: number;
  evasionReducedThisEnemyAction: number;
  chainDriveResolving: boolean;
};

export type UnexploredSetPveRuntime = UnexploredSetRuntime & {
  battleStartDef: number;
  ironWallDefBonus: number;
  afterimageShield: number;
  enemyActionHpDamage: number;
  /** Existing chill stacks and generic slow/accuracy debuffs remain independent. */
  frost?: NonNullable<ReturnType<typeof frostMark>>;
};

/** PvP owns one runtime per fighter; frost belongs to its target separately. */
export type UnexploredSetPvpRuntime = Omit<UnexploredSetPveRuntime, "frost"> & {
  battleStartMaxHp: number;
};

export type UnexploredDebuffs = {
  frostActions: number;
  speedReductionPct: number;
  accuracyPenalty: number;
};

/** Only display state crosses the replay boundary, never internal action accumulators. */
export function unexploredResourceSnapshot(
  runtime: UnexploredSetPvpRuntime | undefined,
  debuffs: UnexploredDebuffs | undefined,
): Record<string, number | string> | undefined {
  const resources: Record<string, number | string> = {};
  if (runtime?.revengePending) resources.unexploredRevenge = "응징";
  if (runtime?.paidDirectSkillCount) resources.unexploredCrystalFocus = `수정 집속 ${runtime.paidDirectSkillCount}/3`;
  if (runtime?.manualBasicAttackCount) resources.unexploredPrecisionShot = `정밀 사격 ${runtime.manualBasicAttackCount}/4`;
  if (runtime?.ironWallDefBonus) resources.unexploredIronWall = `철벽 누적 방어 +${runtime.ironWallDefBonus}`;
  if (debuffs?.frostActions) resources.unexploredFrost = `서리 표식 ${debuffs.frostActions}행동`;
  return Object.keys(resources).length ? resources : undefined;
}

export type EnemyHitResolution = {
  rawDirectDamage: number;
  damageAfterEvasion: number;
  shieldAbsorbed: number;
  hpDamage: number;
  evasionPreventedDamage: number;
  fullyEvaded: boolean;
};

export function initialUnexploredSetRuntime(): UnexploredSetRuntime {
  return {
    revengePending: false,
    paidDirectSkillCount: 0,
    manualBasicAttackCount: 0,
    manaSkillCount: 0,
    evasionReducedThisEnemyAction: 0,
    chainDriveResolving: false,
  };
}

export type UnexploredAttackContext = {
  kind: "manual_basic" | "direct_skill" | "counter" | "extra_basic" | "independent";
  mpActuallySpent: number;
  hit: boolean;
  anyCrit: boolean;
  multiHitIndex: number;
  multiHitCount: number;
};

function isDirectAttack(context: UnexploredAttackContext): boolean {
  return context.kind === "manual_basic" || context.kind === "direct_skill";
}

/** 실제 HP 감소량만 전달한다. 반환값은 새 누적 방어력이며 증가분이 아니다. */
export function ironWallDefGain(input: {
  hpDamage: number; currentBonus: number; battleStartDef: number;
}): number {
  return Math.min(
    input.battleStartDef,
    input.currentBonus + Math.floor(Math.max(0, input.hpDamage) * 0.0075),
  );
}

/** 성공한 스킬 행동마다 한 번 호출. 최초 8% 보호막은 엔진 초기화에서 부여한다. */
export function manaRedeployment(input: {
  currentSkillCount: number; isSkill: boolean; currentShield: number; maxHp: number;
}): { skillCount: number; shield: number } {
  if (!input.isSkill) return { skillCount: input.currentSkillCount, shield: input.currentShield };
  const skillCount = (input.currentSkillCount + 1) % 3;
  return {
    skillCount,
    shield: skillCount === 0
      ? Math.max(input.currentShield, Math.floor(input.maxHp * 0.08))
      : input.currentShield,
  };
}

/** 회복 증가는 무시하고 받는 회복 감소만 적용한다. 사망자를 부활시키지 않는다. */
export function colonyRegeneration(input: {
  hp: number; maxHp: number; receivedHealMult: number;
}): number {
  if (input.hp <= 0 || input.maxHp <= 0) return 0;
  const lowHp = input.hp <= input.maxHp * 0.4;
  const missing = Math.max(0, input.maxHp - input.hp);
  const baseHeal = Math.min(
    missing * (lowHp ? 0.08 : 0.05),
    input.maxHp * (lowHp ? 0.03 : 0.02),
  );
  return Math.floor(baseHeal * Math.max(0, Math.min(1, input.receivedHealMult)));
}

/** 한 적 행동의 합산 실제 HP 피해를 전달한다(보호막·초과 피해 제외). */
export function shouldQueueRevenge(hpDamage: number, maxHp: number): boolean {
  return hpDamage > 0 && hpDamage >= maxHp * 0.05;
}

/** currentShield는 다른 보호막을 제외한 허상 피막 전용 잔량이다. */
export function afterimageShield(input: {
  evasionPreventedDamage: number; currentShield: number; maxHp: number;
}): number {
  return Math.min(
    Math.floor(input.maxHp * 0.03),
    input.currentShield + Math.floor(Math.max(0, input.evasionPreventedDamage) * 0.15),
  );
}

export function unyieldingDamage(input: {
  damage: number; hpBefore: number; maxHp: number; eligibleKind: boolean;
}): number {
  if (input.damage <= 0) return 0;
  return input.eligibleKind && input.hpBefore <= input.maxHp * 0.35
    ? Math.max(1, Math.floor(input.damage * 0.85))
    : input.damage;
}

/** pending은 공격 시작 시 스냅샷을 다단 전체에 사용한다. */
export function revengeDamageMultiplier(input: {
  pending: boolean; context: UnexploredAttackContext;
}): number {
  return input.pending && isDirectAttack(input.context) ? 1.2 : 1;
}

/** 공격 전체가 끝난 후 총 실제 HP 피해로 한 번 소비한다. */
export function revengePendingAfterAttack(input: {
  pending: boolean; context: UnexploredAttackContext; hpDamage: number;
}): boolean {
  return input.pending && !(isDirectAttack(input.context) && input.context.hit && input.hpDamage > 0);
}

/** MP를 실제 소모한 직접 피해 스킬의 시도당 한 번 호출(완전 회피도 소비). */
export function crystalFocusStep(input: {
  count: number; isPaidDirectSkill: boolean;
}): { count: number; damageMult: number; consumeOnAttempt: boolean } {
  const count = input.isPaidDirectSkill ? (input.count + 1) % 3 : input.count;
  const boosted = input.isPaidDirectSkill && count === 0;
  return { count, damageMult: boosted ? 1.25 : 1, consumeOnAttempt: boosted };
}

/** 직접 선택한 평타 시도당 한 번 호출. 추가 공격 생성 여부는 바꾸지 않는다. */
export function precisionShotStep(input: {
  count: number; isManualBasic: boolean;
}): { count: number; damageMult: number; ignoreNormalMiss: boolean } {
  const count = input.isManualBasic ? (input.count + 1) % 4 : input.count;
  const boosted = input.isManualBasic && count === 0;
  return { count, damageMult: boosted ? 1.5 : 1, ignoreNormalMiss: boosted };
}

/** 다단 전체 적중 결과로 스킬당 한 번 굴린다. 후속 공격 중 재진입을 금지한다. */
export function chainDriveFollowUp(input: {
  eligibleDirectSkillHit: boolean; alreadyResolving: boolean; roll: number;
  extraBasicAttackDamagePct: number;
}): { fires: boolean; basicDamageMult: number } {
  return {
    fires: input.eligibleDirectSkillHit && !input.alreadyResolving && input.roll < 0.25,
    basicDamageMult: 0.6 * (1 + Math.max(0, input.extraBasicAttackDamagePct) / 100),
  };
}

export function frostMark(input: {
  eligibleCrit: boolean; freezingLock: boolean;
}): { speedReductionPct: number; accuracyPenalty: number; actions: number } | null {
  if (!input.eligibleCrit) return null;
  return {
    speedReductionPct: input.freezingLock ? 20 : 12,
    accuracyPenalty: input.freezingLock ? 12 : 0,
    actions: 2,
  };
}

/** 물리·마법 중 실제 공격 유형에 대응하는 방어력을 전달한다. */
export function defenseAfterColossusCrush(input: {
  defense: number; context: UnexploredAttackContext;
}): number {
  return isDirectAttack(input.context) ? Math.floor(input.defense * 0.9) : input.defense;
}
