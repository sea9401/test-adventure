export const SKYWARD_CRYSTAL_EYE_AIM_TICKS = 900;
export const SKYWARD_CRYSTAL_EYE_STACK_CAP = 24;
export const SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS = 250;
export const SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT = 25;

export type SkywardCrystalEyeArtilleryPowerPct =
  | 25
  | 50
  | 60
  | 70
  | 80
  | 90
  | 100;

export type SkywardCrystalEyeBattleState = {
  kind: "skyward_crystal_eye";
  aimTicksRemaining: number;
  disruptionStacks: number;
  coreExposureTicksRemaining: number;
  artilleryCount: number;
  lastArtilleryStacks: number | null;
  lastArtilleryPowerPct: SkywardCrystalEyeArtilleryPowerPct | null;
  lastArtilleryDamage: number | null;
};

export type SkywardCrystalEyeArtilleryResult = {
  state: SkywardCrystalEyeBattleState;
  powerPct: SkywardCrystalEyeArtilleryPowerPct;
  coreExposed: boolean;
};

export type SkywardCrystalEyeArtilleryEvent = {
  tick: number;
  stacks: number;
  powerPct: SkywardCrystalEyeArtilleryPowerPct;
  basePowerPct: 180 | 210 | 240 | 270;
  damage: number;
  coreExposed: boolean;
};

const ARTILLERY_POWER_VALUES = new Set<number>([25, 50, 60, 70, 80, 90, 100]);

function finiteInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function initialSkywardCrystalEyeState(): SkywardCrystalEyeBattleState {
  return {
    kind: "skyward_crystal_eye",
    aimTicksRemaining: SKYWARD_CRYSTAL_EYE_AIM_TICKS,
    disruptionStacks: 0,
    coreExposureTicksRemaining: 0,
    artilleryCount: 0,
    lastArtilleryStacks: null,
    lastArtilleryPowerPct: null,
    lastArtilleryDamage: null,
  };
}

