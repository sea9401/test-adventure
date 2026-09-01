import { describe, expect, it } from "vitest";

import {
  SKYWARD_CRYSTAL_EYE_AIM_TICKS,
  SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
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
      lastArtilleryPowerPct: null,
    });
  });

  it.each([
    [0, 100], [3, 100], [4, 90], [7, 90], [8, 80], [11, 80],
    [12, 70], [15, 70], [16, 60], [19, 60], [20, 50], [23, 50],
    [24, 25], [99, 25],
  ] as const)("maps %i disruption stacks to %i%% artillery", (stacks, power) => {
    expect(skywardCrystalEyeArtilleryPowerPct(stacks)).toBe(power);
  });

  it.each([
    [10_000_000, 180],
    [7_500_001, 180],
    [7_500_000, 210],
    [5_000_001, 210],
    [5_000_000, 240],
    [2_500_001, 240],
    [2_500_000, 270],
    [0, 270],
  ] as const)("maps %i current HP to a %i%% base coefficient", (hp, power) => {
    expect(skywardCrystalEyeBasePowerPct(hp, 10_000_000)).toBe(power);
  });

  it("counts each normal hit once and each critical hit twice without an action cap", () => {
    let state = initialSkywardCrystalEyeState();
    for (let hit = 0; hit < 12; hit += 1) {
      state = addSkywardCrystalEyeHit(state, true);
    }
    expect(state.disruptionStacks).toBe(24);
    expect(addSkywardCrystalEyeHit(state, false).disruptionStacks).toBe(24);
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

  it("fires mandatory 25% artillery and exposes the core at 24 stacks", () => {
    const result = fireSkywardCrystalEyeArtillery({
      ...initialSkywardCrystalEyeState(),
      aimTicksRemaining: 0,
      disruptionStacks: 24,
    });
    expect(result).toEqual({
      powerPct: 25,
      coreExposed: true,
      state: {
        kind: "skyward_crystal_eye",
        aimTicksRemaining: SKYWARD_CRYSTAL_EYE_AIM_TICKS,
        disruptionStacks: 0,
        coreExposureTicksRemaining: SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
        artilleryCount: 1,
        lastArtilleryPowerPct: 25,
      },
    });
  });

  it("fires weakened artillery without exposing the core below 24 stacks", () => {
    const result = fireSkywardCrystalEyeArtillery({
      ...initialSkywardCrystalEyeState(),
      disruptionStacks: 17,
      coreExposureTicksRemaining: 40,
      artilleryCount: 2,
    });
    expect(result).toMatchObject({
      powerPct: 60,
      coreExposed: false,
      state: {
        aimTicksRemaining: 900,
        disruptionStacks: 0,
        coreExposureTicksRemaining: 40,
        artilleryCount: 3,
        lastArtilleryPowerPct: 60,
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
      disruptionStacks: 24,
      coreExposureTicksRemaining: 0,
      artilleryCount: 0,
      lastArtilleryPowerPct: null,
    });
    expect(normalizeSkywardCrystalEyeState(undefined)).toEqual(
      initialSkywardCrystalEyeState(),
    );
  });

  it("formats replay resources from the normalized mechanic state", () => {
    expect(skywardCrystalEyeResourceSnapshot({
      ...initialSkywardCrystalEyeState(),
      aimTicksRemaining: 640,
      disruptionStacks: 17,
      coreExposureTicksRemaining: 180,
      lastArtilleryPowerPct: 70,
    })).toEqual({
      crystalEyeAim: "640틱",
      crystalEyeDisruption: "17 / 24",
      crystalEyeArtillery: "60%",
      crystalEyeCore: "노출 180틱 · 받는 피해 +25%",
      crystalEyeLastArtillery: "70%",
    });
  });
});
