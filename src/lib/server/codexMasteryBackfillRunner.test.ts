import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { db } from "@/db";
import { savesKv } from "@/db/schema";
import {
  applyCodexMasteryBackfillUser,
  listCodexMasteryBackfillUserIds,
  previewCodexMasteryBackfillUser,
  runCodexMasteryBackfillUserWithRuntime,
  type CodexMasteryBackfillRunnerRuntime,
} from "./codexMasteryBackfillRunner";

function runtime(options: { completed?: boolean; failSync?: boolean } = {}) {
  const events: string[] = [];
  const readExecutor = { mode: "read" };
  const observedExecutors: object[] = [];
  const value: CodexMasteryBackfillRunnerRuntime<object> = {
    readExecutor,
    async transaction(run) {
      events.push("transaction");
      return run({});
    },
    async readMarker(executor, _userId, lock) {
      observedExecutors.push(executor);
      events.push(`marker:${lock ? "lock" : "read"}`);
      return options.completed ? { version: 1 } : {};
    },
    async readSource(_executor, _userId, lock) {
      events.push(`source:${lock ? "lock" : "read"}`);
      return {
        fishingCodex: {
          fish: { carp: { registered: true, caughtEver: true, totalCaught: 30, bestSize: 80 } },
        },
      };
    },
    async readProgress() {
      events.push("progress");
      return [];
    },
    async syncTarget(_executor, _userId, target) {
      events.push(`sync:${target.category}:${target.entryId}`);
      if (options.failSync) throw new Error("sync failed");
      return { recorded: true, scoreDeltaMilli: 1 };
    },
    async writeMarker() {
      events.push("marker:write");
    },
  };
  return { value, events, readExecutor, observedExecutors };
}

describe("codex mastery backfill runner", () => {
  it("exposes separate preview and apply operation entry points", () => {
    expect(previewCodexMasteryBackfillUser).toBeTypeOf("function");
    expect(applyCodexMasteryBackfillUser).toBeTypeOf("function");
  });

  it("previews without a transaction or writes", async () => {
    const fake = runtime();
    const result = await runCodexMasteryBackfillUserWithRuntime(
      fake.value,
      "user-1",
      { apply: false, now: new Date("2026-08-20T00:00:00.000Z") },
    );

    expect(result).toMatchObject({ skipped: false, applied: false, targets: 1 });
    expect(result.scoreDeltaMilli).toBeGreaterThan(0);
    expect(fake.events).toEqual(["marker:read", "source:read", "progress"]);
    expect(fake.observedExecutors[0]).toBe(fake.readExecutor);
  });

  it("keeps both the source-key filter and user cursor when paging", async () => {
    const dialect = new PgDialect();
    let compiledWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const builder = {
      where(condition: SQL) {
        compiledWhere = dialect.sqlToQuery(condition);
        return builder;
      },
      orderBy() {
        return builder;
      },
      async limit() {
        return [];
      },
    };
    const database = {
      selectDistinct() {
        return {
          from(table: unknown) {
            expect(table).toBe(savesKv);
            return builder;
          },
        };
      },
    } as unknown as typeof db;

    await listCodexMasteryBackfillUserIds(database, {
      afterUserId: "user-b",
      limit: 100,
    });

    expect(compiledWhere?.sql).toContain('"saves_kv"."key" in');
    expect(compiledWhere?.sql).toContain('"saves_kv"."user_id" >');
    expect(compiledWhere?.params).toContain("user-b");
  });

  it("locks the marker first and writes it only after every target sync", async () => {
    const fake = runtime();
    const result = await runCodexMasteryBackfillUserWithRuntime(
      fake.value,
      "user-1",
      { apply: true, now: new Date("2026-08-20T00:00:00.000Z") },
    );

    expect(result).toMatchObject({ skipped: false, applied: true, targets: 1 });
    expect(fake.events).toEqual([
      "transaction",
      "marker:lock",
      "source:lock",
      "progress",
      "sync:fish:carp",
      "marker:write",
    ]);
  });

  it("skips completed users before reading source rows", async () => {
    const fake = runtime({ completed: true });
    await expect(runCodexMasteryBackfillUserWithRuntime(
      fake.value,
      "user-1",
      { apply: true, now: new Date() },
    )).resolves.toMatchObject({ skipped: true, applied: false, targets: 0 });
    expect(fake.events).toEqual(["transaction", "marker:lock"]);
  });

  it("does not write the completion marker after a failed target", async () => {
    const fake = runtime({ failSync: true });
    await expect(runCodexMasteryBackfillUserWithRuntime(
      fake.value,
      "user-1",
      { apply: true, now: new Date() },
    )).rejects.toThrow("sync failed");
    expect(fake.events).not.toContain("marker:write");
  });
});
