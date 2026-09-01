import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGuildId } = vi.hoisted(() => ({
  getGuildId: vi.fn(async () => 7),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId }));

import { trySpawnFishingCoopBoss } from "./v2Coop";

describe("낚시 협동 보스 출현", () => {
  beforeEach(() => {
    getGuildId.mockClear();
  });

  it("심연어룡은 발견한 사람만 볼 수 있는 상태로 생성한다", async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(async () => []) })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: Record<string, unknown>) => {
          inserted.push(value);
        }),
      })),
    };

    const result = await trySpawnFishingCoopBoss(tx as never, {
      userId: "angler-1",
      summonerName: "낚시꾼",
      now: new Date("2026-08-16T00:00:00.000Z"),
      rng: () => 0,
    });

    expect(result).toMatchObject({ kind: "abyssal_tyrant" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      summonerId: "angler-1",
      summonerGuildId: 7,
      visibility: "summoner_only",
    });
  });
});
