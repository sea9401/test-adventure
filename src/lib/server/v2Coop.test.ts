import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGuildId } = vi.hoisted(() => ({
  getGuildId: vi.fn(async () => 7),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId }));

import {
  createCoopBossSession,
  expireStaleCoopSessions,
  trySpawnFishingCoopBoss,
} from "./v2Coop";

describe("개인 보스 세션 상태", () => {
  function sessionTx(inserted: Record<string, unknown>[]) {
    return {
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
  }

  it("추적 병기 세션은 추적 게이지 0으로 생성한다", async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx = sessionTx(inserted);

    await createCoopBossSession(tx as never, {
      kindId: "tracking_weapon",
      userId: "owner",
      summonerName: "추적자",
      now: new Date("2026-08-30T00:00:00.000Z"),
      visibility: "summoner_only",
    });

    expect(inserted[0]?.mechanicState).toMatchObject({ trackingThreat: 0 });
  });

  it("불괴의 성채 세션은 100% 방벽 시험 상태로 생성한다", async () => {
    const inserted: Record<string, unknown>[] = [];

    await createCoopBossSession(sessionTx(inserted) as never, {
      kindId: "invincible_fortress",
      userId: "owner",
      summonerName: "성채 도전자",
      now: new Date("2026-09-01T00:00:00.000Z"),
      visibility: "summoner_only",
    });

    expect(inserted[0]?.mechanicState).toMatchObject({
      fortress: {
        kind: "invincible_fortress",
        completedBarrierCount: 0,
        activeBarrierIndex: 0,
        barrierTicksRemaining: 400,
        barrierDamage: 0,
        enrageTier: 0,
        barrierResults: [],
      },
    });
  });

  it("만료 세션은 메커니즘 상태도 함께 비운다", async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    const ex = { update: vi.fn(() => ({ set })) };

    await expireStaleCoopSessions(
      ex as never,
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      mechanicState: null,
    }));
  });
});

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
