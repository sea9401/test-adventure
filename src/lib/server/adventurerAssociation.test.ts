import { describe, expect, it, vi } from "vitest";

const { readSave } = vi.hoisted(() => ({
  readSave: vi.fn(async () => ({
    training_ground: {
      weekKey: "2026-08-31",
      source: "guild",
      guildId: 11,
    },
  })),
}));

vi.mock("@/lib/server/savesKv", () => ({
  readSave,
  upsertSave: vi.fn(),
}));

import { readWeeklyFacilitySourceSelection } from "./adventurerAssociation";

describe("weekly facility source read model", () => {
  it("길드 ID를 포함한 현재 주간 시설 선택을 보존한다", async () => {
    await expect(
      readWeeklyFacilitySourceSelection(
        {} as never,
        "user-1",
        "training_ground",
        "2026-08-31",
      ),
    ).resolves.toEqual({
      weekKey: "2026-08-31",
      source: "guild",
      guildId: 11,
    });
  });
});
