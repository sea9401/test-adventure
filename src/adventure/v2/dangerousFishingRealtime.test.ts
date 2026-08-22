import { describe, expect, it, vi } from "vitest";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { V2_FISHING_JOB_IDS } from "@/adventure/data/v2/v2JobCatalog";
import {
  DANGEROUS_BAITS,
  DANGEROUS_BOSSES,
  DANGEROUS_DEPTHS,
  DANGEROUS_FISH,
  DANGEROUS_ZONES,
  type DangerousBaitId,
  type DangerousBoss,
  type DangerousFish,
  type DangerousFishBehavior,
} from "@/adventure/data/v2/dangerousFishing";
import {
  dangerousFishingEncounterModifiers,
  dangerousFishingHeritage,
  dangerousFishingRealtimeProjection,
} from "./dangerousFishingHeritage";
import {
  emptyFishingProgression,
  fishingLevelXpThreshold,
} from "./fishingProgression";
import {
  dangerousRealtimeLevelBonuses,
  dangerousRealtimeModifiers,
} from "./dangerousFishingRealtimeModifiers";
import {
  DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS,
  DANGEROUS_REALTIME_TELEGRAPH_TICKS,
  DANGEROUS_REALTIME_TICK_MS,
  advanceDangerousRealtimeTick,
  createDangerousRealtimeState,
  dangerousRealtimeTargetCalibration,
  dangerousRealtimeMinimumCatchTick,
  dangerousRealtimePerformanceScalePermille,
  dangerousRealtimeTargetTicks,
  dangerousRealtimeView,
  replayDangerousRealtimeInputs,
  validateDangerousRealtimeInputs,
  type DangerousRealtimeConfig,
  type DangerousRealtimeState,
} from "./dangerousFishingRealtime";
import * as dangerousRealtimeEngine from "./dangerousFishingRealtime";

function fixtureRealtimeConfig(
  patch: Partial<DangerousRealtimeConfig> = {},
): DangerousRealtimeConfig {
  const seed = patch.seed ?? 7_123;
  const targetKind = patch.targetKind ?? "fish";
  const rarity = patch.rarity ?? "common";
  const targetTicks = dangerousRealtimeTargetTicks({
    seed,
    targetKind,
    rarity,
  });

  return {
    seed,
    risk: 3,
    targetKind,
    rarity,
    behaviorPattern: ["charge", "thrash", "turn", "dive"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: 10_000,
    initialDistance: 10_000,
    maxTicks: targetTicks * 2,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "basic_bait",
    }),
    ...patch,
  };
}

function activeBehaviorState(
  behavior: DangerousFishBehavior,
  config: DangerousRealtimeConfig,
  patch: Partial<DangerousRealtimeState> = {},
): DangerousRealtimeState {
  return {
    ...createDangerousRealtimeState(config),
    behavior,
    phase: "active",
    phaseTicksRemaining: 8,
    tension: 500,
    stamina: 10_000,
    distance: 10_000,
    lowTensionTicks: 0,
    ...patch,
  };
}

type ResponsivePolicy = {
  safeTensionMin: number;
  safeTensionMax: number;
};

function productionResponsivePolicy(
  config: DangerousRealtimeConfig,
): ResponsivePolicy {
  const view = dangerousRealtimeView(
    createDangerousRealtimeState(config),
    config,
  );
  return {
    safeTensionMin: view.safeTensionMin,
    safeTensionMax: view.safeTensionMax,
  };
}

function playResponsiveTrace(
  config: DangerousRealtimeConfig,
  policy: ResponsivePolicy = productionResponsivePolicy(config),
) {
  let state = createDangerousRealtimeState(config);
  const inputs: { tick: number; mode: "reel" | "release" }[] = [];
  let securedTick: number | null = null;
  while (state.status === "active") {
    const view = dangerousRealtimeView(state, config);
    const dangerousBehavior =
      (view.phase === "telegraph" || view.phase === "active") &&
      (view.behavior === "charge" || view.behavior === "dive");
    const mode =
      state.tension <= policy.safeTensionMin + 80
        ? "reel"
        : state.tension >= policy.safeTensionMax - 80 || dangerousBehavior
          ? "release"
          : "reel";
    if (mode !== state.mode) inputs.push({ tick: state.tick, mode });
    state = advanceDangerousRealtimeTick(state, config, mode);
    if (
      securedTick === null &&
      state.status === "active" &&
      state.stamina === 0 &&
      state.distance === 0
    ) {
      securedTick = state.tick;
    }
  }
  return {
    inputs,
    securedTick,
    state: replayDangerousRealtimeInputs(config, inputs, state.tick),
  };
}

function playResponsive(config: DangerousRealtimeConfig): DangerousRealtimeState {
  return playResponsiveTrace(config).state;
}

const PRODUCTION_DURATION_SEEDS = [
  // Representative seeds retained from the original calibration suite.
  1, 3, 20, 32, 56, 68, 94, 124, 186, 200,
  // Prior extremes found by the full 0..2047 production diagnostic.
  0, 2, 5, 36, 45, 51, 89, 143, 169, 543, 606, 671, 705, 866, 893, 1_235, 1_308,
  1_595, 1_621, 1_818, 1_892, 1_895,
] as const;

function productionConfig(
  target: DangerousFish | DangerousBoss,
  seed: number,
  modifiers = dangerousRealtimeModifiers({
    fishingLevel: 50,
    baitId: "basic_bait",
  }),
  maxTensionBonus = 0,
  riskOverride?: number,
): DangerousRealtimeConfig {
  let targetKind: DangerousRealtimeConfig["targetKind"];
  let rarity: DangerousRealtimeConfig["rarity"];
  let risk: number;
  let stamina: number;
  let distance: number;
  if ("rarity" in target) {
    targetKind = "fish";
    rarity = target.rarity;
    risk = Math.min(
      5,
      DANGEROUS_ZONES[target.zoneId].baseRisk +
        DANGEROUS_DEPTHS[target.depthId].riskBonus,
    );
    stamina = target.stamina;
    distance = target.distance;
  } else {
    targetKind = "boss";
    rarity = "boss";
    risk = target.minRisk;
    stamina = target.attemptStamina;
    distance = target.attemptDistance;
  }
  const targetCalibration = dangerousRealtimeTargetCalibration({
    stamina,
    distance,
    baseTension: target.baseTension,
    maxTensionBonus,
  });
  const configBase: DangerousRealtimeConfig = {
    seed,
    risk: riskOverride ?? risk,
    targetKind,
    rarity,
    behaviorPattern: [...target.behaviorPattern],
    ...targetCalibration,
    maxTicks: 0,
    modifiers,
  };
  return {
    ...configBase,
    maxTicks: dangerousRealtimeTargetTicks(configBase) * 2,
  };
}

