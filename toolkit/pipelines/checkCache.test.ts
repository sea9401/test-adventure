import { afterEach, describe, expect, it } from "vitest";

import type { CheckDefinition } from "../core/artifacts";
import { TaskStateStore } from "../core/taskState";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { FakeCommandRunner } from "../testing/fakeCommandRunner";
import { checkCacheKey, runChecks } from "./checkCache";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const baseCheck: CheckDefinition = {
  id: "typecheck",
  command: "npx",
  args: ["tsc", "--noEmit"],
  dependsOn: [],
};

describe("checkCacheKey", () => {
  it("changes with selected inputs, environment, and tool version", () => {
    const inputs = { "src/a.ts": "a".repeat(64) };
    expect(
      checkCacheKey(baseCheck, inputs, { V2_UNEXPLORED: "true" }),
    ).not.toBe(
      checkCacheKey(baseCheck, inputs, { V2_UNEXPLORED: "false" }),
    );
    expect(checkCacheKey(baseCheck, inputs, {})).not.toBe(
      checkCacheKey(baseCheck, { "src/a.ts": "b".repeat(64) }, {}),
    );
    expect(checkCacheKey(baseCheck, inputs, {})).not.toBe(
      checkCacheKey({ ...baseCheck, toolVersion: "v2" }, inputs, {}),
    );
  });
});

describe("runChecks", () => {
  async function setup() {
    const fixture = await createFixtureWorkspace();
    cleanups.push(fixture.cleanup);
    const store = new TaskStateStore(fixture.root);
    const state = await store.create({
      taskId: "boss-red",
      adapterId: "fixture",
      adapterSpecVersion: 1,
      specPath: "boss.yaml",
      baseSha: "a".repeat(40),
      now: "2026-09-02T00:00:00.000Z",
    });
    return { fixture, store, state };
  }

  it("collects every independent result in a layer after one sibling fails", async () => {
    const { fixture, store, state } = await setup();
    const checks: readonly CheckDefinition[] = [
      { id: "first", command: "first", args: [], dependsOn: [] },
      { id: "second", command: "second", args: [], dependsOn: [] },
      { id: "dependent", command: "dependent", args: [], dependsOn: ["first"] },
    ];
    const runner = new FakeCommandRunner().fail("first", 1).succeed("second");

    const result = await runChecks(state, checks, {
      projectRoot: fixture.root,
      store,
      runner,
      inputsByCheck: {},
      now: (() => {
        let tick = 0;
        return () => `2026-09-02T00:00:0${tick++}.000Z`;
      })(),
    });

    expect(runner.runIds).toEqual(["first", "second"]);
    expect(result.steps.first.status).toBe("failed");
    expect(result.steps.second.status).toBe("passed");
    expect(result.steps.dependent.status).toBe("pending");
  });

  it("reuses a pass only while command, environment, and inputs match", async () => {
    const { fixture, store, state } = await setup();
    const runner = new FakeCommandRunner().succeed("typecheck");
    const inputs = { typecheck: { "src/a.ts": "a".repeat(64) } };
    const first = await runChecks(state, [baseCheck], {
      projectRoot: fixture.root,
      store,
      runner,
      inputsByCheck: inputs,
    });
    const reused = await runChecks(first, [baseCheck], {
      projectRoot: fixture.root,
      store,
      runner,
      inputsByCheck: inputs,
    });
    expect(reused.steps.typecheck.attempts).toBe(1);
    expect(runner.runIds).toEqual(["typecheck"]);

    runner.succeed("typecheck");
    const changed = await runChecks(reused, [baseCheck], {
      projectRoot: fixture.root,
      store,
      runner,
      inputsByCheck: {
        typecheck: { "src/a.ts": "b".repeat(64) },
      },
    });
    expect(changed.steps.typecheck.attempts).toBe(2);
    expect(runner.runIds).toEqual(["typecheck", "typecheck"]);
  });
});
