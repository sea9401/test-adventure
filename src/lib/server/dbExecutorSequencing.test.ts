import { beforeEach, describe, expect, it, vi } from "vitest";

const tracker = vi.hoisted(() => ({
  active: 0,
  maxActive: 0,
  calls: [] as string[],
}));

async function trackedRead(key: string) {
  tracker.calls.push(key);
  tracker.active += 1;
  tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
  await new Promise((resolve) => setTimeout(resolve, 0));
  tracker.active -= 1;
  return {};
}

vi.mock("@/lib/server/savesKv", () => ({
  readSaves: vi.fn(
    async (_executor, _userId, fallbacks: Record<string, unknown>) => {
      await trackedRead(Object.keys(fallbacks).sort().join(","));
      return fallbacks;
    },
  ),
}));

vi.mock("@/lib/server/v2QuestContext", () => ({
  GUIDE_QUESTS_KEY: "guide-quests.v2",
  parseClaimed: vi.fn(() => new Set<string>()),
}));

vi.mock("@/adventure/data/v2/v2JobCatalog", () => ({
  CATALOG_USES_QUEST_CONDITION: true,
  CATALOG_USES_FARMING_LEVEL_CONDITION: true,
  CATALOG_USES_COOKING_LEVEL_CONDITION: true,
  CATALOG_USES_WOODCUTTING_LEVEL_CONDITION: true,
  CATALOG_USES_MINING_LEVEL_CONDITION: true,
}));

import { readCodexSpBonus } from "./codexSpBonus";
import { readJobUnlockContext } from "./jobUnlockContext";
import type { DbExecutor } from "./savesKv";

beforeEach(() => {
  tracker.active = 0;
  tracker.maxActive = 0;
  tracker.calls = [];
});

describe("transaction 호환 DB helper", () => {
  it("도감 보너스 save를 같은 executor의 한 batch로 조회한다", async () => {
    await readCodexSpBonus({} as DbExecutor, "u-test");

    expect(tracker.calls).toEqual([
      "equipment-codex.v1,fishing-codex.v1",
    ]);
    expect(tracker.maxActive).toBe(1);
  });

  it("직업 해금 조건 save를 같은 executor의 한 batch로 조회한다", async () => {
    await readJobUnlockContext({} as DbExecutor, "u-test");

    expect(tracker.calls).toEqual([
      "cooking.v1,farm.v2,guide-quests.v2,mining-log.v1,woodcutting-log.v1",
    ]);
    expect(tracker.maxActive).toBe(1);
  });
});
