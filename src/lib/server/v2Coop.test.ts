import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGuildId } = vi.hoisted(() => ({
  getGuildId: vi.fn(async () => 7),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId }));

import {
  createCoopBossSession,
  expireStaleCoopSessions,
  summonFishingCoopBoss,
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

  it("독혈 군주 세션은 체력 2,340만으로 생성한다", async () => {
    const inserted: Record<string, unknown>[] = [];

    await createCoopBossSession(sessionTx(inserted) as never, {
      kindId: "toxic_blood_lord",
      userId: "owner",
      summonerName: "독혈 도전자",
      now: new Date("2026-09-03T00:00:00.000Z"),
      visibility: "summoner_only",
    });

    expect(inserted[0]).toMatchObject({
      hp: 23_400_000,
      maxHp: 23_400_000,
    });
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

  it("불멸의 광전왕 세션은 첫 생명과 재생 3회 상태로 생성한다", async () => {
    const inserted: Record<string, unknown>[] = [];

    await createCoopBossSession(sessionTx(inserted) as never, {
      kindId: "immortal_berserker",
      userId: "owner",
      summonerName: "광전왕 도전자",
      now: new Date("2026-09-02T00:00:00.000Z"),
      visibility: "summoner_only",
    });

    expect(inserted[0]?.mechanicState).toMatchObject({
      immortalBerserker: {
        kind: "immortal_berserker",
        lifeIndex: 0,
        regenActionCount: 0,
        regenUsesRemaining: 3,
        revivalsCompleted: 0,
      },
    });
  });

  it("만료 세션은 NOT NULL 제약을 지키며 메커니즘 상태를 빈 객체로 비운다", async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    const ex = { update: vi.fn(() => ({ set })) };

    await expireStaleCoopSessions(
      ex as never,
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      mechanicState: {},
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

  it("소환 미끼는 확률 굴림 없이 심연어룡을 확정 소환한다", async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx = fakeTx([], inserted);

    const result = await summonFishingCoopBoss(tx as never, {
      userId: "angler-1",
      summonerName: "낚시꾼",
      now: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      boss: { kind: "abyssal_tyrant", name: "심연어룡" },
    });
    expect(inserted).toHaveLength(1);
  });

  it("본인이 소환한 심연어룡이 활성 상태면 중복 소환하지 않는다", async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx = fakeTx([{ summonerId: "angler-1" }], inserted);

    const result = await summonFishingCoopBoss(tx as never, {
      userId: "angler-1",
      summonerName: "낚시꾼",
      now: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, error: "already_active" });
    expect(inserted).toHaveLength(0);
  });

  it("심연어룡 활성 세션이 20개면 서버 상한으로 소환하지 않는다", async () => {
    const inserted: Record<string, unknown>[] = [];
    const active = Array.from({ length: 20 }, (_, index) => ({
      summonerId: `other-${index}`,
    }));
    const tx = fakeTx(active, inserted);

    const result = await summonFishingCoopBoss(tx as never, {
      userId: "angler-1",
      summonerName: "낚시꾼",
      now: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, error: "capacity_reached" });
    expect(inserted).toHaveLength(0);
  });
});

function fakeTx(
  active: Record<string, unknown>[],
  inserted: Record<string, unknown>[],
) {
  return {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => active) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        inserted.push(value);
      }),
    })),
  };
}
