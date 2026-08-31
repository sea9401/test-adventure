export const TOXIC_BLOOD_MAX_STACKS = 10;
export const TOXIC_BLOOD_DOT_MAX_HP_FRACTION = 0.003;
export const TOXIC_BLOOD_HEAL_REDUCTION_PER_STACK = 0.03;
export const TOXIC_BLOOD_EXPLOSION_MAX_HP_FRACTION = 0.2;
export const TOXIC_RECOVERY_LOCK_REDUCTION = 0.5;
export const TOXIC_RECOVERY_LOCK_ACTIONS = 2;

function whole(value: number, max: number): number {
  return Math.min(
    max,
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
  );
}

export type ToxicBloodGainResolution = {
  stacks: number;
  exploded: boolean;
};

export function resolveToxicBloodGain(input: {
  current: number;
  gain: number;
}): ToxicBloodGainResolution {
  const total =
    whole(input.current, TOXIC_BLOOD_MAX_STACKS - 1) +
    whole(input.gain, TOXIC_BLOOD_MAX_STACKS);
  return total >= TOXIC_BLOOD_MAX_STACKS
    ? { stacks: 0, exploded: true }
    : { stacks: total, exploded: false };
}

export function toxicBloodRawDotDamage(
  maxHp: number,
  stacks: number,
): number {
  const normalizedStacks = whole(stacks, TOXIC_BLOOD_MAX_STACKS - 1);
  if (normalizedStacks <= 0) return 0;
  const normalizedMaxHp = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0;
  return Math.max(
    1,
    Math.floor(
      normalizedMaxHp *
        normalizedStacks *
        TOXIC_BLOOD_DOT_MAX_HP_FRACTION,
    ),
  );
}

export function toxicBloodRawExplosionDamage(maxHp: number): number {
  const normalizedMaxHp = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0;
  return Math.floor(
    normalizedMaxHp * TOXIC_BLOOD_EXPLOSION_MAX_HP_FRACTION,
  );
}

export function toxicBloodRecoveryMultiplier(input: {
  stacks: number;
  recoveryLockActions: number;
}): number {
  const stackMultiplier =
    1 -
    whole(input.stacks, TOXIC_BLOOD_MAX_STACKS - 1) *
      TOXIC_BLOOD_HEAL_REDUCTION_PER_STACK;
  return input.recoveryLockActions > 0
    ? Math.min(stackMultiplier, 1 - TOXIC_RECOVERY_LOCK_REDUCTION)
    : stackMultiplier;
}

export function consumeToxicRecoveryAction(actions: number): number {
  return Math.max(0, whole(actions, TOXIC_RECOVERY_LOCK_ACTIONS) - 1);
}
