import { describe, expect, it } from "vitest";
import {
  DANGEROUS_BOSSES,
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  dangerousCatchMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  createDangerousEncounter,
  isDangerousRealtimeEncounter,
  type DangerousRealtimeModifierSource,
} from "./dangerousFishingEncounter";
import {
  createDangerousRealtimeState,
  dangerousRealtimeMaxTicks,
  dangerousRealtimeTargetCalibration,
  replayDangerousRealtimeInputs,
  type DangerousRealtimeBalanceRevision,
  type DangerousRealtimeConfig,
} from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import {
  applyDangerousAccidentAndReturn,
  dangerousRiskPreview,
  emptyDangerousFishingState,
  parseDangerousFishingState,
  recoverExpiredRealtimeBossAttempt,
  resolvePersonalEncounter,
  returnDangerousVoyage,
  startDangerousVoyage,
  startPersonalEncounter,
  type DangerousFishingState,
} from "./dangerousFishingState";

const DEFAULT_REALTIME_SOURCE: DangerousRealtimeModifierSource = {
  fishingLevel: 50,
  baitId: "basic_bait",
  rodId: "starter_rod",
  reelId: "starter_reel",
  lineId: "starter_line",
  maxTensionBonus: 5,
  reelPowerBonus: 2,
  staminaDamageBonus: 2,
  tensionControlBonus: 3,
  slackTolerance: 0,
  telegraphSteps: 0,
  rodEnhancementLevel: 0,
  reelEnhancementLevel: 0,
  lineEnhancementLevel: 0,
  cargoProtectionPct: 0,
  targetStamina: DANGEROUS_FISH.ironjaw_tuna.stamina,
  targetDistance: DANGEROUS_FISH.ironjaw_tuna.distance,
  targetBaseTension: DANGEROUS_FISH.ironjaw_tuna.baseTension,
};

function realtimeConfig(
  source: DangerousRealtimeModifierSource = DEFAULT_REALTIME_SOURCE,
  balanceRevision: DangerousRealtimeBalanceRevision = 2,
): DangerousRealtimeConfig {
  const calibration = dangerousRealtimeTargetCalibration(
    {
      stamina: source.targetStamina,
      distance: source.targetDistance,
      baseTension: source.targetBaseTension,
      maxTensionBonus: source.maxTensionBonus,
    },
    balanceRevision,
  );
  const config = {
    seed: 71,
    risk: 3,
    targetKind: "fish" as const,
    rarity: "rare" as const,
    behaviorPattern: ["turn", "charge", "thrash", "turn"] as const,
    ...calibration,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: source.fishingLevel,
      baitId: source.baitId,
      reelPowerBonus: source.reelPowerBonus,
      staminaDamageBonus: source.staminaDamageBonus,
      tensionControlBonus: source.tensionControlBonus,
      slackTolerance: source.slackTolerance,
      telegraphSteps: source.telegraphSteps,
      rodEnhancementLevel: source.rodEnhancementLevel,
      reelEnhancementLevel: source.reelEnhancementLevel,
      lineEnhancementLevel: source.lineEnhancementLevel,
      cargoProtectionPct: source.cargoProtectionPct,
    }),
  };
  return { ...config, maxTicks: dangerousRealtimeMaxTicks(config) };
}

function v2Encounter(
  id = "realtime-1",
  sourceOverrides: Partial<DangerousRealtimeModifierSource> = {},
  balanceRevision: DangerousRealtimeBalanceRevision = 2,
) {
  const source = { ...DEFAULT_REALTIME_SOURCE, ...sourceOverrides };
  const config = realtimeConfig(source, balanceRevision);
  return {
    simulationVersion: 2 as const,
    balanceRevision,
    id,
    targetKind: "fish" as const,
    targetId: "ironjaw_tuna",
    modifierSource: source,
    config,
    checkpoint: createDangerousRealtimeState(config, balanceRevision),
    approvedTick: 0,
    revision: 0,
    startedAt: 1_000,
    expiresAt: 1_000 + config.maxTicks * 50,
  };
}

function legacyV2Encounter(id = "legacy-realtime") {
  const source = {
    ...DEFAULT_REALTIME_SOURCE,
    baitId: "luminous_bait" as const,
  };
  const current = v2Encounter(id, source);
  const { balanceRevision: _balanceRevision, ...unversioned } = current;
  const config = {
    ...unversioned.config,
    maxTension: 1_050,
  };
  return {
    ...unversioned,
    config,
    checkpoint: {
      ...createDangerousRealtimeState(config),
      maxTension: 1_050,
      performanceScalePermille: 1_000,
    },
  };
}

