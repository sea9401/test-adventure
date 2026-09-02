import {
  readFile,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ToolkitAdapter } from "./adapter";
import { AdapterRegistry } from "./adapterRegistry";
import { CommandRunner } from "./commandRunner";
import { TaskStateStore } from "./taskState";
import { executeToolkitCommand } from "../cli/runtime";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";

type IntegrationSpec = {
  taskId: string;
  value: string;
  checkMode: "fail" | "pass";
  secret: string;
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function parseSpec(input: unknown): IntegrationSpec {
  if (
    input === null ||
    typeof input !== "object" ||
    !("taskId" in input) ||
    !("value" in input) ||
    !("checkMode" in input) ||
    !("secret" in input) ||
    typeof input.taskId !== "string" ||
    typeof input.value !== "string" ||
    (input.checkMode !== "fail" && input.checkMode !== "pass") ||
    typeof input.secret !== "string"
  ) {
    throw new Error("invalid integration spec");
  }
  return {
    taskId: input.taskId,
    value: input.value,
    checkMode: input.checkMode,
    secret: input.secret,
  };
}

function integrationAdapter(): ToolkitAdapter<IntegrationSpec> {
  return {
    id: "integration",
    specVersion: 1,
    parseSpec,
    plan: async (_context, spec) => [
      {
        scope: "project",
        path: "src/integration-generated.ts",
        operation: "create",
        content: `export const value = ${JSON.stringify(spec.value)};\n`,
      },
    ],
    validateGenerated: async () => [],
    selectFastChecks: (_context, spec) => [
      {
        id: "integration-check",
        command: process.execPath,
        args: [
          "-e",
          spec.checkMode === "pass"
            ? 'require("node:fs").writeSync(1, "passed\\n")'
            : 'require("node:fs").writeSync(2, `${process.env.API_TOKEN} failed\\n`); process.exitCode = 1',
        ],
        env: { API_TOKEN: spec.secret },
        dependsOn: [],
      },
    ],
    selectFullChecks: () => [],
  };
}

describe("project toolkit core integration", () => {
  it("creates, resumes, protects ownership, approves, and redacts through the public runtime", async () => {
    const fixture = await createFixtureWorkspace();
    cleanups.push(fixture.cleanup);
    const specPath = join(fixture.root, "integration.yaml");
    const generatedPath = join(fixture.root, "src/integration-generated.ts");
    const secret = "integration-secret-123";
    await writeFile(
      specPath,
      `taskId: boss-red\nvalue: first\ncheckMode: fail\nsecret: ${secret}\n`,
    );
    const store = new TaskStateStore(fixture.root);
    const dependencies = {
      projectRoot: fixture.root,
      registry: new AdapterRegistry().register(integrationAdapter()),
      store,
      runner: new CommandRunner(),
      resolveBaseSha: async () => "a".repeat(40),
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    };
    const create = {
      kind: "content-create" as const,
      adapterId: "integration",
      specPath: "integration.yaml",
      dryRun: false,
    };

    expect(await executeToolkitCommand(create, dependencies)).toBe(0);
    await utimes(generatedPath, new Date(1_000), new Date(1_000));
    expect(await executeToolkitCommand(create, dependencies)).toBe(0);
    expect((await stat(generatedPath)).mtimeMs).toBe(1_000);

    await writeFile(generatedPath, "user edit\n");
    await expect(executeToolkitCommand(create, dependencies)).rejects.toThrow(
      "src/integration-generated.ts changed outside toolkit ownership",
    );
    await writeFile(generatedPath, 'export const value = "first";\n');

    expect(
      await executeToolkitCommand(
        { kind: "verify", level: "fast", taskId: "boss-red", dryRun: false },
        dependencies,
      ),
    ).toBe(1);
    const failed = await store.load("boss-red");
    expect(failed.steps["integration-check"].status).toBe("failed");
    expect(failed.steps["integration-check"].errorSummary).toContain(
      "[REDACTED] failed",
    );
    expect(JSON.stringify(failed)).not.toContain(secret);

    await writeFile(
      specPath,
      `taskId: boss-red\nvalue: first\ncheckMode: pass\nsecret: ${secret}\n`,
    );
    expect(
      await executeToolkitCommand(
        { kind: "task-resume", taskId: "boss-red", dryRun: false },
        dependencies,
      ),
    ).toBe(0);
    const resumed = await store.load("boss-red");
    expect(resumed.steps["integration-check"]).toMatchObject({
      status: "passed",
      attempts: 2,
    });

    expect(
      await executeToolkitCommand(
        {
          kind: "task-approve",
          taskId: "boss-red",
          action: "deploy-test",
          target: "staging",
          reason: "테스트 서버 배포 요청",
          dryRun: false,
        },
        dependencies,
      ),
    ).toBe(0);
    expect((await store.load("boss-red")).approvals).toMatchObject([
      { action: "deploy-test", target: "staging" },
    ]);
    await expect(readFile(generatedPath, "utf8")).resolves.toBe(
      'export const value = "first";\n',
    );
  });
});
