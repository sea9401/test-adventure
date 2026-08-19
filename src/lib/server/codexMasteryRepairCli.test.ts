import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  executeCodexMasteryRepairCli,
  parseCodexMasteryRepairCliArgs,
  type CodexMasteryRepairCliRuntime,
} from "./codexMasteryRepairCli";

const SCRIPT = fileURLToPath(
  new URL("../../../scripts/repair-codex-mastery-summary.ts", import.meta.url),
);

function runtime(options: {
  listUserIds?: CodexMasteryRepairCliRuntime["listUserIds"];
  repairUser?: CodexMasteryRepairCliRuntime["repairUser"];
} = {}): CodexMasteryRepairCliRuntime {
  return {
    listUserIds: options.listUserIds ?? (async () => []),
    repairUser: options.repairUser ?? (async () => ({ changed: false, applied: false })),
  };
}

describe("codex mastery repair CLI", () => {
  it.each([
    { label: "neither", args: [] },
    { label: "both", args: ["--dry-run", "--apply"] },
  ])("rejects $label mode before loading database dependencies", async ({ args }) => {
    // Break caught: invalid mode reaches the dynamic DB loader and may open a pool before failing.
    let loadCalls = 0;

    await expect(executeCodexMasteryRepairCli(args, {
      async loadRuntime() {
        loadCalls += 1;
        return runtime();
      },
      log() {},
      error() {},
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    })).rejects.toThrow("pass exactly one of --dry-run or --apply");
    expect(loadCalls).toBe(0);
  });

  it("parses each mode and an optional user explicitly", () => {
    // Break caught: mode booleans are inverted or --user is dropped before orchestration.
    expect(parseCodexMasteryRepairCliArgs(["--dry-run"])).toEqual({
      apply: false,
      userId: undefined,
    });
    expect(parseCodexMasteryRepairCliArgs(["--apply", "--user=user-1"])).toEqual({
      apply: true,
      userId: "user-1",
    });
  });

  it("repairs only the optional user without starting pagination", async () => {
    // Break caught: --user still enumerates every summary user or targets the wrong ID.
    const repaired: Array<{ userId: string; apply: boolean }> = [];
    const output: string[] = [];

    const exitCode = await executeCodexMasteryRepairCli(
      ["--dry-run", "--user=user-1"],
      {
        async loadRuntime() {
          return runtime({
            async listUserIds() {
              throw new Error("pagination must not run");
            },
            async repairUser(userId, options) {
              repaired.push({ userId, apply: options.apply });
              return { changed: true, applied: false };
            },
          });
        },
        log: (message) => output.push(message),
        error() {},
        now: () => new Date("2026-08-20T00:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(repaired).toEqual([{ userId: "user-1", apply: false }]);
    expect(output).toEqual(["changed=1 applied=0 errors=0"]);
  });

  it("counts an injected apply result without loading a real database", async () => {
    // Break caught: apply succeeds but the CLI leaves its applied total at zero.
    const output: string[] = [];

    const exitCode = await executeCodexMasteryRepairCli(
      ["--apply", "--user=user-1"],
      {
        async loadRuntime() {
          return runtime({
            async repairUser(_userId, options) {
              expect(options.apply).toBe(true);
              return { changed: true, applied: true };
            },
          });
        },
        log: (message) => output.push(message),
        error() {},
        now: () => new Date("2026-08-20T00:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(output).toEqual(["changed=1 applied=1 errors=0"]);
  });

  it("pages by the last stable user ID and reports per-user errors and totals", async () => {
    // Break caught: offset/unstable paging skips users, or one user error aborts final counts.
    const cursors: Array<string | undefined> = [];
    const repaired: string[] = [];
    const output: string[] = [];
    const errors: string[] = [];
    const pages = new Map<string | undefined, string[]>([
      [undefined, ["user-a", "user-b"]],
      ["user-b", ["user-c"]],
      ["user-c", []],
    ]);

    const exitCode = await executeCodexMasteryRepairCli(["--dry-run"], {
      async loadRuntime() {
        return runtime({
          async listUserIds(options) {
            cursors.push(options.afterUserId);
            return pages.get(options.afterUserId) ?? [];
          },
          async repairUser(userId) {
            repaired.push(userId);
            if (userId === "user-b") throw new Error("broken row");
            return {
              changed: userId === "user-a",
              applied: false,
            };
          },
        });
      },
      log: (message) => output.push(message),
      error: (message) => errors.push(message),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(exitCode).toBe(1);
    expect(cursors).toEqual([undefined, "user-b", "user-c"]);
    expect(repaired).toEqual(["user-a", "user-b", "user-c"]);
    expect(errors).toEqual(["error user=user-b: broken row"]);
    expect(output).toEqual(["changed=1 applied=0 errors=1"]);
  });

  it.each([
    { label: "neither", args: [] },
    { label: "both", args: ["--dry-run", "--apply"] },
  ])("the executable rejects $label mode without touching the DB proxy", ({ args }) => {
    // Break caught: the actual script wires dependencies before validating its process arguments.
    const result = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.stderr).toContain("pass exactly one of --dry-run or --apply");
    expect(result.stderr).not.toContain("DATABASE_URL is not set");
  });
});