function encounter(id = "encounter-1") {
  return createDangerousEncounter({
    id,
    targetKind: "fish",
    target: DANGEROUS_FISH.ironjaw_tuna,
    rod: DANGEROUS_RODS.starter_rod,
    reel: DANGEROUS_REELS.starter_reel,
    line: DANGEROUS_LINES.starter_line,
    startedAt: 1_000,
    patternSeed: 7,
  });
}

function v1BossEncounter(id = "legacy-boss-attempt") {
  const boss = DANGEROUS_BOSSES.tidal_colossus;
  return {
    ...createDangerousEncounter({
      id,
      targetKind: "boss" as const,
      target: {
        id: boss.id,
        stamina: boss.attemptStamina,
        distance: boss.attemptDistance,
        baseTension: boss.baseTension,
        behaviorPattern: boss.behaviorPattern,
      },
      rod: DANGEROUS_RODS.starter_rod,
      reel: DANGEROUS_REELS.starter_reel,
      line: DANGEROUS_LINES.starter_line,
      startedAt: 1_000,
      patternSeed: 7,
    }),
    simulationVersion: 1 as const,
  };
}

function voyageState(risk = 3): DangerousFishingState {
  const started = startDangerousVoyage(emptyDangerousFishingState(), {
    id: "voyage-1",
    zoneId: "storm_trench",
    depthId: "midwater",
    risk,
    startedAt: 1_000,
  });
  if (!started.ok) throw new Error("fixture voyage did not start");
  return started.state;
}

