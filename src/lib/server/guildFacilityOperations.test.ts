import { beforeEach, describe, expect, it, vi } from "vitest";

const { readLevel } = vi.hoisted(() => ({ readLevel: vi.fn() }));
vi.mock("@/lib/server/guildFacilities", () => ({
  readGuildFacilityLevel: readLevel,
}));

import {
  accrueGuildFacilityOperations,
  readGuildFacilityOperationsViews,
} from "./guildFacilityOperations";

// guild_facility_operations 한 행만 다루는 트랜잭션 대역.
function operationsTx(row: Record<string, unknown> | null) {
  const saved: Array<Record<string, unknown>> = [];
  let current = row;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (!current) current = { ...value };
        }),
      })),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          for: () => ({ limit: async () => (current ? [current] : []) }),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          current = { ...current, ...value };
          saved.push(value);
        },
      }),
    })),
  };
  return { tx, saved, current: () => current };
}

const now = new Date("2026-10-13T03:00:00.000Z"); // 화요일, KST 주차 2026-10-12

describe("운영 실적 적립", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Lv.5 시설에 8점을 쌓는다", async () => {
    readLevel.mockResolvedValue(5);
    const fx = operationsTx(null);
    const accrued = await accrueGuildFacilityOperations(fx.tx as never, {
      guildId: 7,
      buildingId: "exploration_hq",
      points: 8,
      now,
    });
    expect(accrued).toBe(8);
    expect(fx.current()).toMatchObject({ targetLevel: 6, points: 8, weekPoints: 8 });
  });

  it("같은 주 95점이면 5점만 쌓는다", async () => {
    readLevel.mockResolvedValue(5);
    const fx = operationsTx({
      guildId: 7,
      buildingId: "exploration_hq",
      targetLevel: 6,
      points: 120,
      weekKey: "2026-10-12",
      weekPoints: 95,
    });
    const accrued = await accrueGuildFacilityOperations(fx.tx as never, {
      guildId: 7,
      buildingId: "exploration_hq",
      points: 8,
      now,
    });
    expect(accrued).toBe(5);
    expect(fx.current()).toMatchObject({ points: 125, weekPoints: 100 });
  });

  it("Lv.5 미만 시설은 행을 만들지 않는다", async () => {
    readLevel.mockResolvedValue(4);
    const fx = operationsTx(null);
    const accrued = await accrueGuildFacilityOperations(fx.tx as never, {
      guildId: 7,
      buildingId: "training_ground",
      points: 1,
      now,
    });
    expect(accrued).toBe(0);
    expect(fx.tx.insert).not.toHaveBeenCalled();
  });

  it("Lv.10 시설은 적립하지 않는다", async () => {
    readLevel.mockResolvedValue(10);
    const fx = operationsTx(null);
    expect(
      await accrueGuildFacilityOperations(fx.tx as never, {
        guildId: 7,
        buildingId: "training_ground",
        points: 1,
        now,
      }),
    ).toBe(0);
    expect(fx.tx.insert).not.toHaveBeenCalled();
  });
});

describe("운영 실적 화면 정보", () => {
  function readDb(rows: unknown[]) {
    return {
      select: () => ({ from: () => ({ where: async () => rows }) }),
    } as never;
  }

  it("Lv.5~9 확장 시설만 보여주고 저장값을 현재 목표에 맞춘다", async () => {
    const views = await readGuildFacilityOperationsViews(
      readDb([
        { buildingId: "training_ground", targetLevel: 6, points: 150, weekKey: "2026-10-12", weekPoints: 30 },
        { buildingId: "trade_post", targetLevel: 10, points: 400, weekKey: "2026-10-12", weekPoints: 10 },
      ]),
      7,
      { training_ground: 5, trade_post: 10, dining_hall: 4, guild_smithy: 5, exploration_hq: 7 },
      now,
    );
    expect(views).toEqual({
      training_ground: { targetLevel: 6, points: 150, required: 200, weekPoints: 30, weeklyCap: 100 },
      exploration_hq: { targetLevel: 8, points: 0, required: 300, weekPoints: 0, weeklyCap: 100 },
    });
  });
});
