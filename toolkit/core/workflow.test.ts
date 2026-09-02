import { afterEach, describe, expect, it } from "vitest";

import type { CheckDefinition } from "./artifacts";
import { AdapterRegistry } from "./adapterRegistry";
import { TaskStateStore } from "./taskState";
import { ToolkitWorkflow } from "./workflow";
import type { ToolkitAdapter } from "./adapter";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { FakeCommandRunner } from "../testing/fakeCommandRunner";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  const store = new TaskStateStore(fixture.root);
  const state = await store.create({
    taskId: "boss-red",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "specs/boss-red.yaml",
    baseSha: "a".repeat(40),
    now: "2026-09-02T00:00:00.000Z",
  });
  return { fixture, store, state };
}

const checks: readonly CheckDefinition[] = [
  {
    id: "schema",
    command: "schema-check",
    args: ["--strict"],
    dependsOn: [],
  },
  {
    id: "verify",
    command: "verify-check",
    args: [],
    dependsOn: ["schema"],
  },
];

describe("ToolkitWorkflow", () => {
  it("resumes from the failed step without rerunning a valid predecessor", async () => {
    const { fixture, store, state } = await setup();
    const runner = new FakeCommandRunner()
      .succeed("schema")
      .fail("verify", 1)
      .succeed("verify");
    const workflow = new ToolkitWorkflow({
      projectRoot: fixture.root,
      store,
      checks,
      now: (() => {
        let tick = 0;
        return () => `2026-09-02T00:00:0${tick++}.000Z`;
      })(),
    });

    const first = await workflow.run(state, runner);
    expect(first.steps.schema.attempts).toBe(1);
    expect(first.steps.verify.status).toBe("failed");
    const resumed = await workflow.resume(first, runner);

    expect(resumed.steps.schema.attempts).toBe(1);
    expect(resumed.steps.verify.attempts).toBe(2);
    expect(resumed.steps.verify.status).toBe("passed");
    expect(runner.runIds).toEqual(["schema", "verify", "verify"]);
  });

  it("invalidates a changed definition and its dependent check", async () => {
    const { fixture, store, state } = await setup();
    const initial = new ToolkitWorkflow({
      projectRoot: fixture.root,
      store,
      checks,
    });
    const firstRunner = new FakeCommandRunner()
      .succeed("schema")
      .succeed("verify");
    const passed = await initial.run(state, firstRunner);
    const changedChecks = [
      { ...checks[0], args: ["--strict", "--new-rule"] },
      checks[1],
    ];
    const secondRunner = new FakeCommandRunner()
      .succeed("schema")
      .succeed("verify");

    const rerun = await new ToolkitWorkflow({
      projectRoot: fixture.root,
      store,
      checks: changedChecks,
    }).resume(passed, secondRunner);

    expect(secondRunner.runIds).toEqual(["schema", "verify"]);
    expect(rerun.steps.schema.attempts).toBe(2);
    expect(rerun.steps.verify.attempts).toBe(2);
  });

  it("stops before a dependent check when its dependency fails", async () => {
    const { fixture, store, state } = await setup();
    const runner = new FakeCommandRunner().fail("schema", 2);

    const failed = await new ToolkitWorkflow({
      projectRoot: fixture.root,
      store,
      checks,
    }).run(state, runner);

    expect(failed.steps.schema.status).toBe("failed");
    expect(failed.steps.verify.status).toBe("pending");
    expect(runner.runIds).toEqual(["schema"]);
  });

  it("rejects missing dependencies and dependency cycles", async () => {
    const { fixture, store } = await setup();
    expect(
      () =>
        new ToolkitWorkflow({
          projectRoot: fixture.root,
          store,
          checks: [{ ...checks[0], dependsOn: ["missing"] }],
        }),
    ).toThrow("unknown dependency missing");
    expect(
      () =>
        new ToolkitWorkflow({
          projectRoot: fixture.root,
          store,
          checks: [
            { ...checks[0], dependsOn: ["verify"] },
            { ...checks[1], dependsOn: ["schema"] },
          ],
        }),
    ).toThrow("workflow dependency cycle");
  });
});

describe("AdapterRegistry", () => {
  function adapter(id = "example", specVersion = 1): ToolkitAdapter<string> {
    return {
      id,
      specVersion,
      parseSpec: String,
      plan: async () => [],
      validateGenerated: async () => [],
      selectFastChecks: () => [],
      selectFullChecks: () => [],
    };
  }

  it("requires one registered adapter with the expected spec version", () => {
    const registry = new AdapterRegistry().register(adapter());
    expect(registry.require<string>("example", 1).id).toBe("example");
    expect(() => registry.require("example", 2)).toThrow(
      "adapter example spec version mismatch",
    );
    expect(() => registry.register(adapter())).toThrow(
      "adapter example is already registered",
    );
  });
});