describe("위험 해역 저장 상태", () => {
  it("기존 v1 조우는 버전 표기를 추가해 기존 진행 데이터를 보존한다", () => {
    const v1 = encounter("legacy-encounter");
    const parsed = parseDangerousFishingState({
      version: 2,
      ownedGear: {
        rods: ["breaker_rod"],
        reels: ["current_reel"],
        lines: ["braided_line"],
      },
      loadout: {
        rodId: "breaker_rod",
        reelId: "current_reel",
        lineId: "braided_line",
        baitId: "blood_bait",
      },
      baitCounts: { blood_bait: 4 },
      codex: {
        ironjaw_tuna: {
          caughtCount: 2,
          bestSizeCm: 151,
          firstCaughtAt: 10,
          bestCaughtAt: 20,
        },
      },
      bossCodex: {
        tidal_colossus: {
          defeats: 1,
          firstDefeatedAt: 30,
          lastDefeatedAt: 30,
          bestContribution: 240,
        },
      },
      bossTraces: { tidal_colossus: 3 },
      resolvedEncounterIds: ["settled"],
      voyage: {
        id: "voyage-legacy",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 2,
            totalValue: 420,
          },
        ],
        encounter: v1,
      },
    });

    expect(parsed.voyage?.encounter).toMatchObject({
      simulationVersion: 1,
      id: "legacy-encounter",
    });
    expect(parsed).toMatchObject({
      baitCounts: { blood_bait: 4 },
      loadout: { baitId: "blood_bait" },
      codex: { ironjaw_tuna: { caughtCount: 2 } },
      bossCodex: { tidal_colossus: { bestContribution: 240 } },
      bossTraces: { tidal_colossus: 3 },
      resolvedEncounterIds: ["settled"],
      voyage: { cargo: [{ quantity: 2, totalValue: 420 }] },
    });
  });

  it("v1 거대어 시도는 만료 시각 경계에서 보상 기록 없이 시도만 해소한다", () => {
    const legacy = v1BossEncounter();
    const before: DangerousFishingState = {
      ...voyageState(),
      baitCounts: { reef_bait: 3 },
      bossTraces: { tidal_colossus: 7 },
      resolvedEncounterIds: ["resolved-before"],
      realtimeCompletions: [
        {
          requestId: "completed-before",
          encounterId: "resolved-before",
          result: { ok: true },
        },
      ],
      voyage: {
        ...voyageState().voyage!,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: dangerousCatchMaterialId("ironjaw_tuna"),
            quantity: 2,
            totalValue: 420,
          },
        ],
      },
      bossAttempt: { eventId: "legacy-event", encounter: legacy },
    };

    const recovered = recoverExpiredRealtimeBossAttempt(before, {
      now: legacy.expiresAt,
      result: { ok: false, error: "expired" },
    });

    expect(recovered.encounter).toEqual(legacy);
    expect(recovered.state).toEqual({ ...before, bossAttempt: null });
    expect(recovered.state.realtimeCompletions).toEqual(
      before.realtimeCompletions,
    );
    expect(recovered.state.resolvedEncounterIds).toEqual(
      before.resolvedEncounterIds,
    );
  });

  it("유효한 v2 조우를 보존하고 저장된 장비 강화도를 0..3으로 정규화한다", () => {
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      ownedGear: {
        rods: ["breaker_rod"],
        reels: ["current_reel"],
        lines: ["braided_line"],
      },
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "basic_bait",
      },
      gearEnhancements: {
        rods: { breaker_rod: 9, unknown_rod: 2 },
        reels: { current_reel: 2.8, starter_reel: Number.POSITIVE_INFINITY },
        lines: { braided_line: -1, starter_line: "2" },
      },
      voyage: {
        id: "voyage-realtime",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: v2Encounter(),
      },
    });

    expect(isDangerousRealtimeEncounter(parsed.voyage?.encounter)).toBe(true);
    expect(parsed.voyage?.encounter).toMatchObject({ balanceRevision: 2 });
    expect(parsed.gearEnhancements).toEqual({
      rods: { breaker_rod: 3 },
      reels: { current_reel: 2, starter_reel: 0 },
      lines: { braided_line: 0, starter_line: 0 },
    });
  });

  it("거대한 유한 화물과 중복 스택을 안전 정수 상한으로 보존한다", () => {
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "huge-cargo",
        zoneId: "storm_trench",
        depthId: "deep",
        risk: 5,
        startedAt: 1,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: Number.MAX_VALUE,
            totalValue: Number.MAX_VALUE,
          },
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: Number.MAX_VALUE,
            totalValue: Number.MAX_VALUE,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: Number.MAX_VALUE,
            totalValue: Number.MAX_VALUE,
          },
        ],
        encounter: null,
      },
    });

    expect(parsed.voyage?.cargo).toEqual([
      {
        fishId: "razor_sardine",
        materialId: "danger_catch_razor_sardine",
        quantity: Number.MAX_SAFE_INTEGER,
        totalValue: Number.MAX_SAFE_INTEGER,
      },
      {
        fishId: "ironjaw_tuna",
        materialId: "danger_catch_ironjaw_tuna",
        quantity: Number.MAX_SAFE_INTEGER,
        totalValue: Number.MAX_SAFE_INTEGER,
      },
    ]);
  });

  it("balance revision이 없는 기존 v2 조우는 legacy 계산과 미끼 스냅샷으로 복구해 계속 replay한다", () => {
    const legacy = legacyV2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "luminous_bait",
      },
      baitCounts: {},
      voyage: {
        id: "legacy-realtime-voyage",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: legacy,
      },
    });
    const encounter = parsed.voyage?.encounter;

    expect(isDangerousRealtimeEncounter(encounter)).toBe(true);
    if (!encounter || !isDangerousRealtimeEncounter(encounter)) {
      throw new Error("legacy realtime encounter was discarded");
    }
    expect(encounter).toMatchObject({
      balanceRevision: 1,
      modifierSource: { baitId: "luminous_bait" },
      config: { maxTension: 1_050 },
      checkpoint: { maxTension: 1_050, performanceScalePermille: 1_000 },
    });
    expect(parsed.loadout.baitId).toBe("basic_bait");
    expect(
      replayDangerousRealtimeInputs(
        encounter.config,
        [],
        encounter.approvedTick + 1,
        encounter.checkpoint,
        encounter.balanceRevision,
      ).tick,
    ).toBe(encounter.approvedTick + 1);
    expect(
      replayDangerousRealtimeInputs(
        encounter.config,
        [],
        1,
        undefined,
        encounter.balanceRevision,
      ).performanceScalePermille,
    ).toBe(1_000);
  });

  it("종료 조건과 맞지 않는 realtime checkpoint status는 durable state에서 폐기한다", () => {
    const validEncounter = v2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "false-terminal-voyage",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...validEncounter,
          checkpoint: {
            ...validEncounter.checkpoint,
            status: "caught",
          },
        },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it("revision 2와 revision 3 조우를 각자의 고정 계산으로 복구한다", () => {
    for (const balanceRevision of [2, 3] as const) {
      const encounter = v2Encounter(
        `realtime-revision-${balanceRevision}`,
        {},
        balanceRevision,
      );
      const parsed = parseDangerousFishingState({
        ...emptyDangerousFishingState(),
        voyage: {
          id: `voyage-revision-${balanceRevision}`,
          zoneId: "storm_trench",
          depthId: "midwater",
          risk: 3,
          startedAt: 1_000,
          cargo: [],
          encounter,
        },
      });

      expect(parsed.voyage?.encounter).toMatchObject({
        balanceRevision,
        checkpoint: {
          performanceScalePermille: balanceRevision === 2 ? 461 : 1_000,
        },
      });
    }
  });

  it.each([0, 4, "3", null])(
    "비정상 또는 미래 realtime balance revision %j은 fail-closed한다",
    (balanceRevision) => {
      const encounter = { ...v2Encounter(), balanceRevision };
      const parsed = parseDangerousFishingState({
        ...emptyDangerousFishingState(),
        voyage: {
          id: "unknown-realtime-revision",
          zoneId: "storm_trench",
          depthId: "midwater",
          risk: 3,
          startedAt: 1_000,
          cargo: [],
          encounter,
        },
      });

      expect(parsed.voyage?.encounter).toBeNull();
    },
  );

  it("누락된 강화도는 빈 값으로 이행하고 비정상 v2 설정과 종료 기록을 버린다", () => {
    const validEncounter = v2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      gearEnhancements: undefined,
      realtimeCompletions: [
        ...Array.from({ length: 34 }, (_, index) => ({
          requestId: `finish-${index}`,
          encounterId: "realtime-1",
          result: { ok: true, status: 200, index },
        })),
        { requestId: "bad", encounterId: "", result: { ok: true } },
      ],
      voyage: {
        id: "voyage-invalid",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...validEncounter,
          config: {
            ...validEncounter.config,
            maxTicks: validEncounter.config.maxTicks - 1,
          },
        },
      },
    });

    expect(parsed.gearEnhancements).toEqual({ rods: {}, reels: {}, lines: {} });
    expect(parsed.voyage?.encounter).toBeNull();
    expect(parsed.realtimeCompletions).toHaveLength(32);
    expect(parsed.realtimeCompletions[0]).toMatchObject({ requestId: "finish-2" });
    expect(parsed.realtimeCompletions.at(-1)).toMatchObject({ requestId: "finish-33" });
  });

  it("장비나 미끼 보정값이 바뀐 v2 설정을 신뢰하지 않는다", () => {
    const validEncounter = v2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "voyage-tampered-modifier",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...validEncounter,
          config: {
            ...validEncounter.config,
            modifiers: {
              ...validEncounter.config.modifiers,
              timeReductionPct: 35,
            },
          },
        },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it.each([
    "maxTensionBonus",
    "reelPowerBonus",
    "staminaDamageBonus",
    "tensionControlBonus",
    "slackTolerance",
    "telegraphSteps",
    "targetStamina",
    "targetDistance",
    "targetBaseTension",
  ] as const)("필수 realtime 스냅샷 %s가 없으면 fail-closed한다", (key) => {
    const validEncounter = v2Encounter();
    const modifierSource = { ...validEncounter.modifierSource } as Record<
      string,
      unknown
    >;
    delete modifierSource[key];
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "voyage-missing-snapshot",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: { ...validEncounter, modifierSource },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it("출처와 맞지 않는 자기 일관적인 레벨 보정도 신뢰하지 않는다", () => {
    const validEncounter = v2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "voyage-forged-level",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...validEncounter,
          config: {
            ...validEncounter.config,
            modifiers: {
              ...validEncounter.config.modifiers,
              reelEfficiencyPct: 12,
              tensionControlPct: 8,
              timeReductionPct: 12,
            },
          },
        },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it("마지막 특수 미끼를 소비한 뒤에도 v2 조우의 고정 미끼 보정을 복구한다", () => {
    const encounter = v2Encounter("luminous", {
      fishingLevel: 50,
      baitId: "luminous_bait",
      rodId: "starter_rod",
      reelId: "starter_reel",
      lineId: "starter_line",
      rodEnhancementLevel: 0,
      reelEnhancementLevel: 0,
      lineEnhancementLevel: 0,
      cargoProtectionPct: 0,
    });
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "luminous_bait",
      },
      baitCounts: {},
      voyage: {
        id: "voyage-luminous",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter,
      },
    });

    expect(isDangerousRealtimeEncounter(parsed.voyage?.encounter)).toBe(true);
    expect(parsed.voyage?.encounter).toMatchObject({
      modifierSource: { baitId: "luminous_bait" },
    });
    expect(parsed.loadout.baitId).toBe("basic_bait");
  });

  it("소유하지 않은 장비의 강화도는 복구하지 않는다", () => {
    expect(
      parseDangerousFishingState({
        ...emptyDangerousFishingState(),
        gearEnhancements: { rods: { breaker_rod: 3 } },
      }).gearEnhancements,
    ).toEqual({ rods: {}, reels: {}, lines: {} });
  });

  it("v2 조우는 시작 시점 강화 스냅샷으로 config를 복구해 외부 강화 변경과 분리한다", () => {
    const base = v2Encounter("enhancement-snapshot");
    const source = {
      ...base.modifierSource,
      rodEnhancementLevel: 3,
      reelEnhancementLevel: 2,
      lineEnhancementLevel: 1,
    };
    const config = realtimeConfig(source);
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      gearEnhancements: { rods: {}, reels: {}, lines: {} },
      voyage: {
        id: "voyage-enhancement-snapshot",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...base,
          modifierSource: source,
          config,
          checkpoint: createDangerousRealtimeState(config, 2),
          expiresAt: 1_000 + config.maxTicks * 50,
        },
      },
    });

    expect(parsed.voyage?.encounter).toMatchObject({
      modifierSource: {
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 2,
        lineEnhancementLevel: 1,
      },
      config: {
        modifiers: {
          staminaDamagePct: 20,
          distanceRecoveryPct: 12,
          safeZoneBonusPct: 3,
        },
      },
    });
  });

  it("강화 스냅샷과 다른 realtime config는 외부 강화값이 맞아도 거부한다", () => {
    const base = v2Encounter("tampered-enhancement-snapshot");
    const config = realtimeConfig({
      ...base.modifierSource,
      rodEnhancementLevel: 3,
    });
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      gearEnhancements: { rods: { starter_rod: 3 } },
      voyage: {
        id: "voyage-tampered-enhancement",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...base,
          modifierSource: {
            ...base.modifierSource,
            rodEnhancementLevel: 2,
            reelEnhancementLevel: 0,
            lineEnhancementLevel: 0,
          },
          config,
          checkpoint: createDangerousRealtimeState(config, 2),
          expiresAt: 1_000 + config.maxTicks * 50,
        },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it("활성 v2 조우는 이후 소유 장비·장착·강화 변경과 무관하게 시작 스냅샷을 복구한다", () => {
    const encounter = v2Encounter("immutable-outer-save", {
      fishingLevel: 100,
      rodId: "leviathan_rod",
      reelId: "maelstrom_reel",
      lineId: "abyss_chain_line",
      maxTensionBonus: 31,
      reelPowerBonus: 7,
      staminaDamageBonus: 12,
      tensionControlBonus: 5,
      slackTolerance: 1,
      telegraphSteps: 1,
      rodEnhancementLevel: 3,
      reelEnhancementLevel: 3,
      lineEnhancementLevel: 3,
      cargoProtectionPct: 15,
    });
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      ownedGear: {
        rods: ["starter_rod"],
        reels: ["starter_reel"],
        lines: ["starter_line"],
      },
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "basic_bait",
      },
      gearEnhancements: { rods: {}, reels: {}, lines: {} },
      voyage: {
        id: "voyage-immutable",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter,
      },
    });

    expect(parsed.voyage?.encounter).toEqual(encounter);
  });

  it.each([null, {}, { baitEffect: null }])(
    "손상된 realtime 보정값 %j은 조우만 비우고 기존 진행을 보존한다",
    (modifiers) => {
      const validEncounter = v2Encounter();
      const parsed = parseDangerousFishingState({
        ...emptyDangerousFishingState(),
        codex: {
          ironjaw_tuna: {
            caughtCount: 2,
            bestSizeCm: 151,
            firstCaughtAt: 10,
            bestCaughtAt: 20,
          },
        },
        voyage: {
          id: "voyage-malformed-modifiers",
          zoneId: "storm_trench",
          depthId: "midwater",
          risk: 3,
          startedAt: 1_000,
          cargo: [
            {
              fishId: "ironjaw_tuna",
              materialId: "danger_catch_ironjaw_tuna",
              quantity: 2,
              totalValue: 420,
            },
          ],
          encounter: {
            ...validEncounter,
            config: { ...validEncounter.config, modifiers },
          },
        },
      });

      expect(parsed.voyage).toMatchObject({
        encounter: null,
        cargo: [{ fishId: "ironjaw_tuna", quantity: 2, totalValue: 420 }],
      });
      expect(parsed.codex.ironjaw_tuna?.caughtCount).toBe(2);
    },
  );

  it("항해 위험도와 다른 realtime 설정을 신뢰하지 않는다", () => {
    const validEncounter = v2Encounter();
    const parsed = parseDangerousFishingState({
      ...emptyDangerousFishingState(),
      voyage: {
        id: "voyage-tampered-risk",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: 1_000,
        cargo: [],
        encounter: {
          ...validEncounter,
          config: { ...validEncounter.config, risk: 0 },
        },
      },
    });

    expect(parsed.voyage?.encounter).toBeNull();
  });

  it("새 상태는 스타터 세트와 무제한 기본 미끼를 안전하게 갖춘다", () => {
    expect(emptyDangerousFishingState()).toEqual({
      version: 2,
      ownedGear: {
        rods: ["starter_rod"],
        reels: ["starter_reel"],
        lines: ["starter_line"],
      },
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "basic_bait",
      },
      baitCounts: {},
      codex: {},
      bossCodex: {},
      bossTraces: {},
      bossAttempt: null,
      resolvedEncounterIds: [],
      gearEnhancements: { rods: {}, reels: {}, lines: {} },
      realtimeCompletions: [],
      voyage: null,
    });
  });

  it("손상된 저장값을 정규화하고 스타터 장비를 복구한다", () => {
    expect(
      parseDangerousFishingState({
        version: 99,
        ownedGear: { rods: ["toString"], reels: null, lines: [] },
        loadout: { rodId: "nope", baitId: "constructor" },
        baitCounts: { blood_bait: -3, luminous_bait: 2.9, nope: 100 },
        resolvedEncounterIds: ["ok", "ok", 3],
        voyage: { zoneId: "unknown" },
      }),
    ).toMatchObject({
      version: 2,
      ownedGear: {
        rods: ["starter_rod"],
        reels: ["starter_reel"],
        lines: ["starter_line"],
      },
      loadout: {
        rodId: "starter_rod",
        reelId: "starter_reel",
        lineId: "starter_line",
        baitId: "basic_bait",
      },
      baitCounts: { luminous_bait: 2 },
      resolvedEncounterIds: ["ok"],
      voyage: null,
    });
  });

  it("한 번에 항해와 조우를 하나씩만 시작한다", () => {
    const state = voyageState();
    expect(
      startDangerousVoyage(state, {
        id: "voyage-2",
        zoneId: "shattered_reef",
        depthId: "surface",
        risk: 0,
        startedAt: 2_000,
      }),
    ).toEqual({ ok: false, error: "voyage_active", state });

    const first = startPersonalEncounter(state, encounter());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(startPersonalEncounter(first.state, encounter("encounter-2"))).toEqual({
      ok: false,
      error: "encounter_active",
      state: first.state,
    });
  });

  it("어획 성공은 화물과 도감을 누적하고 같은 결과는 한 번만 반영한다", () => {
    const started = startPersonalEncounter(voyageState(), encounter());
    const activeEncounter = started.ok ? started.state.voyage?.encounter : null;
    if (!started.ok || !activeEncounter || isDangerousRealtimeEncounter(activeEncounter)) {
      throw new Error("fixture encounter did not start");
    }
    const caughtEncounter = {
      ...activeEncounter,
      status: "caught" as const,
      stamina: 0,
      distance: 0,
      revision: 4,
    };
    const first = resolvePersonalEncounter(
      started.state,
      { event: "caught", encounter: caughtEncounter },
      5_000,
      { fishId: "ironjaw_tuna", sizeCm: 142, quantity: 2 },
    );

    expect(first.outcome).toBe("caught");
    expect(first.state.voyage).toMatchObject({
      risk: 4,
      encounter: null,
      cargo: [
        {
          fishId: "ironjaw_tuna",
          materialId: "danger_catch_ironjaw_tuna",
          quantity: 2,
          totalValue: 420,
        },
      ],
    });
    expect(first.state.codex.ironjaw_tuna).toEqual({
      caughtCount: 2,
      bestSizeCm: 142,
      firstCaughtAt: 5_000,
      bestCaughtAt: 5_000,
    });

    const duplicate = resolvePersonalEncounter(
      first.state,
      { event: "caught", encounter: caughtEncounter },
      6_000,
      { fishId: "ironjaw_tuna", sizeCm: 160, quantity: 2 },
    );
    expect(duplicate.outcome).toBe("duplicate");
    expect(duplicate.state).toEqual(first.state);
  });

  it("실패한 조우는 기존 화물과 도감을 건드리지 않는다", () => {
    const base = voyageState();
    const withHistory: DangerousFishingState = {
      ...base,
      codex: {
        ironjaw_tuna: {
          caughtCount: 1,
          bestSizeCm: 120,
          firstCaughtAt: 2_000,
          bestCaughtAt: 2_000,
        },
      },
      voyage: base.voyage && {
        ...base.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: dangerousCatchMaterialId("ironjaw_tuna"),
            quantity: 1,
            totalValue: 210,
          },
        ],
      },
    };
    const started = startPersonalEncounter(withHistory, encounter());
    const activeEncounter = started.ok ? started.state.voyage?.encounter : null;
    if (!started.ok || !activeEncounter || isDangerousRealtimeEncounter(activeEncounter)) {
      throw new Error("fixture encounter did not start");
    }
    const failed = {
      ...activeEncounter,
      status: "failed" as const,
    };
    const resolved = resolvePersonalEncounter(
      started.state,
      { event: "line_broken", encounter: failed },
      3_000,
    );

    expect(resolved.outcome).toBe("failed");
    expect(resolved.state.voyage?.cargo).toEqual(withHistory.voyage?.cargo);
    expect(resolved.state.codex).toEqual(withHistory.codex);
  });

  it("위험도별 사고 확률과 손실 상한을 고정하고 입력 위험도를 제한한다", () => {
    expect([0, 1, 2].map(dangerousRiskPreview)).toEqual([
      { risk: 0, accidentChance: 0, maxLossFraction: 0 },
      { risk: 1, accidentChance: 0, maxLossFraction: 0 },
      { risk: 2, accidentChance: 0, maxLossFraction: 0 },
    ]);
    expect(dangerousRiskPreview(3)).toEqual({
      risk: 3,
      accidentChance: 0.12,
      maxLossFraction: 0.2,
    });
    expect(dangerousRiskPreview(4)).toEqual({
      risk: 4,
      accidentChance: 0.22,
      maxLossFraction: 0.35,
    });
    expect(dangerousRiskPreview(99)).toEqual({
      risk: 5,
      accidentChance: 0.32,
      maxLossFraction: 0.5,
    });
  });

  it("위험도 0~2에서는 어떤 굴림에도 사고가 나지 않는다", () => {
    for (const risk of [0, 1, 2]) {
      const state = voyageState(risk);
      expect(applyDangerousAccidentAndReturn(state, 0)).toEqual({
        state,
        incident: false,
        returned: false,
        lostValue: 0,
        lostCargo: {},
        materials: {},
        retainedCargoValue: 0,
      });
    }
  });

  it("빈 화물 사고와 완전 손실 상당의 0가치는 유한한 0 정산으로 끝난다", () => {
    const result = applyDangerousAccidentAndReturn(voyageState(5), 0);

    expect(result).toMatchObject({
      incident: true,
      returned: true,
      lostValue: 0,
      lostCargo: {},
      materials: {},
      retainedCargoValue: 0,
    });
    expect(Number.isSafeInteger(result.lostValue)).toBe(true);
    expect(Number.isSafeInteger(result.retainedCargoValue)).toBe(true);
  });

  it.each([
    [0, 9_007_199_254_740_990, 4_503_599_627_370_496],
    [6, 8_466_767_299_456_530, 4_773_815_605_012_726],
  ])(
    "거대한 화물 사고도 보호율 %i에서 같은 잔존 수량과 유한 가치로 정산한다",
    (protection, expectedLostValue, expectedRetainedQuantity) => {
      const base = voyageState(5);
      const parsed = parseDangerousFishingState({
        ...base,
        voyage: base.voyage && {
          ...base.voyage,
          cargo: [
            {
              fishId: "razor_sardine",
              materialId: "danger_catch_razor_sardine",
              quantity: Number.MAX_VALUE,
              totalValue: Number.MAX_VALUE,
            },
            {
              fishId: "ironjaw_tuna",
              materialId: "danger_catch_ironjaw_tuna",
              quantity: Number.MAX_VALUE,
              totalValue: Number.MAX_VALUE,
            },
          ],
        },
      });

      const result = applyDangerousAccidentAndReturn(parsed, 0, protection);

      expect(result).toMatchObject({
        incident: true,
        returned: true,
        lostValue: expectedLostValue,
        retainedCargoValue: Number.MAX_SAFE_INTEGER,
        materials: {
          danger_catch_razor_sardine: expectedRetainedQuantity,
          danger_catch_ironjaw_tuna: expectedRetainedQuantity,
        },
      });
      expect(Number.isSafeInteger(result.lostValue)).toBe(true);
      expect(Number.isSafeInteger(result.retainedCargoValue)).toBe(true);
    },
  );

  it.each([
    { risk: 3, cap: 200 },
    { risk: 4, cap: 350 },
    { risk: 5, cap: 500 },
  ])("위험도 $risk 사고는 화물 가치 손실 상한을 넘지 않고 강제 귀환한다", ({ risk, cap }) => {
    const base = voyageState(risk);
    const state: DangerousFishingState = {
      ...base,
      voyage: base.voyage && {
        ...base.voyage,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 10,
            totalValue: 400,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 20,
            totalValue: 600,
          },
        ],
      },
    };
    const result = applyDangerousAccidentAndReturn(state, 0);

    expect(result.incident).toBe(true);
    expect(result.returned).toBe(true);
    expect(result.lostValue).toBeLessThanOrEqual(cap);
    expect(result.state.voyage).toBeNull();
    expect(
      Object.values(result.materials).reduce((sum, quantity) => sum + quantity, 0),
    ).toBeLessThanOrEqual(30);
  });

  it("화물 보호 보정은 사고 확률이 아니라 화물 가치 손실 상한을 낮춘다", () => {
    const base = voyageState(5);
    const state: DangerousFishingState = {
      ...base,
      voyage: base.voyage && {
        ...base.voyage,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 10,
            totalValue: 400,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 20,
            totalValue: 600,
          },
        ],
      },
    };

    const unprotected = applyDangerousAccidentAndReturn(state, 0);
    const protectedResult = applyDangerousAccidentAndReturn(state, 0, 15);

    expect(protectedResult.incident).toBe(true);
    expect(protectedResult.lostValue).toBeLessThan(unprotected.lostValue);
    expect(protectedResult.lostValue).toBeLessThanOrEqual(425);
    expect(unprotected.retainedCargoValue).toBe(500);
    expect(protectedResult.retainedCargoValue).toBe(600);
  });

  it("사고 후 실제로 남긴 같은 화물 선택에서 정확한 가치와 재료를 함께 계산한다", () => {
    const base = voyageState(5);
    const state: DangerousFishingState = {
      ...base,
      voyage: base.voyage && {
        ...base.voyage,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 10,
            totalValue: 400,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 20,
            totalValue: 600,
          },
        ],
      },
    };

    const result = applyDangerousAccidentAndReturn(state, 0);

    expect(result).toMatchObject({
      incident: true,
      returned: true,
      lostValue: 500,
      retainedCargoValue: 500,
      lostCargo: {
        danger_catch_razor_sardine: 5,
        danger_catch_ironjaw_tuna: 10,
      },
      materials: {
        danger_catch_razor_sardine: 5,
        danger_catch_ironjaw_tuna: 10,
      },
    });
  });

  it("정상 귀환은 모든 화물을 재료 수량으로 넘기고 항해만 비운다", () => {
    const base = voyageState(5);
    const state: DangerousFishingState = {
      ...base,
      codex: {
        ironjaw_tuna: {
          caughtCount: 2,
          bestSizeCm: 151,
          firstCaughtAt: 2_000,
          bestCaughtAt: 3_000,
        },
      },
      voyage: base.voyage && {
        ...base.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 2,
            totalValue: 420,
          },
          {
            fishId: "thunder_ray",
            materialId: "danger_catch_thunder_ray",
            quantity: 1,
            totalValue: 330,
          },
        ],
      },
    };
    const result = returnDangerousVoyage(state);

    expect(result).toMatchObject({
      returned: true,
      incident: false,
      lostValue: 0,
      retainedCargoValue: 750,
      materials: {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 1,
      },
    });
    expect(result.state.voyage).toBeNull();
    expect(result.state.codex).toEqual(state.codex);
  });
});
