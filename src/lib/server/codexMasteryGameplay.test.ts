import { describe, expect, it, vi } from "vitest";
import type { CodexResearchEvent } from "@/adventure/data/v2/codexResearch";
import type { CodexMasteryRecordInput } from "./codexMasteryService";
import {
  createCodexMasteryGameplayRecorder,
  type CodexMasteryGameplayEvent,
  type CodexMasteryGameplayRecorderRuntime,
} from "./codexMasteryGameplay";

const NOW = new Date("2026-08-20T03:04:05.000Z");
const ENABLED = {
  recordingEnabled: true,
  sealsEnabled: false,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
};

function runtime(options: {
  enabled?: boolean;
  monthlyEnabled?: boolean;
  fail?: boolean;
  monthlyFail?: boolean;
} = {}) {
  const inputs: CodexMasteryRecordInput[] = [];
  const monthlyBatches: Array<{
    userId: string;
    events: readonly CodexResearchEvent[];
    now: Date;
  }> = [];
  const value: CodexMasteryGameplayRecorderRuntime<object> = {
    async readSettings() {
      return {
        ...ENABLED,
        recordingEnabled: options.enabled !== false,
        monthlyProgressEnabled: options.monthlyEnabled === true,
      };
    },
    async record(_executor, input) {
      inputs.push(input);
      if (options.fail) throw new Error("record failed");
      return { recorded: false as const, reason: "unchanged" as const };
    },
    async recordMonthly(_executor, userId, events, now) {
      monthlyBatches.push({ userId, events, now });
      if (options.monthlyFail) throw new Error("monthly record failed");
      return { recorded: false as const, reason: "unchanged" as const };
    },
  };
  return { value, inputs, monthlyBatches };
}

