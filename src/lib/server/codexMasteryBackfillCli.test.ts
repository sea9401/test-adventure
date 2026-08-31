import { describe, expect, it } from "vitest";
import {
  executeCodexMasteryBackfillCli,
  parseCodexMasteryBackfillCliArgs,
} from "./codexMasteryBackfillCli";

describe("codex mastery backfill CLI", () => {
  const invalidArgs: ReadonlyArray<readonly [readonly string[]]> = [
    [[]],
    [["--dry-run", "--apply"]],
    [["--dry-run", "--unknown"]],
    [["--apply", "--user="]],
  ];

  it.each(invalidArgs)("rejects unsafe arguments before loading the database: %j", async (args) => {
    let loaded = false;
    await expect(executeCodexMasteryBackfillCli(args, {
      async loadRuntime() { loaded = true; throw new Error("must not load"); },
      now: () => new Date(),
      log: () => undefined,
      error: () => undefined,
    })).rejects.toThrow();
    expect(loaded).toBe(false);
  });

  it("parses an explicit mode and optional single user", () => {
    expect(parseCodexMasteryBackfillCliArgs(["--dry-run"])).toEqual({
      apply: false,
      userId: undefined,
    });
    expect(parseCodexMasteryBackfillCliArgs(["--apply", "--user=user-1"])).toEqual({
      apply: true,
      userId: "user-1",
    });
  });

  it("paginates deterministically and reports aggregate outcomes", async () => {
    const logs: string[] = [];
    const cursors: Array<string | undefined> = [];
    const code = await executeCodexMasteryBackfillCli(["--dry-run"], {
      async loadRuntime() {
        return {
          async listUserIds({ afterUserId }: { afterUserId?: string }) {
            cursors.push(afterUserId);
            return afterUserId === undefined ? ["user-a", "user-b"] : [];
          },
          async backfillUser(userId: string) {
            return userId === "user-a"
              ? { skipped: false, applied: false, targets: 3, changedEntries: 2, scoreDeltaMilli: 4_000 }
              : { skipped: true, applied: false, targets: 0, changedEntries: 0, scoreDeltaMilli: 0 };
          },
        };
      },
      now: () => new Date("2026-08-20T00:00:00.000Z"),
      log: (line) => logs.push(line),
      error: (line) => logs.push(line),
    });

    expect(code).toBe(0);
    expect(cursors).toEqual([undefined, "user-b"]);
    expect(logs.at(-1)).toBe(
      "users=2 skipped=1 targets=3 changed=2 scoreDeltaMilli=4000 applied=0 errors=0",
    );
  });
});