function productionCases() {
  return [
    ...Object.values(DANGEROUS_FISH).map((target) => ({
      id: target.id,
      target,
      range: target.rarity === "common"
        ? [160, 300] as const
        : target.rarity === "legendary"
          ? [360, 500] as const
          : [240, 400] as const,
    })),
    ...Object.values(DANGEROUS_BOSSES).map((target) => ({
      id: target.id,
      target,
      range: [500, 800] as const,
    })),
  ];
}

function heritageAt(args: {
  fishingLevel: number;
  lineageIndex: number;
  equippedSkillIds: readonly string[];
}) {
  return dangerousFishingHeritage({
    fishingProgression: {
      ...emptyFishingProgression(),
      xp: fishingLevelXpThreshold(args.fishingLevel),
    },
    proficiency: {
      ...emptyProficiency(),
      jobHistory:
        args.lineageIndex < 0
          ? []
          : [V2_FISHING_JOB_IDS[args.lineageIndex]],
    },
    currentJobId: "mage",
    equippedSkillIds: args.equippedSkillIds,
  });
}

function reachablePerformanceCase(args: {
  loadoutCase: {
    fishingLevel: number;
    projection: ReturnType<typeof dangerousFishingRealtimeProjection>;
    label: string;
  };
  baitId: DangerousBaitId;
  rodEnhancementLevel: number;
  reelEnhancementLevel: number;
  lineEnhancementLevel: number;
}) {
  const projection = args.loadoutCase.projection;
  const modifiers = dangerousRealtimeModifiers({
    fishingLevel: args.loadoutCase.fishingLevel,
    baitId: args.baitId,
    reelPowerBonus: projection.reelPowerBonus,
    staminaDamageBonus: projection.staminaDamageBonus,
    tensionControlBonus: projection.tensionControlBonus,
    slackTolerance: projection.slackTolerance,
    telegraphSteps: projection.telegraphSteps,
    rodEnhancementLevel: args.rodEnhancementLevel,
    reelEnhancementLevel: args.reelEnhancementLevel,
    lineEnhancementLevel: args.lineEnhancementLevel,
    cargoProtectionPct: projection.cargoProtectionPct,
  });
  const label = [
    args.loadoutCase.label,
    `rod+${args.rodEnhancementLevel}`,
    `reel+${args.reelEnhancementLevel}`,
    `line+${args.lineEnhancementLevel}`,
    args.baitId,
  ].join("/");
  return {
    label,
    maxTensionBonus: projection.maxTensionBonus,
    modifiers,
  };
}

function simulationRelevantProjectionKey(
  reachable: ReturnType<typeof reachablePerformanceCase>,
) {
  const scale = dangerousRealtimePerformanceScalePermille(
    reachable.modifiers,
  );
  const scaled = (value: number) => Math.floor((Math.max(0, value) * scale) / 1_000);
  const bait = reachable.modifiers.baitEffect;
  return JSON.stringify({
    maxTension: dangerousRealtimeTargetCalibration({
      stamina: 1,
      distance: 1,
      baseTension: 0,
      maxTensionBonus: reachable.maxTensionBonus,
    }).maxTension,
    scale,
    reelEfficiencyPct: scaled(reachable.modifiers.reelEfficiencyPct),
    tensionControlPct: scaled(reachable.modifiers.tensionControlPct),
    safeZoneBonusPct: scaled(reachable.modifiers.safeZoneBonusPct),
    staminaDamagePct: scaled(reachable.modifiers.staminaDamagePct),
    distanceRecoveryPct: scaled(reachable.modifiers.distanceRecoveryPct),
    lowTensionGraceTicks: reachable.modifiers.lowTensionGraceTicks,
    baitEffect: {
      turnDistanceRecoveryReductionPct: scaled(
        bait.turnDistanceRecoveryReductionPct,
      ),
      turnTensionImpactReductionPct: scaled(
        bait.turnTensionImpactReductionPct,
      ),
      chargeAndThrashStaminaDamagePct: scaled(
        bait.chargeAndThrashStaminaDamagePct,
      ),
      diveSpeedReductionPct: scaled(bait.diveSpeedReductionPct),
      startingStaminaReductionPct: scaled(
        bait.startingStaminaReductionPct,
      ),
      tensionImpulseReductionPct: scaled(bait.tensionImpulseReductionPct),
    },
  });
}

