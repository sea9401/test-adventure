import { describe, expect, it } from "vitest";
import {
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_ROOM_REWARDS,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonBossReached,
  gridDungeonDayKey,
  gridDungeonDropDepth,
  gridDungeonKey,
  gridDungeonMovePreview,
  gridDungeonRouteSummary,
  gridDungeonRewardQuota,
  gridDungeonRoomGold,
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
    expect(run.hp).toBe(10);
    expect(run.maxHp).toBe(10);
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

  it("carries real combat hp into the next dungeon room", () => {
    const start = createGridDungeonRun(
      100,
      Math.random,
      [],
      undefined,
      "balanced",
      120,
    );
    const combat = {
      outcome: "win" as const,
      hpLost: 37,
      rewardGold: 850,
      drops: {},
      message: "유적 경비병을 쓰러뜨렸습니다.",
      summary: {
        enemyName: "유적 경비병",
        outcome: "win" as const,
        turns: 3,
        hpLost: 37,
        playerHpBefore: 120,
        playerHpAfter: 83,
        playerMaxHp: 120,
        enemyHp: 0,
        enemyMaxHp: 100,
        rewardGold: 850,
        log: [],
      },
    };
    const first = moveGridDungeonRun(start, "up", 200, combat);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.run.hp).toBe(83);
    expect(first.run.maxHp).toBe(120);
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
    expect(withGridDungeonLayout(guardian)?.layout[1]?.[2]).toBe("empty");
    expect(gridDungeonRoomGold("balanced", "elite")).toBe(
      GRID_DUNGEON_ROOM_REWARDS.elite.gold,
    );
    expect(gridDungeonRoomGold("guardian", "elite")).toBe(3_400);
    expect(gridDungeonRoomGold("guardian", "relic")).toBe(2_000);
    expect(gridDungeonRoomGold("vault", "treasure")).toBeGreaterThan(
      gridDungeonRoomGold("balanced", "treasure"),
    );
  });

  it("summarizes route risk and reward for the selection UI", () => {
    const balanced = gridDungeonRouteSummary("balanced");
    const guardian = gridDungeonRouteSummary("guardian");
    const vault = gridDungeonRouteSummary("vault");

    expect(guardian.expectedGold).toBeGreaterThan(balanced.expectedGold);
    expect(guardian.combatRooms).toBeGreaterThanOrEqual(
      balanced.combatRooms,
    );
    expect(vault.treasureRooms).toBeGreaterThan(balanced.treasureRooms);
    expect(vault.trapRooms).toBeGreaterThan(0);
    expect(guardian.bossGold).toBe(7_800);
    expect(vault.expectedGold).toBeGreaterThan(balanced.expectedGold);
    expect(vault.avgMaterialDepth).toBeGreaterThan(balanced.avgMaterialDepth);
    expect(gridDungeonDropDepth("guardian", "boss")).toBeGreaterThan(
      gridDungeonDropDepth("balanced", "boss"),
    );
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
    expect(relic.run.pendingGold).toBe(gridDungeonRoomGold("guardian", "relic"));
    expect(relic.run.pendingDrops).toEqual({ stone: 2 });
  });

  it("scales traps and fountains from expedition max hp", () => {
    const start = createGridDungeonRun(
      100,
      Math.random,
      [],
      undefined,
      "vault",
      100,
    );
    const trap = moveGridDungeonRun(start, "up", 200);
    expect(trap.ok).toBe(true);
    if (!trap.ok) return;
    expect(trap.run.hp).toBe(80);

    const fountainStart = {
      ...start,
      routeId: "balanced" as const,
      pos: { x: 2, y: 3 },
      hp: 40,
      visited: [gridDungeonKey(2, 3)],
      revealed: [gridDungeonKey(2, 3), gridDungeonKey(2, 2)],
      clearedEvents: [gridDungeonKey(2, 3)],
    };
    const fountain = moveGridDungeonRun(fountainStart, "up", 300);
    expect(fountain.ok).toBe(true);
    if (!fountain.ok) return;
    expect(fountain.run.hp).toBe(90);
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
        routeId: "balanced",
        at: 1_000 + i,
        rewardGold: i * 100,
        drops: {},
        materialCount: 0,
        rewardLimited: false,
        exploredTiles: i,
        hp: 10 - (i % 10),
        supporterCount: 0,
        bossReached: i % 2 === 0,
        combatCount: i,
        totalCombatTurns: i * 3,
        durationMs: i * 1_000,
        message: `record ${i}`,
        detailReason: `detail ${i}`,
      });
    }

    expect(history).toHaveLength(10);
    expect(history[0]?.id).toBe("run-12");
    expect(history.at(-1)?.id).toBe("run-3");
  });

  it("keeps operational metrics in dungeon history", () => {
    const parsed = parseGridDungeonHistory([
      {
        id: "run-op",
        outcome: "cleared",
        routeId: "guardian",
        at: 2_000,
        rewardGold: 10_000,
        drops: { stone: 2 },
        materialCount: 2,
        rewardLimited: true,
        exploredTiles: 9,
        hp: 77,
        supporterCount: 2,
        bossReached: true,
        combatCount: 4,
        totalCombatTurns: 18,
        durationMs: 61_000,
        message: "ok",
        detailReason: "출구 도달 후 골드만 정산",
      },
    ]);

    expect(parsed[0]).toMatchObject({
      routeId: "guardian",
      supporterCount: 2,
      bossReached: true,
      combatCount: 4,
      totalCombatTurns: 18,
      durationMs: 61_000,
      materialCount: 2,
      rewardLimited: true,
      detailReason: "출구 도달 후 골드만 정산",
    });
  });

  it("detects boss reach for failed boss attempts", () => {
    const bossAttempt = {
      ...createGridDungeonRun(100),
      pos: { x: 2, y: 0 },
      visited: [gridDungeonKey(2, 4), gridDungeonKey(2, 0)],
      clearedEvents: [gridDungeonKey(2, 4), gridDungeonKey(2, 0)],
      bossDefeated: false,
    };

    expect(gridDungeonBossReached(bossAttempt)).toBe(true);
  });
});
