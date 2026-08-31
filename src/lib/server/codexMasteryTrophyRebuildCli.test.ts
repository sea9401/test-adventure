import { describe, expect, it } from "vitest";
import {
  executeCodexMasteryTrophyRebuildCli,
  parseCodexMasteryTrophyRebuildCliArgs,
} from "./codexMasteryTrophyRebuildCli";

describe("codex mastery trophy rebuild CLI", () => {
  it("defaults to dry-run and parses bounded paging controls", () => {
    expect(parseCodexMasteryTrophyRebuildCliArgs([
      "--batch=25",
      "--after=user-10",
    ])).toEqual({
      apply: false,
      batchSize: 25,
      afterUserId: "user-10",
      userId: undefined,
    });
    expect(() => parseCodexMasteryTrophyRebuildCliArgs(["--apply", "--dry-run"]))
      .toThrow("choose only one");
    expect(() => parseCodexMasteryTrophyRebuildCliArgs(["--batch=0"]))
      .toThrow("between 1 and 500");
  });

  it("uses the last user as resume cursor and totals changed families", async () => {
    const output: string[] = [];
    const seen: Array<{ userId: string; apply: boolean }> = [];
    const exitCode = await executeCodexMasteryTrophyRebuildCli(
      ["--apply", "--batch=2", "--after=user-0"],
      {
        loadRuntime: async () => ({
          listUserIds: async () => ["user-1", "user-2"],
          rebuildUser: async (userId, options) => {
            seen.push({ userId, apply: options.apply });
            return {
              applied: options.apply,
              changedFamilies: userId === "user-1" ? 2 : 0,
              promotions: userId === "user-1" ? 3 : 0,
            };
          },
        }),
        now: () => new Date("2026-08-20T10:00:00.000Z"),
        log: (message) => output.push(message),
        error: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(seen).toEqual([
      { userId: "user-1", apply: true },
      { userId: "user-2", apply: true },
    ]);
    expect(output).toEqual([
      "users=2 changedFamilies=2 promotions=3 applied=2 errors=0 nextCursor=user-2",
    ]);
  });

  it("keeps processing after one user fails and returns a nonzero exit", async () => {
    const errors: string[] = [];
    const output: string[] = [];
    const exitCode = await executeCodexMasteryTrophyRebuildCli([], {
      loadRuntime: async () => ({
        listUserIds: async () => ["user-a", "user-b"],
        rebuildUser: async (userId) => {
          if (userId === "user-a") throw new Error("broken history");
          return { applied: false, changedFamilies: 1, promotions: 1 };
        },
      }),
      now: () => NOW,
      log: (message) => output.push(message),
      error: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(["error user=user-a: broken history"]);
    expect(output[0]).toContain("users=2 changedFamilies=1 promotions=1 applied=0 errors=1");
  });
});

const NOW = new Date("2026-08-20T10:00:00.000Z");