export function normalizeSkywardCrystalEyeState(
  raw: unknown,
): SkywardCrystalEyeBattleState {
  const fallback = initialSkywardCrystalEyeState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;
  if (source.kind !== "skyward_crystal_eye") return fallback;
  const lastPower = typeof source.lastArtilleryPowerPct === "number" &&
      ARTILLERY_POWER_VALUES.has(source.lastArtilleryPowerPct)
    ? source.lastArtilleryPowerPct as SkywardCrystalEyeArtilleryPowerPct
    : null;
  return {
    kind: "skyward_crystal_eye",
    aimTicksRemaining: finiteInteger(
      source.aimTicksRemaining,
      0,
      SKYWARD_CRYSTAL_EYE_AIM_TICKS,
      SKYWARD_CRYSTAL_EYE_AIM_TICKS,
    ),
    disruptionStacks: finiteInteger(
      source.disruptionStacks,
      0,
      SKYWARD_CRYSTAL_EYE_STACK_CAP,
      0,
    ),
    coreExposureTicksRemaining: finiteInteger(
      source.coreExposureTicksRemaining,
      0,
      SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
      0,
    ),
    artilleryCount: finiteInteger(
      source.artilleryCount,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    lastArtilleryStacks:
      typeof source.lastArtilleryStacks === "number" &&
        Number.isFinite(source.lastArtilleryStacks)
        ? finiteInteger(
            source.lastArtilleryStacks,
            0,
            SKYWARD_CRYSTAL_EYE_STACK_CAP,
            0,
          )
        : null,
    lastArtilleryPowerPct: lastPower,
    lastArtilleryDamage:
      typeof source.lastArtilleryDamage === "number" &&
        Number.isFinite(source.lastArtilleryDamage)
        ? finiteInteger(
            source.lastArtilleryDamage,
            0,
            Number.MAX_SAFE_INTEGER,
            0,
          )
        : null,
  };
}

export function addSkywardCrystalEyeHit(
  state: SkywardCrystalEyeBattleState,
  critical: boolean,
): SkywardCrystalEyeBattleState {
  return {
    ...state,
    disruptionStacks: Math.min(
      SKYWARD_CRYSTAL_EYE_STACK_CAP,
      state.disruptionStacks + (critical ? 2 : 1),
    ),
  };
}

export function advanceSkywardCrystalEyeTimers(
  state: SkywardCrystalEyeBattleState,
  elapsedTicks: number,
): SkywardCrystalEyeBattleState {
  const elapsed = finiteInteger(
    elapsedTicks,
    0,
    Number.MAX_SAFE_INTEGER,
    0,
  );
  return {
    ...state,
    aimTicksRemaining: Math.max(0, state.aimTicksRemaining - elapsed),
    coreExposureTicksRemaining: Math.max(
      0,
      state.coreExposureTicksRemaining - elapsed,
    ),
  };
}

export function skywardCrystalEyeArtilleryPowerPct(
  stacks: number,
): SkywardCrystalEyeArtilleryPowerPct {
  const scored = finiteInteger(
    stacks,
    0,
    SKYWARD_CRYSTAL_EYE_STACK_CAP,
    0,
  );
  if (scored >= 24) return 50;
  if (scored >= 20) return 50;
  if (scored >= 16) return 60;
  if (scored >= 12) return 70;
  if (scored >= 8) return 80;
  if (scored >= 4) return 90;
  return 100;
}

export function skywardCrystalEyeBasePowerPct(
  currentHp: number,
  maxHp: number,
): 180 | 210 | 240 | 270 {
  const max = Math.max(1, finiteInteger(
    maxHp,
    1,
    Number.MAX_SAFE_INTEGER,
    1,
  ));
  const hp = finiteInteger(currentHp, 0, max, 0);
  if (hp * 4 > max * 3) return 180;
  if (hp * 2 > max) return 210;
  if (hp * 4 > max) return 240;
  return 270;
}

export function fireSkywardCrystalEyeArtillery(
  state: SkywardCrystalEyeBattleState,
): SkywardCrystalEyeArtilleryResult {
  const powerPct = skywardCrystalEyeArtilleryPowerPct(
    state.disruptionStacks,
  );
  const coreExposed = state.disruptionStacks >= SKYWARD_CRYSTAL_EYE_STACK_CAP;
  return {
    powerPct,
    coreExposed,
    state: {
      ...state,
      aimTicksRemaining: SKYWARD_CRYSTAL_EYE_AIM_TICKS,
      disruptionStacks: 0,
      coreExposureTicksRemaining: coreExposed
        ? SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS
        : state.coreExposureTicksRemaining,
      artilleryCount: state.artilleryCount + 1,
      lastArtilleryStacks: state.disruptionStacks,
      lastArtilleryPowerPct: powerPct,
      lastArtilleryDamage: null,
    },
  };
}

export function skywardCrystalEyeResourceSnapshot(
  state: SkywardCrystalEyeBattleState,
): Record<string, number | string> {
  const snapshot: Record<string, number | string> = {
    crystalEyeAim: `${state.aimTicksRemaining}틱`,
    crystalEyeDisruption: `${state.disruptionStacks} / ${SKYWARD_CRYSTAL_EYE_STACK_CAP}`,
    crystalEyeArtillery: `${skywardCrystalEyeArtilleryPowerPct(state.disruptionStacks)}%`,
  };
  if (state.coreExposureTicksRemaining > 0) {
    snapshot.crystalEyeCore =
      `노출 ${state.coreExposureTicksRemaining}틱` +
      ` · 받는 피해 +${SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT}%`;
  }
  if (state.lastArtilleryPowerPct !== null) {
    snapshot.crystalEyeLastArtillery =
      `${state.lastArtilleryStacks ?? 0}중첩 · ${state.lastArtilleryPowerPct}%` +
      (state.lastArtilleryDamage !== null
        ? ` · ${state.lastArtilleryDamage.toLocaleString("ko-KR")} 피해`
        : "");
  }
  return snapshot;
}
