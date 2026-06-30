import { describe, expect, it } from "vitest";
import {
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_ROOM_REWARDS,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonDayKey,
  gridDungeonKey,
  gridDungeonMovePreview,
  gridDungeonRewardQuota,
  isAtGridDungeonEntrance,
  moveGridDungeonRun,
  parseGridDungeonDailyRewards,
  parseGridDungeonHistory,
  withGridDungeonLayout,
} from "@/adventure/data/v2/gridDungeon";

describe("gridDungeon", () => {
  it("anchors the first entrance on world tile 3,2", () => {
    expect(GRID_DUNGEON_ENTRANCE).toMatchObject({ col: 3, row: 2 });
    expect(isAtGridDungeonEntrance({ col: 3, row: 2 })).toBe(true);
    expect(isAtGridDungeonEntrance({ col: 3, row: 3 })).toBe(false);
  });

  it("starts at the lower center and reveals adjacent tiles", () => {
    const run = createGridDungeonRun(100);
    expect(run.pos).toEqual({ x: 2, y: 4 });
    expect(run.visited).toContain(gridDungeonKey(2, 4));
    expect(run.revealed).toEqual(
      expect.arrayContaining([
        gridDungeonKey(2, 4),
        gridDungeonKey(1, 4),
        gridDungeonKey(3, 4),
        gridDungeonKey(2, 3),
      ]),
    );
  });

  it("blocks walls and clears a monster room once", () => {
    const start = createGridDungeonRun(100);
    const first = moveGridDungeonRun(start, "up", 200);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.run.hp).toBe(8);
    expect(first.run.pendingGold).toBe(GRID_DUNGEON_ROOM_REWARDS.monster.gold);

    const wall = moveGridDungeonRun(first.run, "left", 300);
    expect(wall).toEqual({ ok: false, error: "blocked" });

    const back = moveGridDungeonRun(first.run, "down", 400);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const again = moveGridDungeonRun(back.run, "up", 500);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.run.hp).toBe(8);
    expect(again.run.pendingGold).toBe(GRID_DUNGEON_ROOM_REWARDS.monster.gold);
  });

  it("previews available and blocked movement directions", () => {
    const start = createGridDungeonRun(100);

    expect(gridDungeonMovePreview(start, "up")).toMatchObject({
      available: true,
      tile: "monster",
      cleared: false,
    });
    expect(gridDungeonMovePreview(start, "left")).toMatchObject({
      available: true,
      tile: "empty",
    });

    const first = moveGridDungeonRun(start, "up", 200);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(gridDungeonMovePreview(first.run, "left")).toMatchObject({
      available: false,
      tile: "wall",
      reason: "wall",
    });
  });

  it("keeps route-specific layouts on new runs", () => {
    const vault = createGridDungeonRun(100, Math.random, [], undefined, "vault");
    const guardian = createGridDungeonRun(
      100,
      Math.random,
      [],
      undefined,
      "guardian",
    );

    expect(vault.routeId).toBe("vault");
    expect(gridDungeonMovePreview(vault, "up")).toMatchObject({
      available: true,
      tile: "trap",
    });
    expect(gridDungeonMovePreview(guardian, "up")).toMatchObject({
      available: true,
      tile: "elite",
    });
    expect(withGridDungeonLayout(vault)?.layout[3]?.[2]).toBe("trap");
  });

  it("resolves trap and relic rooms once per run", () => {
    const start = createGridDungeonRun(100, Math.random, [], undefined, "vault");
    const trap = moveGridDungeonRun(start, "up", 200);
    expect(trap.ok).toBe(true);
    if (!trap.ok) return;
    expect(trap.run.hp).toBe(8);
    expect(trap.run.pendingGold).toBe(0);

    const back = moveGridDungeonRun(trap.run, "down", 300);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const trapAgain = moveGridDungeonRun(back.run, "up", 400);
    expect(trapAgain.ok).toBe(true);
    if (!trapAgain.ok) return;
    expect(trapAgain.run.hp).toBe(8);

    const relicStart = createGridDungeonRun(
      100,
      Math.random,
      [],
      undefined,
      "guardian",
    );
    const left = moveGridDungeonRun(relicStart, "left", 200);
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    const relic = moveGridDungeonRun(left.run, "left", 300, null, {
      stone: 2,
    });
    expect(relic.ok).toBe(true);
    if (!relic.ok) return;
    expect(relic.run.pendingGold).toBe(GRID_DUNGEON_ROOM_REWARDS.relic.gold);
    expect(relic.run.pendingDrops).toEqual({ stone: 2 });
  });

  it("raises boss pressure while keeping the fountain route clearable", () => {
    let run = createGridDungeonRun(100);
    const route = [
      "up",
      "up",
      "right",
      "right",
      "left",
      "left",
      "left",
      "up",
      "up",
      "right",
      "right",
    ] as const;
    for (const [idx, dir] of route.entries()) {
      const moved = moveGridDungeonRun(run, dir, 200 + idx);
      expect(moved.ok).toBe(true);
      if (!moved.ok) return;
      run = moved.run;
    }

    expect(run.status).toBe("cleared");
    expect(run.hp).toBe(2);
    expect(run.pendingGold).toBe(
      GRID_DUNGEON_ROOM_REWARDS.monster.gold +
        GRID_DUNGEON_ROOM_REWARDS.elite.gold +
        GRID_DUNGEON_ROOM_REWARDS.boss.gold,
    );
  });

  it("resets daily material reward quota on the KST day boundary", () => {
    const beforeReset = Date.parse("2026-06-28T14:59:59.000Z");
    const afterReset = Date.parse("2026-06-28T15:00:00.000Z");

    expect(gridDungeonDayKey(beforeReset)).toBe("2026-06-28");
    expect(gridDungeonDayKey(afterReset)).toBe("2026-06-29");
    expect(
      parseGridDungeonDailyRewards(
        { dayKey: "2026-06-28", claimed: 2 },
        afterReset,
      ),
    ).toEqual({ dayKey: "2026-06-29", claimed: 0 });
    expect(
      gridDungeonRewardQuota(
        { dayKey: gridDungeonDayKey(afterReset), claimed: 999 },
        afterReset,
      ),
    ).toMatchObject({ claimed: 3, limit: 3, remaining: 0 });
  });

  it("keeps recent dungeon history sorted and capped", () => {
    let history = parseGridDungeonHistory(null);
    for (let i = 0; i < 13; i += 1) {
      history = appendGridDungeonHistory(history, {
        id: `run-${i}`,
        outcome: i % 2 === 0 ? "cleared" : "failed",
        at: 1_000 + i,
        rewardGold: i * 100,
        drops: {},
        exploredTiles: i,
        hp: 10 - (i % 10),
        message: `record ${i}`,
      });
    }

    expect(history).toHaveLength(10);
    expect(history[0]?.id).toBe("run-12");
    expect(history.at(-1)?.id).toBe("run-3");
  });
});