describe("위험 해역 50ms 결정론 시뮬레이션", () => {
  it("같은 시드와 입력 기록은 Math.random 없이 바이트 단위로 같은 상태를 만든다", () => {
    const config = fixtureRealtimeConfig({ seed: 7_123, risk: 3 });
    const inputs = [
      { tick: 0, mode: "release" as const },
      { tick: 14, mode: "reel" as const },
      { tick: 67, mode: "release" as const },
    ];
    const random = vi
      .spyOn(Math, "random")
      .mockImplementation(() => {
        throw new Error("replay must not call Math.random");
      });

    try {
      const complete = replayDangerousRealtimeInputs(config, inputs, 90);
      expect(complete).toEqual(
        replayDangerousRealtimeInputs(config, inputs, 90),
      );

      const checkpoint = replayDangerousRealtimeInputs(
        config,
        inputs.slice(0, 2),
        14,
      );
      expect(
        replayDangerousRealtimeInputs(config, inputs.slice(2), 90, checkpoint),
      ).toEqual(complete);
    } finally {
      random.mockRestore();
    }
  });

  it("50ms 한 틱에서 감기는 체력과 거리를 줄이고 풀기는 장력을 낮춰 거리를 내준다", () => {
    const config = fixtureRealtimeConfig({ behaviorPattern: ["turn"] });
    const initial = activeBehaviorState("turn", config);
    const reeled = advanceDangerousRealtimeTick(initial, config, "reel");
    const released = advanceDangerousRealtimeTick(initial, config, "release");

    expect(DANGEROUS_REALTIME_TICK_MS).toBe(50);
    expect(reeled.stamina).toBeLessThan(initial.stamina);
    expect(reeled.distance).toBeLessThan(initial.distance);
    expect(reeled.tension).toBeGreaterThan(initial.tension);
    expect(released.tension).toBeLessThan(initial.tension);
    expect(released.distance).toBeGreaterThan(initial.distance);
    expect(
      Object.values(reeled)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isInteger),
    ).toBe(true);
  });

  it("장력이 1000을 넘으면 다음 입력에서 즉시 줄이 끊어진다", () => {
    const config = fixtureRealtimeConfig();
    const state = activeBehaviorState("charge", config, { tension: 1_001 });

    expect(advanceDangerousRealtimeTick(state, config, "reel").status).toBe(
      "line_broken",
    );
  });

  it("안전 구간 아래 장력은 정확히 1초 동안 허용한 뒤 훅을 놓친다", () => {
    const config = fixtureRealtimeConfig();
    const state = activeBehaviorState("turn", config, {
      tension: 0,
      lowTensionTicks: DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS - 2,
    });
    const grace = advanceDangerousRealtimeTick(state, config, "release");
    const lost = advanceDangerousRealtimeTick(grace, config, "release");

    expect(DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS).toBe(20);
    expect(grace.status).toBe("active");
    expect(lost.status).toBe("hook_lost");
  });

  it("기존 slackTolerance 한 점은 저장력 유예를 정확히 1초 더한다", () => {
    const config = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "basic_bait",
        slackTolerance: 1,
      }),
    });
    let state = createDangerousRealtimeState(config);
    state = { ...state, tension: 0 };
    for (let tick = 0; tick < 39; tick += 1) {
      state = advanceDangerousRealtimeTick(state, config, "reel");
      state = { ...state, tension: 0 };
    }
    expect(state.status).toBe("active");
    state = advanceDangerousRealtimeTick(state, config, "reel");
    expect(state.status).toBe("hook_lost");
  });

  it("charge, thrash, turn, dive가 서로 다른 장력·체력·거리 곡선을 만든다", () => {
    const config = fixtureRealtimeConfig();
    const transitions = (["charge", "thrash", "turn", "dive"] as const).map(
      (behavior) => {
        const state = activeBehaviorState(behavior, config);
        const next = advanceDangerousRealtimeTick(state, config, "reel");
        return [next.tension, next.stamina, next.distance];
      },
    );

    expect(new Set(transitions.map((value) => value.join(":"))).size).toBe(4);
    expect(transitions[0][0]).toBeGreaterThan(transitions[2][0]);
    expect(transitions[1][1]).toBeLessThan(transitions[3][1]);
    expect(transitions[2][2]).toBeLessThan(transitions[3][2]);
  });

  it("위험도는 행동 간격을 줄이고 연계와 장력 충격을 늘린다", () => {
    const safeConfig = fixtureRealtimeConfig({ risk: 0 });
    const riskyConfig = fixtureRealtimeConfig({ risk: 5 });
    const safeCharge = advanceDangerousRealtimeTick(
      activeBehaviorState("charge", safeConfig),
      safeConfig,
      "reel",
    );
    const riskyCharge = advanceDangerousRealtimeTick(
      activeBehaviorState("charge", riskyConfig),
      riskyConfig,
      "reel",
    );
    const safeRest = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", safeConfig, {
        phaseTicksRemaining: 1,
        chainRemaining: 0,
      }),
      safeConfig,
      "release",
    );
    const riskyRest = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", riskyConfig, {
        phaseTicksRemaining: 1,
        chainRemaining: 0,
      }),
      riskyConfig,
      "release",
    );
    const riskyChains = Array.from({ length: 32 }, (_, seed) =>
      createDangerousRealtimeState(
        fixtureRealtimeConfig({ seed, risk: 5 }),
      ).chainRemaining,
    );

    expect(riskyCharge.tension).toBeGreaterThan(safeCharge.tension);
    expect(safeRest.phaseTicksRemaining).toBe(32);
    expect(riskyRest.phaseTicksRemaining).toBe(19);
    expect(createDangerousRealtimeState(safeConfig).chainRemaining).toBe(0);
    expect(Math.max(...riskyChains)).toBe(2);
  });

  it("모든 실제 행동은 5틱 이상의 진짜 전조 뒤에 그대로 시작한다", () => {
    expect(DANGEROUS_REALTIME_TELEGRAPH_TICKS).toBe(5);
    for (const behavior of ["charge", "thrash", "turn", "dive"] as const) {
      const config = fixtureRealtimeConfig({
        seed: 31,
        risk: 5,
        behaviorPattern: [behavior],
      });
      let state = createDangerousRealtimeState(config);
      const warned = dangerousRealtimeView(state, config);

      expect(warned.phase).toBe("telegraph");
      expect(warned.telegraphs).toEqual([behavior]);

      for (let tick = 0; tick < DANGEROUS_REALTIME_TELEGRAPH_TICKS; tick += 1) {
        state = advanceDangerousRealtimeTick(state, config, "reel");
      }

      expect(dangerousRealtimeView(state, config)).toMatchObject({
        phase: "active",
        behavior,
      });
    }
  });

  it("발광 미끼가 미리 공개한 다음 행동은 이후 실제 전조와 일치한다", () => {
    const config = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "luminous_bait",
      }),
    });
    let state = activeBehaviorState("turn", config, {
      phaseTicksRemaining: 1,
    });
    const revealed = dangerousRealtimeView(state, config).telegraphs[0];

    state = advanceDangerousRealtimeTick(state, config, "release");
    while (state.phase === "idle") {
      state = advanceDangerousRealtimeTick(state, config, "reel");
    }

    expect(revealed).toBeDefined();
    const nextView = dangerousRealtimeView(state, config);
    expect(nextView).toMatchObject({
      phase: "telegraph",
      behavior: revealed,
    });
    expect(nextView.telegraphs[0]).toBe(revealed);
  });

  it("계보 전조와 발광 미끼는 실제 행동 순서의 다음 둘을 함께 미리 보여준다", () => {
    const config = fixtureRealtimeConfig({
      behaviorPattern: ["charge", "thrash", "turn", "dive"],
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "luminous_bait",
        telegraphSteps: 1,
      }),
    });
    const state = createDangerousRealtimeState(config);
    const pattern = config.behaviorPattern;

    expect(dangerousRealtimeView(state, config).telegraphs).toEqual([
      state.behavior,
      pattern[(state.behaviorCursor + 1) % pattern.length],
      pattern[(state.behaviorCursor + 2) % pattern.length],
    ]);
  });

  it("생산 대상의 체력·거리는 총 작업량을 부풀리지 않고 비율만 보존하며 시작 장력은 baseTension의 10배다", () => {
    expect(
      dangerousRealtimeTargetCalibration({
        stamina: DANGEROUS_FISH.ironjaw_tuna.stamina,
        distance: DANGEROUS_FISH.ironjaw_tuna.distance,
        baseTension: DANGEROUS_FISH.ironjaw_tuna.baseTension,
        maxTensionBonus: 0,
      }),
    ).toEqual({
      initialTension: 420,
      maxTension: 1_000,
      initialStamina: 10_645,
      initialDistance: 9_355,
    });
    expect(
      dangerousRealtimeTargetCalibration({
        stamina: DANGEROUS_FISH.abyssal_crownfish.stamina,
        distance: DANGEROUS_FISH.abyssal_crownfish.distance,
        baseTension: DANGEROUS_FISH.abyssal_crownfish.baseTension,
        maxTensionBonus: 26,
      }),
    ).toEqual({
      initialTension: 620,
      maxTension: 1_260,
      initialStamina: 11_506,
      initialDistance: 8_494,
    });
    const boss = dangerousRealtimeTargetCalibration({
      stamina: DANGEROUS_BOSSES.tidal_colossus.attemptStamina,
      distance: DANGEROUS_BOSSES.tidal_colossus.attemptDistance,
      baseTension: DANGEROUS_BOSSES.tidal_colossus.baseTension,
      maxTensionBonus: 0,
    });
    expect(boss).toEqual({
      initialTension: 580,
      maxTension: 1_000,
      initialStamina: 12_307,
      initialDistance: 7_693,
    });
    expect(boss.initialStamina + boss.initialDistance).toBe(20_000);
    const maxTensions = [0, 12, 26, 31].map(
      (maxTensionBonus) =>
        dangerousRealtimeTargetCalibration({
          stamina: 100,
          distance: 100,
          baseTension: 40,
          maxTensionBonus,
        }).maxTension,
    );
    expect(maxTensions).toEqual([1_000, 1_120, 1_260, 1_310]);
    const revision2MaxTensions = [0, 12, 26, 31].map(
      (maxTensionBonus) =>
        dangerousRealtimeTargetCalibration(
          {
            stamina: 100,
            distance: 100,
            baseTension: 40,
            maxTensionBonus,
          },
          2,
        ).maxTension,
    );
    expect(revision2MaxTensions).toEqual([1_000, 1_050, 1_110, 1_140]);
  });

  it("미끼의 raw 필드는 각 행동에만 적용된다", () => {
    const basic = fixtureRealtimeConfig();
    const reef = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "reef_bait",
      }),
    });
    const blood = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "blood_bait",
      }),
    });
    const luminous = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "luminous_bait",
      }),
    });
    const abyss = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "abyss_bait",
      }),
    });

    const basicTurn = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", basic),
      basic,
      "release",
    );
    const reefTurn = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", reef),
      reef,
      "release",
    );
    expect(reefTurn.distance).toBeLessThan(basicTurn.distance);
    expect(reefTurn.tension).toBeLessThan(basicTurn.tension);

    const basicCharge = advanceDangerousRealtimeTick(
      activeBehaviorState("charge", basic),
      basic,
      "reel",
    );
    const bloodCharge = advanceDangerousRealtimeTick(
      activeBehaviorState("charge", blood),
      blood,
      "reel",
    );
    expect(bloodCharge.stamina).toBeLessThan(basicCharge.stamina);

    const basicDive = advanceDangerousRealtimeTick(
      activeBehaviorState("dive", basic),
      basic,
      "release",
    );
    const luminousDive = advanceDangerousRealtimeTick(
      activeBehaviorState("dive", luminous),
      luminous,
      "release",
    );
    expect(luminousDive.distance).toBeLessThan(basicDive.distance);

    const abyssStart = createDangerousRealtimeState(abyss);
    const basicStart = createDangerousRealtimeState(basic);
    expect(abyssStart).toMatchObject({ stamina: 9_000, maxStamina: 10_000 });
    const basicTurnReel = advanceDangerousRealtimeTick(
      {
        ...basicStart,
        behavior: "turn",
        phase: "active",
        phaseTicksRemaining: 8,
      },
      basic,
      "reel",
    );
    const abyssTurnReel = advanceDangerousRealtimeTick(
      {
        ...abyssStart,
        behavior: "turn",
        phase: "active",
        phaseTicksRemaining: 8,
      },
      abyss,
      "reel",
    );
    expect(abyssStart.stamina - abyssTurnReel.stamina).toBe(
      basicStart.stamina - basicTurnReel.stamina,
    );
    const abyssCharge = advanceDangerousRealtimeTick(
      activeBehaviorState("charge", abyss),
      abyss,
      "reel",
    );
    expect(abyssCharge.tension).toBeLessThan(basicCharge.tension);
  });

  it("체력과 거리가 같은 틱에 0이면 어획하고 제한 틱에는 timeout 처리한다", () => {
    const config = fixtureRealtimeConfig();
    const minimumCatchTick = dangerousRealtimeMinimumCatchTick(
      dangerousRealtimeTargetTicks(config),
    );
    const caught = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", config, {
        tick: minimumCatchTick - 1,
        stamina: 1,
        distance: 1,
      }),
      config,
      "reel",
    );
    const timedOut = advanceDangerousRealtimeTick(
      activeBehaviorState("turn", config, { tick: config.maxTicks - 1 }),
      config,
      "release",
    );

    expect(caught.status).toBe("caught");
    expect(timedOut.status).toBe("timeout");
  });

  it("current balance는 모든 projection에 공통인 관측 시간 floor 전에 caught를 허용하지 않고 legacy는 기존 의미를 유지한다", () => {
    const config = fixtureRealtimeConfig();
    const state = createDangerousRealtimeState(config);
    const durationFloor = dangerousRealtimeMinimumCatchTick(state.targetTicks);
    const almostFinished = {
      ...state,
      tick: durationFloor - 2,
      tension: 500,
      stamina: 1,
      distance: 1,
      phase: "active" as const,
      phaseTicksRemaining: 8,
      behavior: "turn" as const,
    };

    const guarded = advanceDangerousRealtimeTick(
      almostFinished,
      config,
      "reel",
    );
    expect(guarded).toMatchObject({
      tick: durationFloor - 1,
      status: "active",
      stamina: 0,
      distance: 0,
    });
    expect(advanceDangerousRealtimeTick(guarded, config, "reel")).toMatchObject({
      tick: durationFloor,
      status: "caught",
    });

    const advanceLegacy = advanceDangerousRealtimeTick as unknown as (
      state: DangerousRealtimeState,
      config: DangerousRealtimeConfig,
      mode: "reel" | "release",
      balanceRevision: 1,
    ) => DangerousRealtimeState;
    expect(advanceLegacy(almostFinished, config, "reel", 1)).toMatchObject({
      tick: durationFloor - 1,
      status: "caught",
    });
  });

  it("floor의 고장력 확보 상태는 revision 4에서 끊어지고 revision 3 재생은 기존 포획을 보존한다", () => {
    const config = fixtureRealtimeConfig({ seed: 7, rarity: "common" });
    const pending = activeBehaviorState("turn", config, {
      tick: 179,
      tension: 996,
      stamina: 0,
      distance: 0,
    });

    expect(advanceDangerousRealtimeTick(pending, config, "reel")).toMatchObject({
      tick: 180,
      status: "line_broken",
      tension: 1_004,
      stamina: 0,
      distance: 0,
    });
    expect(
      advanceDangerousRealtimeTick(pending, config, "release"),
    ).toMatchObject({
      tick: 180,
      status: "active",
      tension: 980,
      stamina: 0,
      distance: 0,
    });
    expect(
      advanceDangerousRealtimeTick(pending, config, "reel", 3),
    ).toMatchObject({
      tick: 180,
      status: "caught",
      tension: 996,
      stamina: 0,
      distance: 0,
    });
  });

  it("revision 3의 확보 동결을 보존하고 revision 4는 floor 전에도 장력 실패를 판정한다", () => {
    const config = fixtureRealtimeConfig({ seed: 7, rarity: "common" });
    const pending = activeBehaviorState("turn", config, {
      tick: 177,
      tension: 1,
      stamina: 0,
      distance: 0,
      lowTensionTicks: DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS - 1,
    });

    for (const mode of ["reel", "release"] as const) {
      expect(advanceDangerousRealtimeTick(pending, config, mode, 3)).toMatchObject({
        tick: 178,
        mode,
        status: "active",
        tension: 1,
        stamina: 0,
        distance: 0,
        lowTensionTicks: DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS - 1,
      });
      expect(advanceDangerousRealtimeTick(pending, config, mode)).toMatchObject({
        tick: 178,
        mode,
        status: "hook_lost",
        stamina: 0,
        distance: 0,
        lowTensionTicks: DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS,
      });
    }
  });

  it("revision 4 확보 대기는 split replay를 보존하고 legacy는 즉시 포획한다", () => {
    const config = fixtureRealtimeConfig({ seed: 7, rarity: "common" });
    const pending = activeBehaviorState("turn", config, {
      tick: 177,
      tension: 500,
      stamina: 0,
      distance: 0,
    });
    const inputs = [
      { tick: 177, mode: "release" as const },
      { tick: 178, mode: "reel" as const },
      { tick: 179, mode: "release" as const },
    ];

    const complete = replayDangerousRealtimeInputs(
      config,
      inputs,
      180,
      pending,
    );
    const checkpoint = replayDangerousRealtimeInputs(
      config,
      inputs.slice(0, 2),
      179,
      pending,
    );
    expect(
      replayDangerousRealtimeInputs(
        config,
        inputs.slice(2),
        180,
        checkpoint,
      ),
    ).toEqual(complete);
    expect(complete).toMatchObject({
      tick: 180,
      mode: "release",
      status: "caught",
      stamina: 0,
      distance: 0,
    });
    expect(complete.tension).toBeLessThan(500);
    expect(
      replayDangerousRealtimeInputs(config, [], 178, pending, 1),
    ).toMatchObject({
      tick: 178,
      status: "caught",
      tension: 500,
      stamina: 0,
      distance: 0,
    });
  });

  it("시드로 정한 목표 시간은 등급별 승인 구간 안이고 timeout은 그 두 배다", () => {
    const cases = [
      { targetKind: "fish" as const, rarity: "common" as const, range: [160, 300] },
      { targetKind: "fish" as const, rarity: "rare" as const, range: [240, 400] },
      { targetKind: "fish" as const, rarity: "epic" as const, range: [240, 400] },
      { targetKind: "fish" as const, rarity: "legendary" as const, range: [360, 500] },
      { targetKind: "boss" as const, rarity: "boss" as const, range: [500, 800] },
    ];

    for (const item of cases) {
      for (const seed of [0, 1, 7_123, 0x7fffffff]) {
        const targetTicks = dangerousRealtimeTargetTicks({
          seed,
          targetKind: item.targetKind,
          rarity: item.rarity,
        });
        expect(targetTicks).toBeGreaterThanOrEqual(item.range[0]);
        expect(targetTicks).toBeLessThanOrEqual(item.range[1]);
        expect(
          fixtureRealtimeConfig({
            seed,
            targetKind: item.targetKind,
            rarity: item.rarity,
          }).maxTicks,
        ).toBe(targetTicks * 2);
      }
    }
  });

  it("모든 생산 어종·거대어 패턴은 각 도달 위험도와 대표·극단 시드에서 정확한 시간대에 포획된다", () => {
    const reachedRisks = new Set<number>();
    for (const item of productionCases()) {
      const initialRisk =
        "rarity" in item.target
          ? Math.max(
              0,
              Math.min(
                5,
                DANGEROUS_ZONES[item.target.zoneId].baseRisk +
                  DANGEROUS_DEPTHS[item.target.depthId].riskBonus,
              ),
            )
          : item.target.minRisk;
      const risks =
        "rarity" in item.target
          ? Array.from({ length: 6 - initialRisk }, (_, index) => initialRisk + index)
          : [initialRisk];
      for (const risk of risks) {
        for (const seed of PRODUCTION_DURATION_SEEDS) {
          const config = productionConfig(
            item.target,
            seed,
            undefined,
            0,
            risk,
          );
          reachedRisks.add(config.risk);
          const failure = `${item.id}/risk${config.risk}/seed${seed}/projection=baseline`;
          const outcome = playResponsive(config);
          expect(
            outcome.tick,
            `${failure}/duration-floor`,
          ).toBeGreaterThanOrEqual(
            dangerousRealtimeMinimumCatchTick(outcome.targetTicks),
          );
          expect(outcome.status, failure).toBe("caught");
          expect(outcome.tick, failure).toBeGreaterThanOrEqual(item.range[0]);
          expect(outcome.tick, failure).toBeLessThanOrEqual(item.range[1]);
          if (item.id === "abyssal_crownfish") {
            expect(config.risk).toBe(5);
            expect(outcome.tick, failure).toBeLessThanOrEqual(500);
          }
        }
      }
    }
    expect([...reachedRisks].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  }, 30_000);

  it("위험도 1 이상은 최대 보정에서도 계속 당기기만 해서는 포획되지 않는다", () => {
    const modifiers = dangerousRealtimeModifiers({
      fishingLevel: 100,
      baitId: "abyss_bait",
      reelPowerBonus: 7,
      staminaDamageBonus: 12,
      tensionControlBonus: 5,
      slackTolerance: 1,
      telegraphSteps: 1,
      rodEnhancementLevel: 3,
      reelEnhancementLevel: 3,
      lineEnhancementLevel: 3,
    });

    for (const item of productionCases()) {
      for (let seed = 0; seed < 128; seed += 1) {
        const config = productionConfig(
          item.target,
          seed,
          modifiers,
          31,
        );
        if (config.risk === 0) continue;

        let state = createDangerousRealtimeState(config);
        while (state.status === "active") {
          state = advanceDangerousRealtimeTick(state, config, "reel");
        }

        expect(
          state.status,
          `${item.id}/risk${config.risk}/seed${seed}`,
        ).toBe("line_broken");
      }
    }
  }, 10_000);

  it("공허지느러미 실러캔스의 부분 장비 반례도 기본 시간의 65% 이상을 유지한다", () => {
    const target = DANGEROUS_FISH.voidfin_coelacanth;
    const seed = 169;
    const baseline = playResponsive(productionConfig(target, seed));
    const heritageCase = {
      heritage: heritageAt({
        fishingLevel: 100,
        lineageIndex: V2_FISHING_JOB_IDS.indexOf("seagod"),
        equippedSkillIds: [
          "v2c_masterangler_bigcatchsense",
          "v2c_fullcatchking_bountyhaul",
        ],
      }),
      label: "level100/seagod/inherited-assistance",
    };
    const loadoutCase = {
      fishingLevel: heritageCase.heritage.fishingLevel,
      projection: dangerousFishingRealtimeProjection(
        dangerousFishingEncounterModifiers(heritageCase.heritage, {
          rodId: "leviathan_rod",
          reelId: "starter_reel",
          lineId: "abyss_chain_line",
        }),
      ),
      label: `${heritageCase.label}/leviathan_rod/starter_reel/abyss_chain_line`,
    };
    const projected = reachablePerformanceCase({
      loadoutCase,
      baitId: "abyss_bait",
      rodEnhancementLevel: 2,
      reelEnhancementLevel: 0,
      lineEnhancementLevel: 0,
    });
    const outcome = playResponsive(
      productionConfig(
        target,
        seed,
        projected.modifiers,
        projected.maxTensionBonus,
      ),
    );
    const failure = `${target.id}/${projected.label}/risk4/seed${seed}`;

    expect(baseline.tick).toBe(312);
    expect(outcome.status, failure).toBe("caught");
    expect(outcome.tick, failure).toBeGreaterThanOrEqual(
      Math.ceil((baseline.tick * 650) / 1_000),
    );
    expect(projected.modifiers.timeReductionPct, failure).toBeLessThanOrEqual(
      35,
    );
  });

  it("공허지느러미 seed 169 최대 보정은 tick 166에 확보되고 최소 연출 tick 240에 확정된다", () => {
    const config = productionConfig(
      DANGEROUS_FISH.voidfin_coelacanth,
      169,
      dangerousRealtimeModifiers({
        fishingLevel: 100,
        baitId: "abyss_bait",
        reelPowerBonus: 7,
        staminaDamageBonus: 12,
        tensionControlBonus: 5,
        slackTolerance: 1,
        telegraphSteps: 1,
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 3,
        lineEnhancementLevel: 3,
      }),
      31,
      4,
    );
    const trace = playResponsiveTrace(config);

    expect(trace.state.targetTicks).toBe(318);
    expect(dangerousRealtimeMinimumCatchTick(trace.state.targetTicks)).toBe(240);
    expect(trace.securedTick).toBe(166);
    expect(trace.state).toMatchObject({
      tick: 240,
      status: "caught",
      stamina: 0,
      distance: 0,
    });
  });

  it("line +1은 동일 대상·위험도·seed의 baseline보다 포획이 늦어지지 않는다", () => {
    const target = DANGEROUS_FISH.razor_sardine;
    const baselineConfig = productionConfig(target, 1, undefined, 0, 3);
    const sharedPolicy = productionResponsivePolicy(baselineConfig);
    const baseline = playResponsiveTrace(baselineConfig, sharedPolicy);
    const linePlusOneConfig = productionConfig(
      target,
      1,
      dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "basic_bait",
        lineEnhancementLevel: 1,
      }),
      0,
      3,
    );
    const adaptiveLinePlusOne = playResponsiveTrace(linePlusOneConfig);
    const linePlusOne = playResponsiveTrace(linePlusOneConfig, sharedPolicy);

    expect(baseline.state.tick).toBe(213);
    expect(adaptiveLinePlusOne.inputs).not.toEqual(baseline.inputs);
    expect(linePlusOne.inputs).toEqual(baseline.inputs);
    expect(linePlusOne.state.tick).toBeLessThanOrEqual(baseline.state.tick);
  });

  it("모든 생산 대상·도달 위험도·강화 0..3·Lv.100 on/off·전체 미끼·명시 seed를 실제 행동으로 끝까지 replay한다", () => {
    const matrixSeeds = [1, 169] as const;
    const fishingLevelCases = [
      {
        label: "lv100-off",
        fishingLevel: 50,
        levelBonuses: { reelEfficiencyPct: 0, tensionControlPct: 0 },
      },
      {
        label: "lv100-on",
        fishingLevel: 100,
        levelBonuses: { reelEfficiencyPct: 12, tensionControlPct: 8 },
      },
    ] as const;
    const enhancementLevels = [0, 1, 2, 3] as const;
    const baitIds = [
      "basic_bait",
      "reef_bait",
      "blood_bait",
      "luminous_bait",
      "abyss_bait",
    ] as const satisfies readonly DangerousBaitId[];
    const simulationProjections = new Map<
      string,
      ReturnType<typeof reachablePerformanceCase>
    >();
    let rawProjectionCount = 0;

    expect(
      fishingLevelCases.map(({ fishingLevel }) => ({
        fishingLevel,
        levelBonuses: dangerousRealtimeLevelBonuses(fishingLevel),
      })),
    ).toEqual(
      fishingLevelCases.map(({ fishingLevel, levelBonuses }) => ({
        fishingLevel,
        levelBonuses,
      })),
    );
    expect([...baitIds].sort()).toEqual(Object.keys(DANGEROUS_BAITS).sort());

    for (const { fishingLevel } of fishingLevelCases) {
      for (const rodEnhancementLevel of enhancementLevels) {
        for (const reelEnhancementLevel of enhancementLevels) {
          for (const lineEnhancementLevel of enhancementLevels) {
            for (const baitId of baitIds) {
              rawProjectionCount += 1;
              const reachable = {
                label: [
                  `level${fishingLevel}`,
                  `rod+${rodEnhancementLevel}`,
                  `reel+${reelEnhancementLevel}`,
                  `line+${lineEnhancementLevel}`,
                  baitId,
                ].join("/"),
                maxTensionBonus: fishingLevel === 100 ? 31 : 0,
                modifiers: dangerousRealtimeModifiers({
                  fishingLevel,
                  baitId,
                  reelPowerBonus: fishingLevel === 100 ? 7 : 0,
                  staminaDamageBonus: fishingLevel === 100 ? 12 : 0,
                  tensionControlBonus: fishingLevel === 100 ? 5 : 0,
                  slackTolerance: fishingLevel === 100 ? 1 : 0,
                  telegraphSteps: fishingLevel === 100 ? 1 : 0,
                  rodEnhancementLevel,
                  reelEnhancementLevel,
                  lineEnhancementLevel,
                }),
              };
              const projectionKey = simulationRelevantProjectionKey(reachable);
              if (!simulationProjections.has(projectionKey)) {
                simulationProjections.set(projectionKey, reachable);
              }
            }
          }
        }
      }
    }

    let actualReplayCount = 0;
    let securedReplayCount = 0;
    const reachedRisks = new Set<number>();
    for (const item of productionCases()) {
      const initialRisk =
        "rarity" in item.target
          ? Math.min(
              5,
              DANGEROUS_ZONES[item.target.zoneId].baseRisk +
                DANGEROUS_DEPTHS[item.target.depthId].riskBonus,
            )
          : item.target.minRisk;
      const risks =
        "rarity" in item.target
          ? Array.from(
              { length: 6 - initialRisk },
              (_value, index) => initialRisk + index,
            )
          : [initialRisk];
      for (const risk of risks) {
        reachedRisks.add(risk);
        for (const seed of matrixSeeds) {
          const baselineConfig = productionConfig(
            item.target,
            seed,
            undefined,
            0,
            risk,
          );
          const sharedPolicy = productionResponsivePolicy(baselineConfig);
          const baselineTrace = playResponsiveTrace(
            baselineConfig,
            sharedPolicy,
          );
          const baseline = baselineTrace.state;
          expect(baseline.status).toBe("caught");
          for (const reachable of simulationProjections.values()) {
            actualReplayCount += 1;
            const config = productionConfig(
              item.target,
              seed,
              reachable.modifiers,
              reachable.maxTensionBonus,
              risk,
            );
            const trace = playResponsiveTrace(config, sharedPolicy);
            const outcome = trace.state;
            const failure = [
              item.id,
              `risk${risk}`,
              `seed${seed}`,
              `projection=${reachable.label}`,
            ].join("/");

            expect(outcome.status, failure).toBe("caught");
            expect(outcome.tick, `${failure}/engine-floor`).toBeGreaterThanOrEqual(
              dangerousRealtimeMinimumCatchTick(outcome.targetTicks),
            );
            expect(outcome.tick, `${failure}/baseline-65pct`).toBeGreaterThanOrEqual(
              Math.ceil((baseline.tick * 650) / 1_000),
            );
            expect(outcome.tick, `${failure}/baseline-plus-telegraph`).toBeLessThanOrEqual(
              baseline.tick + DANGEROUS_REALTIME_TELEGRAPH_TICKS,
            );
            expect(reachable.modifiers.timeReductionPct, failure).toBeLessThanOrEqual(35);
            if (trace.securedTick !== null) {
              securedReplayCount += 1;
              expect(trace.securedTick, `${failure}/secured-before-caught`).toBeLessThan(
                outcome.tick,
              );
            }
          }
        }
      }
    }

    expect([...reachedRisks].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rawProjectionCount).toBe(640);
    expect(simulationProjections.size).toBe(640);
    expect(actualReplayCount).toBe(79_360);
    expect(securedReplayCount).toBeGreaterThan(0);
  }, 480_000);

  it("모든 시간 단축 기여는 관측 예산의 단일 보수 스케일을 사용한다", () => {
    const baseline = createDangerousRealtimeState(fixtureRealtimeConfig());
    const maxed = fixtureRealtimeConfig({
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 100,
        baitId: "blood_bait",
        reelPowerBonus: 7,
        staminaDamageBonus: 12,
        tensionControlBonus: 5,
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 3,
        lineEnhancementLevel: 3,
      }),
    });
    const revision2 = createDangerousRealtimeState(maxed, 2);
    const current = createDangerousRealtimeState(maxed);

    expect(baseline.performanceScalePermille).toBe(1_000);
    expect(maxed.modifiers.timeReductionPct).toBe(35);
    expect(revision2.performanceScalePermille).toBe(461);
    expect(current.performanceScalePermille).toBe(1_000);
    expect(current.maxTicks).toBe(maxed.maxTicks);
  });

  it("revision 3은 표시한 장비·레벨·미끼 퍼센트를 그대로 적용하고 revision 2는 461 보정을 보존한다", () => {
    type EffectiveProjection = {
      performanceScalePermille: number;
      reelEfficiencyPct: number;
      tensionControlPct: number;
      safeZoneBonusPct: number;
      cargoProtectionPct: number;
      staminaDamagePct: number;
      distanceRecoveryPct: number;
      baitEffect: {
        turnDistanceRecoveryReductionPct: number;
        turnTensionImpactReductionPct: number;
        chargeAndThrashStaminaDamagePct: number;
        telegraphCount: number;
        diveSpeedReductionPct: number;
        startingStaminaReductionPct: number;
        tensionImpulseReductionPct: number;
      };
    };
    const project = (
      dangerousRealtimeEngine as typeof dangerousRealtimeEngine & {
        dangerousRealtimeEffectiveModifierProjection?: (
          modifiers: ReturnType<typeof dangerousRealtimeModifiers>,
          revision: number,
        ) => EffectiveProjection;
      }
    ).dangerousRealtimeEffectiveModifierProjection;

    expect(project).toBeTypeOf("function");
    if (!project) return;

    const cases = [
      {
        label: "rod +1",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "basic_bait",
          rodEnhancementLevel: 1,
        }),
        revision2: { staminaDamagePct: 2, cargoProtectionPct: 0 },
        revision3: { staminaDamagePct: 6, cargoProtectionPct: 0 },
      },
      {
        label: "reel +1",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "basic_bait",
          reelEnhancementLevel: 1,
        }),
        revision2: { distanceRecoveryPct: 2, cargoProtectionPct: 0 },
        revision3: { distanceRecoveryPct: 5, cargoProtectionPct: 0 },
      },
      {
        label: "line +1",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "basic_bait",
          lineEnhancementLevel: 1,
        }),
        revision2: { safeZoneBonusPct: 1, cargoProtectionPct: 2 },
        revision3: { safeZoneBonusPct: 3, cargoProtectionPct: 2 },
      },
      {
        label: "level 100",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 100,
          baitId: "basic_bait",
        }),
        revision2: {
          reelEfficiencyPct: 5,
          tensionControlPct: 3,
          cargoProtectionPct: 0,
        },
        revision3: {
          reelEfficiencyPct: 12,
          tensionControlPct: 8,
          cargoProtectionPct: 0,
        },
      },
      {
        label: "intrinsic gear stats",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "basic_bait",
          reelPowerBonus: 7,
          staminaDamageBonus: 12,
          tensionControlBonus: 5,
        }),
        revision2: {
          distanceRecoveryPct: 3,
          staminaDamagePct: 5,
          tensionControlPct: 2,
          cargoProtectionPct: 0,
        },
        revision3: {
          distanceRecoveryPct: 7,
          staminaDamagePct: 12,
          tensionControlPct: 5,
          cargoProtectionPct: 0,
        },
      },
      {
        label: "reef bait",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "reef_bait",
        }),
        revision2: {
          cargoProtectionPct: 0,
          baitEffect: {
            turnDistanceRecoveryReductionPct: 9,
            turnTensionImpactReductionPct: 9,
          },
        },
        revision3: {
          cargoProtectionPct: 0,
          baitEffect: {
            turnDistanceRecoveryReductionPct: 20,
            turnTensionImpactReductionPct: 20,
          },
        },
      },
      {
        label: "blood bait",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "blood_bait",
        }),
        revision2: {
          cargoProtectionPct: 0,
          baitEffect: { chargeAndThrashStaminaDamagePct: 9 },
        },
        revision3: {
          cargoProtectionPct: 0,
          baitEffect: { chargeAndThrashStaminaDamagePct: 20 },
        },
      },
      {
        label: "luminous bait",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "luminous_bait",
        }),
        revision2: {
          cargoProtectionPct: 0,
          baitEffect: { telegraphCount: 1, diveSpeedReductionPct: 6 },
        },
        revision3: {
          cargoProtectionPct: 0,
          baitEffect: { telegraphCount: 1, diveSpeedReductionPct: 15 },
        },
      },
      {
        label: "abyss bait",
        modifiers: dangerousRealtimeModifiers({
          fishingLevel: 50,
          baitId: "abyss_bait",
        }),
        revision2: {
          cargoProtectionPct: 0,
          baitEffect: {
            startingStaminaReductionPct: 4,
            tensionImpulseReductionPct: 5,
          },
        },
        revision3: {
          cargoProtectionPct: 0,
          baitEffect: {
            startingStaminaReductionPct: 10,
            tensionImpulseReductionPct: 12,
          },
        },
      },
    ] as const;

    for (const item of cases) {
      expect(project(item.modifiers, 2), `${item.label}/revision2`).toMatchObject({
        performanceScalePermille: 461,
        ...item.revision2,
      });
      expect(project(item.modifiers, 3), `${item.label}/revision3`).toMatchObject({
        performanceScalePermille: 1_000,
        ...item.revision3,
      });
    }

    expect(
      dangerousRealtimeTargetCalibration(
        { stamina: 1, distance: 1, baseTension: 50, maxTensionBonus: 5 },
        2,
      ).maxTension,
    ).toBe(1_020);
    expect(
      (
        dangerousRealtimeTargetCalibration as unknown as (
          args: {
            stamina: number;
            distance: number;
            baseTension: number;
            maxTensionBonus: number;
          },
          revision: number,
        ) => ReturnType<typeof dangerousRealtimeTargetCalibration>
      )(
        { stamina: 1, distance: 1, baseTension: 50, maxTensionBonus: 5 },
        3,
      ).maxTension,
    ).toBe(1_050);
  });

  it("최대 보정의 실제 정상 반응 시간 단축도 같은 시드 기본값의 35%를 넘지 않는다", () => {
    const maxedModifierSets = (
      ["reef_bait", "blood_bait", "luminous_bait", "abyss_bait"] as const
    ).map((baitId) => ({
      baitId,
      modifiers: dangerousRealtimeModifiers({
        fishingLevel: 100,
        baitId,
        reelPowerBonus: 7,
        staminaDamageBonus: 12,
        tensionControlBonus: 5,
        slackTolerance: 1,
        telegraphSteps: 1,
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 3,
        lineEnhancementLevel: 3,
      }),
    }));

    for (const item of productionCases()) {
      for (const seed of PRODUCTION_DURATION_SEEDS) {
        const baseConfig = productionConfig(item.target, seed);
        const base = playResponsive(baseConfig);
        expect(base.status).toBe("caught");
        for (const { baitId, modifiers } of maxedModifierSets) {
          const maxed = playResponsive(
            productionConfig(item.target, seed, modifiers, 31),
          );
          expect(maxed.status).toBe("caught");
          expect(
            maxed.tick,
            `${item.id}/risk${baseConfig.risk}/seed${seed}/projection=maxed-${baitId}`,
          ).toBeGreaterThanOrEqual(Math.ceil((base.tick * 650) / 1_000));
        }
      }
    }
  }, 30_000);

  it("서버 입력 검증은 음수·역행·중복·범위 밖 틱을 거부한다", () => {
    const config = fixtureRealtimeConfig();

    expect(() =>
      validateDangerousRealtimeInputs(config, [{ tick: -1, mode: "reel" }], 1),
    ).toThrow(/negative/i);
    expect(() =>
      validateDangerousRealtimeInputs(
        config,
        [
          { tick: 3, mode: "reel" },
          { tick: 3, mode: "release" },
        ],
        4,
      ),
    ).toThrow(/increasing/i);
    expect(() =>
      validateDangerousRealtimeInputs(
        config,
        [
          { tick: 4, mode: "reel" },
          { tick: 2, mode: "release" },
        ],
        5,
      ),
    ).toThrow(/increasing/i);
    expect(() =>
      validateDangerousRealtimeInputs(
        config,
        [{ tick: config.maxTicks + 1, mode: "reel" }],
        config.maxTicks,
      ),
    ).toThrow(/maxTicks/i);
  });

  it("재생 중 조기 종료 뒤에 붙은 입력 전환을 거부한다", () => {
    const config = fixtureRealtimeConfig({ behaviorPattern: ["turn"] });
    const minimumCatchTick = dangerousRealtimeMinimumCatchTick(
      dangerousRealtimeTargetTicks(config),
    );
    const terminalFixtures = [
      activeBehaviorState("turn", config, {
        tick: minimumCatchTick - 1,
        tension: 1_001,
      }),
      activeBehaviorState("turn", config, {
        tick: minimumCatchTick - 1,
        tension: 0,
        lowTensionTicks: DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS - 1,
      }),
      activeBehaviorState("turn", config, {
        tick: minimumCatchTick - 1,
        mode: "reel",
        stamina: 1,
        distance: 1,
      }),
    ];

    for (const initial of terminalFixtures) {
      expect(() =>
        replayDangerousRealtimeInputs(
          config,
          [{ tick: minimumCatchTick, mode: "release" }],
          minimumCatchTick + 1,
          initial,
        ),
      ).toThrow(/terminal/i);
    }
  });
});