describe("codex mastery gameplay recorder", () => {
  it("aggregates matching events and preserves the greatest fish size", async () => {
    // Break caught: a batched action writes once per raw event or loses a later personal best.
    const fake = runtime();
    const record = createCodexMasteryGameplayRecorder(fake.value);
    const events: CodexMasteryGameplayEvent[] = [
      {
        category: "job",
        entryId: "warrior",
        amount: 4,
        source: "job.victory",
      },
      {
        category: "fish",
        entryId: "carp",
        amount: 1,
        bestValue: 80,
        source: "fishing.catch",
      },
      {
        category: "monster",
        entryId: "bat",
        amount: 3,
        source: "hunt.victory",
      },
      {
        category: "fish",
        entryId: "carp",
        amount: 2,
        bestValue: 90,
        source: "fishing.catch",
      },
      {
        category: "fish",
        entryId: "carp",
        amount: 0,
        bestValue: 70,
        source: "fishing.catch",
      },
    ];

    const results = await record({}, "user-1", events, NOW);

    expect(results).toHaveLength(3);
    expect(fake.inputs).toEqual([
      {
        userId: "user-1",
        category: "fish",
        entryId: "carp",
        mutation: { amount: 3, discovered: true, bestValue: 90 },
        source: "fishing.catch",
      },
      {
        userId: "user-1",
        category: "job",
        entryId: "warrior",
        mutation: { amount: 4, discovered: true },
        source: "job.victory",
      },
      {
        userId: "user-1",
        category: "monster",
        entryId: "bat",
        mutation: { amount: 3, discovered: true },
        source: "hunt.victory",
      },
    ]);
  });

  it("aggregates equipment, cooking, and life events with exact sources", async () => {
    // Break caught: content integrations either lose batch quantities or record them under a transferable source.
    const fake = runtime();
    const record = createCodexMasteryGameplayRecorder(fake.value);
    const events: CodexMasteryGameplayEvent[] = [
      {
        category: "equipment",
        entryId: "v2_iron_sword",
        amount: 1,
        source: "equipment.drop",
      },
      {
        category: "cooking",
        entryId: "grilled_fish",
        amount: 3,
        source: "cooking.complete",
      },
      {
        category: "life",
        entryId: "region:fishing:river",
        amount: 7,
        source: "life.complete",
      },
      {
        category: "equipment",
        entryId: "v2_iron_sword",
        amount: 2,
        source: "equipment.drop",
      },
      {
        category: "equipment",
        entryId: "v2_iron_sword",
        amount: 1,
        source: "equipment.craft",
      },
    ];

    await record({}, "user-1", events, NOW);

    expect(fake.inputs).toEqual([
      {
        userId: "user-1",
        category: "cooking",
        entryId: "grilled_fish",
        mutation: { amount: 3, discovered: true },
        source: "cooking.complete",
      },
      {
        userId: "user-1",
        category: "equipment",
        entryId: "v2_iron_sword",
        mutation: { amount: 1, discovered: true },
        source: "equipment.craft",
      },
      {
        userId: "user-1",
        category: "equipment",
        entryId: "v2_iron_sword",
        mutation: { amount: 3, discovered: true },
        source: "equipment.drop",
      },
      {
        userId: "user-1",
        category: "life",
        entryId: "region:fishing:river",
        mutation: { amount: 7, discovered: true },
        source: "life.complete",
      },
    ]);
  });

  it("reads settings once and performs no records while disabled", async () => {
    // Break caught: a disabled rollout still locks or creates mastery rows for gameplay actions.
    const fake = runtime({ enabled: false });
    const readSettings = vi.spyOn(fake.value, "readSettings");
    const record = createCodexMasteryGameplayRecorder(fake.value);

    await expect(record({}, "user-1", [{
      category: "job",
      entryId: "warrior",
      amount: 1,
      source: "job.activity",
    }], NOW)).resolves.toEqual([]);

    expect(readSettings).toHaveBeenCalledTimes(1);
    expect(fake.inputs).toEqual([]);
    expect(fake.monthlyBatches).toEqual([]);
  });

  it("records one sorted monthly aggregate while permanent recording is off", async () => {
    const fake = runtime({ enabled: false, monthlyEnabled: true });
    const record = createCodexMasteryGameplayRecorder(fake.value);
    const events: CodexMasteryGameplayEvent[] = [
      {
        category: "monster",
        entryId: "bat",
        amount: 2,
        source: "hunt.victory",
      },
      {
        category: "fish",
        entryId: "carp",
        amount: 1,
        bestValue: 80,
        source: "fishing.catch",
      },
      {
        category: "fish",
        entryId: "carp",
        amount: 2,
        bestValue: 90,
        source: "fishing.catch",
      },
    ];

    await expect(record({}, "user-1", events, NOW)).resolves.toEqual([]);
    expect(fake.inputs).toEqual([]);
    expect(fake.monthlyBatches).toEqual([{
      userId: "user-1",
      now: NOW,
      events: [
        {
          category: "fish",
          entryId: "carp",
          amount: 3,
          bestValue: 90,
          source: "fishing.catch",
        },
        {
          category: "monster",
          entryId: "bat",
          amount: 2,
          source: "hunt.victory",
        },
      ],
    }]);
  });

  it("uses the same aggregate for permanent rows and one monthly batch", async () => {
    const fake = runtime({ monthlyEnabled: true });
    const record = createCodexMasteryGameplayRecorder(fake.value);
    const events: CodexMasteryGameplayEvent[] = [{
      category: "job",
      entryId: "warrior",
      amount: 2,
      source: "job.activity",
    }];

    await record({}, "user-1", events, NOW);

    expect(fake.inputs).toHaveLength(1);
    expect(fake.monthlyBatches).toEqual([{
      userId: "user-1",
      events,
      now: NOW,
    }]);
  });

  it("rejects unsafe aggregate counts and malformed fish sizes before recording", async () => {
    // Break caught: batch aggregation overflows a safe integer or persists a non-finite best value.
    const fake = runtime();
    const record = createCodexMasteryGameplayRecorder(fake.value);

    await expect(record({}, "user-1", [
      {
        category: "job",
        entryId: "warrior",
        amount: Number.MAX_SAFE_INTEGER,
        source: "job.activity",
      },
      {
        category: "job",
        entryId: "warrior",
        amount: 1,
        source: "job.activity",
      },
    ], NOW)).rejects.toThrow("safe integer");
    await expect(record({}, "user-1", [{
      category: "fish",
      entryId: "carp",
      amount: 1,
      bestValue: Number.NaN,
      source: "fishing.catch",
    }], NOW)).rejects.toThrow("bestValue");
    expect(fake.inputs).toEqual([]);
    expect(fake.monthlyBatches).toEqual([]);
  });

  it("propagates central recorder failures to the game transaction", async () => {
    // Break caught: mastery persistence failure is swallowed and the game reward can still commit.
    const fake = runtime({ fail: true });
    const record = createCodexMasteryGameplayRecorder(fake.value);

    await expect(record({}, "user-1", [{
      category: "job",
      entryId: "warrior",
      amount: 1,
      source: "job.training",
    }], NOW)).rejects.toThrow("record failed");
  });

  it("propagates monthly recorder failures to the game transaction", async () => {
    const fake = runtime({
      enabled: false,
      monthlyEnabled: true,
      monthlyFail: true,
    });
    const record = createCodexMasteryGameplayRecorder(fake.value);

    await expect(record({}, "user-1", [{
      category: "job",
      entryId: "warrior",
      amount: 1,
      source: "job.training",
    }], NOW)).rejects.toThrow("monthly record failed");
  });
});
