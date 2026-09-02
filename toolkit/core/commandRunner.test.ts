import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CommandRunner } from "./commandRunner";

const roots: string[] = [];

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "toolkit-runner-"));
  roots.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("CommandRunner", () => {
  it("runs without a shell and records both output streams", async () => {
    const cwd = await root();
    const logPath = join(cwd, "logs/check.log");

    const result = await new CommandRunner().run({
      checkId: "node-check",
      command: process.execPath,
      args: [
        "-e",
        'process.stdout.write("standard\\n"); process.stderr.write("error\\n")',
      ],
      cwd,
      logPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.tailLines).toEqual(expect.arrayContaining(["standard", "error"]));
    expect(await readFile(logPath, "utf8")).toContain("standard\n");
    expect(await readFile(logPath, "utf8")).toContain("error\n");
  });

  it("returns a nonzero exit without converting it into a spawn error", async () => {
    const cwd = await root();
    const result = await new CommandRunner().run({
      checkId: "exit-check",
      command: process.execPath,
      args: ["-e", "process.exit(3)"],
      cwd,
      logPath: join(cwd, "exit.log"),
    });

    expect(result.exitCode).toBe(3);
    expect(result.signal).toBeNull();
  });

  it("rejects when the executable cannot be spawned", async () => {
    const cwd = await root();
    await expect(
      new CommandRunner().run({
        checkId: "missing-check",
        command: join(cwd, "missing-executable"),
        args: [],
        cwd,
        logPath: join(cwd, "missing.log"),
      }),
    ).rejects.toThrow("could not start missing-check");
  });

  it("redacts explicit secret values and keeps only the last 200 summary lines", async () => {
    const cwd = await root();
    const secret = "sensitive-value-123";
    const result = await new CommandRunner().run({
      checkId: "redaction-check",
      command: process.execPath,
      args: [
        "-e",
        'for (let i = 0; i < 205; i++) console.log(`line-${i}`); console.error(process.env.API_TOKEN)',
      ],
      cwd,
      env: { API_TOKEN: secret },
      logPath: join(cwd, "redaction.log"),
    });

    expect(result.tailLines).toHaveLength(200);
    expect(result.tailLines.join("\n")).not.toContain(secret);
    expect(result.tailLines.join("\n")).toContain("[REDACTED]");
    expect(result.tailLines).not.toContain("line-0");
  });
});
