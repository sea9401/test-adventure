import { describe, expect, it, vi } from "vitest";
import {
  lockSavesForUpdate,
  readSaves,
  upsertSaves,
  type DbExecutor,
} from "./savesKv";

type SaveRow = { key: string; value: unknown };

function selectExecutor(rows: SaveRow[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.for = vi.fn(async () => rows);
  chain.then = vi.fn((resolve: (value: SaveRow[]) => unknown) =>
    Promise.resolve(rows).then(resolve),
  );
  const select = vi.fn(() => chain);
  const executor = {
    select,
  } as unknown as DbExecutor;
  return { executor, chain, select };
}

function insertExecutor() {
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const captured: { rows?: unknown } = {};
  const values = vi.fn((rows: unknown) => {
    captured.rows = rows;
    return { onConflictDoUpdate };
  });
  const executor = {
    insert: vi.fn(() => ({ values })),
  } as unknown as DbExecutor;
  return { executor, values, onConflictDoUpdate, captured };
}

describe("savesKv multi-key helpers", () => {
  it("reads requested keys in one query and fills missing values from fallbacks", async () => {
    const { executor, select } = selectExecutor([
      { key: "character.v2", value: { level: 31 } },
    ]);

    const result = await readSaves(executor, "u-1", {
      "character.v2": { level: 1 },
      "inventory.v2": { hpCharges: 0 },
    });

    expect(result).toEqual({
      "character.v2": { level: 31 },
      "inventory.v2": { hpCharges: 0 },
    });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("locks all requested rows with one deterministic ordered query", async () => {
    const { executor, chain } = selectExecutor([
      { key: "skills.v2", value: { learned: ["slash"] } },
      { key: "proficiency.v2", value: { points: 7 } },
    ]);

    const result = await lockSavesForUpdate(executor, "u-1", {
      "skills.v2": {},
      "proficiency.v2": {},
    });

    expect(result).toEqual({
      "skills.v2": { learned: ["slash"] },
      "proficiency.v2": { points: 7 },
    });
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.for).toHaveBeenCalledWith("update");
  });

  it("does not issue SQL for empty batches", async () => {
    const { executor, select } = selectExecutor([]);

    await expect(readSaves(executor, "u-1", {})).resolves.toEqual({});
    await expect(lockSavesForUpdate(executor, "u-1", {})).resolves.toEqual({});
    await expect(upsertSaves(executor, "u-1", {})).resolves.toBeUndefined();

    expect(select).not.toHaveBeenCalled();
  });

  it("upserts multiple keys in one statement with one shared timestamp", async () => {
    const { executor, values, onConflictDoUpdate, captured } = insertExecutor();

    await upsertSaves(executor, "u-1", {
      "character.v2": { level: 31 },
      "inventory.v2": { hpCharges: 19 },
    });

    expect(values).toHaveBeenCalledTimes(1);
    const rows = captured.rows as Array<{
      userId: string;
      key: string;
      value: unknown;
      version: number;
      updatedAt: Date;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows.map(({ userId, key, value, version }) => ({ userId, key, value, version }))).toEqual([
      { userId: "u-1", key: "character.v2", value: { level: 31 }, version: 1 },
      { userId: "u-1", key: "inventory.v2", value: { hpCharges: 19 }, version: 1 },
    ]);
    expect(rows[0].updatedAt).toBe(rows[1].updatedAt);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
