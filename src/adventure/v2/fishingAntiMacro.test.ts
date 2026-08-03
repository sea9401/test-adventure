import { describe, expect, it } from "vitest";
import {
  emptyFishingAntiMacroState,
  fishingAntiMacroFriction,
  isFishingAntiMacroStrongSignal,
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
        earlyByMs: 0,
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

  it("perfect success and uniform but human-range reactions are observation-only", () => {
    let state = emptyFishingAntiMacroState();
    let signals: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 1_000 + i,
          caught: true,
          reason: "ok",
          clientReactionMs: 340 + (i % 5) * 8,
          serverReactionMs: 360 + (i % 7) * 20,
          earlyByMs: 0,
        },
        1_000 + i,
      );
      state = result.state;
      signals = result.signals;
    }

    expect(state.suspicion).toBe(0);
    expect(fishingAntiMacroFriction(state, 10_000).active).toBe(false);
    expect(signals).toContain("near_perfect_success_rate");
    expect(signals).toContain("uniform_client_reaction");
  });

  it("successful 60~120ms patterns remain observation-only", () => {
    let state = emptyFishingAntiMacroState();
    let flagged = false;
    let signals: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 20_000 + i,
          caught: true,
          reason: "ok",
          clientReactionMs: 120,
          serverReactionMs: 90,
          earlyByMs: 0,
        },
        20_000 + i,
      );
      state = result.state;
      flagged ||= result.flagged;
      signals = result.signals;
    }

    expect(signals).toContain("impossibly_fast_server_reel");
    expect(
      isFishingAntiMacroStrongSignal("impossibly_fast_server_reel"),
    ).toBe(false);
    expect(flagged).toBe(false);
    expect(state.suspicion).toBe(0);
    expect(fishingAntiMacroFriction(state, 20_100).active).toBe(false);
  });

  it("near-bite mistakes do not count as prefire signals", () => {
    let state = emptyFishingAntiMacroState();
    let signals: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 30_000 + i,
          caught: false,
          reason: "too_early",
          clientReactionMs: 0,
          serverReactionMs: 0,
          earlyByMs: 299,
        },
        30_000 + i,
      );
      state = result.state;
      signals = result.signals;
    }

    expect(signals).not.toContain("repeated_prefire");
    expect(state.suspicion).toBe(0);
  });

  it("counts only the fifth substantial prefire in the recent window", () => {
    let state = emptyFishingAntiMacroState();
    let signals: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 40_000 + i,
          caught: false,
          reason: "too_early",
          clientReactionMs: 0,
          serverReactionMs: 0,
          earlyByMs: 300,
        },
        40_000 + i,
      );
      state = result.state;
      signals = result.signals;
      if (i < 4) expect(signals).not.toContain("repeated_prefire");
    }

    expect(signals).toContain("repeated_prefire");
    expect(state.suspicion).toBe(4);
  });

  it("keeps a single sub-60ms post-bite response observation-only", () => {
    const result = recordFishingAntiMacroSample(
      emptyFishingAntiMacroState(),
      {
        at: 50_000,
        caught: false,
        reason: "too_early",
        clientReactionMs: 20,
        serverReactionMs: 20,
        earlyByMs: 0,
      },
      50_000,
    );

    expect(result.signals).toContain("very_fast_post_bite_reel");
    expect(result.signals).not.toContain("impossibly_fast_post_bite_reel");
    expect(
      isFishingAntiMacroStrongSignal("impossibly_fast_post_bite_reel"),
    ).toBe(true);
    expect(result.state.suspicion).toBe(0);
    expect(result.flagged).toBe(false);
  });

  it("promotes the third sub-60ms response in the latest twenty samples", () => {
    let state = emptyFishingAntiMacroState();
    let signals: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 51_000 + i,
          caught: false,
          reason: "too_early",
          clientReactionMs: 20,
          serverReactionMs: 20,
          earlyByMs: 0,
        },
        51_000 + i,
      );
      state = result.state;
      signals = result.signals;
      if (i < 2) {
        expect(signals).not.toContain("impossibly_fast_post_bite_reel");
      }
    }

    expect(signals).toContain("impossibly_fast_post_bite_reel");
    expect(state.suspicion).toBe(6);
  });

  it("does not renew friction or emit a flag while a normal sample decays risk", () => {
    let state = emptyFishingAntiMacroState();
    let flagged = false;
    for (let i = 0; i < 5; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 52_000 + i,
          caught: false,
          reason: "too_early",
          clientReactionMs: 20,
          serverReactionMs: 20,
          earlyByMs: 0,
        },
        52_000 + i,
      );
      state = result.state;
      flagged ||= result.flagged;
    }
    expect(flagged).toBe(true);
    expect(state.suspicion).toBeGreaterThanOrEqual(12);

    const decayed = recordFishingAntiMacroSample(
      state,
      {
        at: 100_000,
        caught: true,
        reason: "ok",
        clientReactionMs: 300,
        serverReactionMs: 350,
        earlyByMs: 0,
      },
      100_000,
    );

    expect(decayed.state.suspicion).toBeGreaterThanOrEqual(12);
    expect(decayed.frictionMs).toBe(0);
    expect(decayed.flagged).toBe(false);
    expect(fishingAntiMacroFriction(decayed.state, 100_000).active).toBe(false);
  });

  it("repeated substantial prefire still triggers temporary friction", () => {
    let state = emptyFishingAntiMacroState();
    let flagged = false;
    for (let i = 0; i < 12; i += 1) {
      const result = recordFishingAntiMacroSample(
        state,
        {
          at: 60_000 + i,
          caught: false,
          reason: "too_early",
          clientReactionMs: 0,
          serverReactionMs: 0,
          earlyByMs: 300,
        },
        60_000 + i,
      );
      state = result.state;
      flagged ||= result.flagged;
    }

    expect(isFishingAntiMacroStrongSignal("repeated_prefire")).toBe(true);
    expect(flagged).toBe(true);
    expect(fishingAntiMacroFriction(state, 60_100).active).toBe(true);
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
