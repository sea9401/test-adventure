import { describe, expect, it } from "vitest";
import {
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_DAILY_REWARD_LIMIT,
  GRID_DUNGEON_HISTORY_LIMIT,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonDayKey,
  gridDungeonKey,
  gridDungeonRewardQuota,
  isAtGridDungeonEntrance,
  moveGridDungeonRun,
  parseGridDungeonDailyRewards,
  parseGridDungeonHistory,
  rollGridDungeonDrops,
} from "@/adventure/data/v2/gridDungeon";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { REFORGE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2EquipVariance";

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
    expect(first.run.pendingGold).toBe(0);

    const wall = moveGridDungeonRun(first.run, "left", 300);
    expect(wall).toEqual({ ok: false, error: "blocked" });

    const back = moveGridDungeonRun(first.run, "down", 400);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const again = moveGridDungeonRun(back.run, "up", 500);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.run.hp).toBe(8);
    expect(again.run.pendingGold).toBe(0);
  });

  it("applies resolved combat to a combat room", () => {
    const start = createGridDungeonRun(100);
    const moved = moveGridDungeonRun(start, "up", 200, {
      outcome: "win",
      hpLost: 1,
      rewardGold: 0,
      drops: { [ENHANCE_STONE_MATERIAL_ID.red]: 1 },
      message: "들개를 쓰러뜨렸습니다.",
      summary: {
        enemyName: "들개",
        outcome: "win",
        turns: 3,
        hpLost: 1,
        playerHpBefore: 100,
        playerHpAfter: 88,
        playerMaxHp: 100,
        enemyHp: 0,
        enemyMaxHp: 38,
        rewardGold: 0,
        log: ["공격", "승리"],
      },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.run.hp).toBe(9);
    expect(moved.run.pendingGold).toBe(0);
    expect(moved.run.pendingDrops).toEqual({
      [ENHANCE_STONE_MATERIAL_ID.red]: 1,
    });
    expect(moved.run.lastMessage).toBe("들개를 쓰러뜨렸습니다.");
    expect(moved.run.lastCombat).toMatchObject({
      enemyName: "들개",
      turns: 3,
      hpLost: 1,
      rewardGold: 0,
    });
  });

  it("rolls grid dungeon drops from the event table", () => {
    expect(rollGridDungeonDrops("elite", () => 0)).toEqual({
      [ENHANCE_STONE_MATERIAL_ID.red]: 1,
      [ENHANCE_STONE_MATERIAL_ID.blue]: 1,
      [REFORGE_STONE_MATERIAL_ID.basic]: 1,
    });
    expect(rollGridDungeonDrops("boss", () => 0.99)).toEqual({});
  });

  it("resets daily reward claims on the KST day boundary", () => {
    const beforeReset = Date.parse("2026-06-28T14:59:59.000Z");
    const afterReset = Date.parse("2026-06-28T15:00:00.000Z");
    expect(gridDungeonDayKey(beforeReset)).toBe("2026-06-28");
    expect(gridDungeonDayKey(afterReset)).toBe("2026-06-29");

    const yesterday = parseGridDungeonDailyRewards(
      { dayKey: "2026-06-28", claimed: 2 },
      afterReset,
    );
    expect(yesterday).toEqual({ dayKey: "2026-06-29", claimed: 0 });
  });

  it("caps daily reward quota at the configured limit", () => {
    const now = Date.parse("2026-06-29T00:00:00.000Z");
    expect(
      gridDungeonRewardQuota({ dayKey: gridDungeonDayKey(now), claimed: 999 }, now),
    ).toEqual({
      dayKey: "2026-06-29",
      limit: GRID_DUNGEON_DAILY_REWARD_LIMIT,
      claimed: GRID_DUNGEON_DAILY_REWARD_LIMIT,
      remaining: 0,
    });
  });

  it("keeps grid dungeon history sorted and capped", () => {
    let history = parseGridDungeonHistory(null);
    for (let i = 0; i < GRID_DUNGEON_HISTORY_LIMIT + 3; i += 1) {
      history = appendGridDungeonHistory(history, {
        id: `run-${i}`,
        outcome: i % 2 === 0 ? "cleared" : "failed",
        at: 1_000 + i,
        rewardGold: i * 100,
        exploredTiles: i,
        hp: 10 - (i % 10),
        message: `record ${i}`,
      });
    }
    expect(history.entries).toHaveLength(GRID_DUNGEON_HISTORY_LIMIT);
    expect(history.entries[0]?.id).toBe(`run-${GRID_DUNGEON_HISTORY_LIMIT + 2}`);
    expect(history.entries.at(-1)?.id).toBe("run-3");
  });
});
