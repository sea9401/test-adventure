import { describe, expect, it } from "vitest";

import {
  SKYWARD_CRYSTAL_EYE_AIM_TICKS,
  SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
  SKYWARD_CRYSTAL_EYE_STACK_CAP,
  addSkywardCrystalEyeHit,
  advanceSkywardCrystalEyeTimers,
  fireSkywardCrystalEyeArtillery,
  initialSkywardCrystalEyeState,
  normalizeSkywardCrystalEyeState,
  skywardCrystalEyeArtilleryPowerPct,
  skywardCrystalEyeBasePowerPct,
  skywardCrystalEyeResourceSnapshot,
} from "./skywardCrystalEyeMechanic";

describe("skyward crystal eye mechanic", () => {
  it("starts a fresh 900-tick aim with no disruption", () => {
    expect(initialSkywardCrystalEyeState()).toEqual({
      kind: "skyward_crystal_eye",
      aimTicksRemaining: SKYWARD_CRYSTAL_EYE_AIM_TICKS,
      disruptionStacks: 0,
      coreExposureTicksRemaining: 0,
      artilleryCount: 0,
      lastArtilleryStacks: null,
      lastArtilleryPowerPct: null,
      lastArtilleryDamage: null,
    });
  });

  it.each([
    [0, 100], [6, 100], [7, 90], [12, 90], [13, 80], [19, 80],
    [20, 70], [26, 70], [27, 60], [32, 60], [33, 50], [39, 50],
    [40, 50], [99, 50],
  ] as const)("maps %i disruption stacks to %i%% artillery", (stacks, power) => {
    expect(skywardCrystalEyeArtilleryPowerPct(stacks)).toBe(power);
  });

  it.each([
    [10_000_000, 330],
    [7_500_001, 330],
    [7_500_000, 390],
    [5_000_001, 390],
    [5_000_000, 450],
    [2_500_001, 450],
    [2_500_000, 510],
    [0, 510],
  ] as const)("maps %i current HP to a %i%% base coefficient", (hp, power) => {
    expect(skywardCrystalEyeBasePowerPct(hp, 10_000_000)).toBe(power);
  });

  it("counts each normal hit once and each critical hit twice without an action cap", () => {
    let state = initialSkywardCrystalEyeState();
    for (let hit = 0; hit < 20; hit += 1) {
      state = addSkywardCrystalEyeHit(state, true);
    }
    expect(state.disruptionStacks).toBe(40);
    expect(addSkywardCrystalEyeHit(state, false).disruptionStacks).toBe(40);
  });

  it("advances aim and exposure over the same elapsed time", () => {
    const state = {
      ...initialSkywardCrystalEyeState(),
      aimTicksRemaining: 640,
      coreExposureTicksRemaining: 180,
    };
    expect(advanceSkywardCrystalEyeTimers(state, 60)).toEqual({
      ...state,
      aimTicksRemaining: 580,
      coreExposureTicksRemaining: 120,
    });
  });

  it("fires mandatory 50% artillery and exposes the core at 40 stacks", () => {
    const result = fireSkywardCrystalEyeArtillery({
      ...initialSkywardCrystalEyeState(),
      aimTicksRemaining: 0,
      disruptionStacks: 40,
    });
    expect(result).toEqual({
      powerPct: 50,
      coreExposed: true,
      state: {
        kind: "skyward_crystal_eye",
        aimTicksRemaining: SKYWARD_CRYSTAL_EYE_AIM_TICKS,
        disruptionStacks: 0,
        coreExposureTicksRemaining: SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
        artilleryCount: 1,
        lastArtilleryStacks: 40,
        lastArtilleryPowerPct: 50,
        lastArtilleryDamage: null,
      },
    });
  });

  it("fires weakened artillery without exposing the core below 40 stacks", () => {
    const result = fireSkywardCrystalEyeArtillery({
      ...initialSkywardCrystalEyeState(),
      disruptionStacks: 39,
      coreExposureTicksRemaining: 40,
      artilleryCount: 2,
    });
    expect(result).toMatchObject({
      powerPct: 50,
      coreExposed: false,
      state: {
        aimTicksRemaining: 900,
        disruptionStacks: 0,
        coreExposureTicksRemaining: 40,
        artilleryCount: 3,
        lastArtilleryStacks: 39,
        lastArtilleryPowerPct: 50,
        lastArtilleryDamage: null,
      },
    });
  });

  it("normalizes corrupt state into finite bounded values", () => {
    expect(normalizeSkywardCrystalEyeState({
      kind: "skyward_crystal_eye",
      aimTicksRemaining: -20,
      disruptionStacks: 999,
      coreExposureTicksRemaining: Number.POSITIVE_INFINITY,
      artilleryCount: -4,
      lastArtilleryPowerPct: 65,
    })).toEqual({
      kind: "skyward_crystal_eye",
      aimTicksRemaining: 0,
      disruptionStacks: SKYWARD_CRYSTAL_EYE_STACK_CAP,
      coreExposureTicksRemaining: 0,
      artilleryCount: 0,
      lastArtilleryStacks: null,
      lastArtilleryPowerPct: null,
      lastArtilleryDamage: null,
    });
    expect(normalizeSkywardCrystalEyeState(undefined)).toEqual(
      initialSkywardCrystalEyeState(),
    );
  });

  it("preserves a historical 25% shot while projecting the next perfect shot at 50%", () => {
    const normalized = normalizeSkywardCrystalEyeState({
      kind: "skyward_crystal_eye",
      aimTicksRemaining: 225,
      disruptionStacks: 40,
      coreExposureTicksRemaining: 0,
      artilleryCount: 1,
      lastArtilleryStacks: 40,
      lastArtilleryPowerPct: 25,
      lastArtilleryDamage: 31,
    });

    expect(skywardCrystalEyeResourceSnapshot(normalized)).toMatchObject({
      crystalEyeArtillery: "50%",
      crystalEyeLastArtillery: "40중첩 · 25% · 31 피해",
    });
  });

  it("formats replay resources from the normalized mechanic state", () => {
    expect(skywardCrystalEyeResourceSnapshot({
      ...initialSkywardCrystalEyeState(),
      aimTicksRemaining: 640,
      disruptionStacks: 17,
      coreExposureTicksRemaining: 180,
      lastArtilleryPowerPct: 70,
      lastArtilleryStacks: 12,
      lastArtilleryDamage: 1234,
    })).toEqual({
      crystalEyeAim: "640틱",
      crystalEyeDisruption: "17 / 40",
      crystalEyeArtillery: "80%",
      crystalEyeCore: "노출 180틱 · 받는 피해 +25%",
      crystalEyeLastArtillery: "12중첩 · 70% · 1,234 피해",
    });
  });
});
