import { beforeAll, describe, expect, it } from "vitest";
import ts from "typescript";

import { loadYamlSpec } from "../../core/specFile";
import { parseUnexploredBossSpec, type UnexploredBossSpecV1 } from "./schema";
import { planMechanicScaffolds } from "./scaffolds";

let spec: UnexploredBossSpecV1;

beforeAll(async () => {
  spec = parseUnexploredBossSpec(
    await loadYamlSpec(
      new URL(
        "../../testing/fixtures/specs/unexplored-boss.yaml",
        import.meta.url,
      ).pathname,
    ),
  );
});

function textOf(content: string | Uint8Array): string {
  return typeof content === "string"
    ? content
    : Buffer.from(content).toString("utf8");
}

describe("planMechanicScaffolds", () => {
  it("keeps implementation blockers in mechanic and mechanic test only", () => {
    const plans = planMechanicScaffolds(spec);
    const blocked = plans.filter((plan) =>
      textOf(plan.content).includes("TOOLKIT_IMPLEMENT_ME"),
    );
    expect(blocked.map((plan) => plan.path)).toEqual([
      "src/adventure/v2/combat/echoWardenMechanic.ts",
      "src/adventure/v2/combat/echoWardenMechanic.test.ts",
    ]);
  });

  it("lists the six required mechanic regression boundaries", () => {
    const testPlan = planMechanicScaffolds(spec).find((plan) =>
      plan.path.endsWith("Mechanic.test.ts"),
    )!;
    const source = textOf(testPlan.content);
    expect(source).toContain("initial state");
    expect(source).toContain("malformed state normalization");
    expect(source).toContain("simultaneous player and boss defeat");
    expect(source).toContain("multi-hit boundary");
    expect(source).toContain("damage-over-time behavior");
    expect(source).toContain("session resume");
  });

  it("generates an opaque optional status surface without mechanic logic", () => {
    const plans = planMechanicScaffolds(spec);
    const status = plans.find((plan) => plan.path.endsWith("Status.tsx"))!;
    const source = textOf(status.content);
    expect(status.path).toBe("src/adventure/v2/coop/EchoWardenStatus.tsx");
    expect(source).toContain('import { SURFACE_INSET } from "@/components/ui/surfaces"');
    expect(source).toContain("if (model === null) return null");
    expect(source).toContain("`${SURFACE_INSET} p-3`");
    expect(source).not.toContain("bg-");
    expect(source).not.toContain("TOOLKIT_IMPLEMENT_ME");
  });

  it("omits status files when status UI is disabled", () => {
    const withoutStatus = structuredClone(spec);
    withoutStatus.mechanic.statusUi = false;
    expect(
      planMechanicScaffolds(withoutStatus).filter((plan) =>
        plan.path.includes("Status"),
      ),
    ).toEqual([]);
  });

  it("keeps one local integration checklist with one exact scope command", () => {
    const checklist = planMechanicScaffolds(spec).find(
      (plan) => plan.scope === "task",
    )!;
    const source = textOf(checklist.content);
    expect(checklist.path).toBe("integration.md");
    expect(source).toContain("ATB");
    expect(source).toContain("session JSON");
    expect(source).toContain("list/detail API");
    expect(source).toContain("replay");
    expect(source).toContain("UI registry");
    expect(source).toContain("simulation");
    expect(source.match(/task scope add/g)).toHaveLength(1);
    expect(source).toContain(
      "npm run toolkit -- task scope add boss-echo-warden --paths src/adventure/data/v2/coopBosses.ts,src/adventure/v2/combat/engineState.ts",
    );
  });

  it("emits syntactically valid TypeScript and TSX scaffolds", () => {
    for (const plan of planMechanicScaffolds(spec)) {
      if (plan.scope !== "project") continue;
      const sourceFile = ts.createSourceFile(
        plan.path,
        textOf(plan.content),
        ts.ScriptTarget.Latest,
        true,
        plan.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const diagnostics = (
        sourceFile as ts.SourceFile & {
          parseDiagnostics?: readonly ts.Diagnostic[];
        }
      ).parseDiagnostics;
      expect(diagnostics ?? [], plan.path).toEqual([]);
    }
  });
});
