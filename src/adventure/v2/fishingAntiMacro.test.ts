import { describe, expect, it } from "vitest";
import {
  FISHING_ANTI_MACRO_FRICTION_MS,
  emptyFishingAntiMacroState,
  fishingAntiMacroFriction,
  parseFishingAntiMacroState,
  recordFishingAntiMacroSample,
  type FishingAntiMacroState,
} from "./fishingAntiMacro";

function recordMany(
  state: FishingAntiMacroState,
  samples: { client: number; server: number; caught?: boolean }[],
): FishingAntiMacroState {
  let next = state;
  for (const [idx, sample] of samples.entries()) {
    next = recordFishingAntiMacroSample(
      next,
      {
        at: 1_000 + idx,
        caught: sample.caught ?? true,
        reason: sample.caught === false ? "too_early" : "ok",
        clientReactionMs: sample.client,
        serverReactionMs: sample.server,
      },
      1_000 + idx,
    ).state;
  }
  return next;
}

describe("fishing anti macro", () => {
  it("normal varied reactions do not trigger friction", () => {
    const state = recordMany(
      emptyFishingAntiMacroState(),
      Array.from({ length: 24 }, (_, i) => ({
        client: 180 + ((i * 47) % 420),
        server: 320 + ((i * 83) % 760),
      })),
    );

    expect(state.suspicion).toBeLessThan(12);
    expect(fishingAntiMacroFriction(state, 10_000).active).toBe(false);
  });

  it("uniform impossible-fast patterns trigger temporary friction", () => {
    let state = emptyFishingAntiMacroState();
    let flagged = false;
    for (let i = 0; i < 14; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 20_000 + i,
          caught: true,
          reason: "ok",
          clientReactionMs: 120,
          serverReactionMs: 90,
        },
        20_000 + i,
      );
      state = result.state;
      flagged ||= result.flagged;
    }

    expect(flagged).toBe(true);
    expect(state.frictionUntil).toBeGreaterThanOrEqual(
      20_013 + FISHING_ANTI_MACRO_FRICTION_MS,
    );
    expect(fishingAntiMacroFriction(state, 20_100)).toMatchObject({
      active: true,
    });
  });

  it("parses unknown or damaged saves defensively", () => {
    expect(parseFishingAntiMacroState(null)).toEqual(
      emptyFishingAntiMacroState(),
    );
    expect(
      parseFishingAntiMacroState({
        suspicion: 99,
        frictionUntil: "x",
        recent: [{ at: 1, reason: "ok", caught: true }],
      }),
    ).toMatchObject({ suspicion: 30, frictionUntil: null, recent: [] });
  });
});
