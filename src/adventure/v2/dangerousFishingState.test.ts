import { describe, expect, it } from "vitest";
import {
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  dangerousCatchMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import { createDangerousEncounter } from "./dangerousFishingEncounter";
import {
  applyDangerousAccidentAndReturn,
  dangerousRiskPreview,
  emptyDangerousFishingState,
  parseDangerousFishingState,
  resolvePersonalEncounter,
  returnDangerousVoyage,
  startDangerousVoyage,
  startPersonalEncounter,
  type DangerousFishingState,
} from "./dangerousFishingState";

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
  it("새 상태는 스타터 세트와 무제한 기본 미끼를 안전하게 갖춘다", () => {
    expect(emptyDangerousFishingState()).toEqual({
      version: 1,
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
      version: 1,
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
    if (!started.ok || !started.state.voyage?.encounter) {
      throw new Error("fixture encounter did not start");
    }
    const caughtEncounter = {
      ...started.state.voyage.encounter,
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
    if (!started.ok || !started.state.voyage?.encounter) {
      throw new Error("fixture encounter did not start");
    }
    const failed = {
      ...started.state.voyage.encounter,
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
      });
    }
  });

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
      materials: {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 1,
      },
    });
    expect(result.state.voyage).toBeNull();
    expect(result.state.codex).toEqual(state.codex);
  });
});
