import type { ArtifactPlan } from "../../core/artifacts";
import type { UnexploredBossSpecV1 } from "./schema";

const MANUAL_INTEGRATION_PATHS = [
  "src/adventure/data/v2/coopBosses.ts",
  "src/adventure/v2/combat/engineState.ts",
  "src/app/api/v2/coop/attack/route.ts",
  "src/app/api/v2/coop/[sessionId]/route.ts",
  "src/app/api/v2/coop/[sessionId]/attacks/[attackId]/route.ts",
  "src/adventure/v2/coop/V2CoopBossDetailView.tsx",
  "scripts/sim-v2-coop-boss.ts",
] as const;

function pascalName(moduleName: string): string {
  return `${moduleName[0].toUpperCase()}${moduleName.slice(1)}`;
}

function projectArtifact(path: string, content: string): ArtifactPlan {
  return { scope: "project", path, operation: "create", content };
}

function renderMechanic(spec: UnexploredBossSpecV1): string {
  const pascal = pascalName(spec.mechanic.moduleName);
  return [
    `export type ${pascal}BattleState = Readonly<{`,
    "  version: 1;",
    "}>;",
    "",
    'const IMPLEMENTATION_BLOCKER = "TOOLKIT_IMPLEMENT_ME";',
    "",
    `function ${spec.mechanic.moduleName}ImplementationRequired(): never {`,
    `  throw new Error(IMPLEMENTATION_BLOCKER);`,
    "}",
    "",
    `export function initial${pascal}State(): ${pascal}BattleState {`,
    `  return ${spec.mechanic.moduleName}ImplementationRequired();`,
    "}",
    "",
    `export function normalize${pascal}State(`,
    "  _value: unknown,",
    `): ${pascal}BattleState {`,
    `  return ${spec.mechanic.moduleName}ImplementationRequired();`,
    "}",
    "",
  ].join("\n");
}

function renderMechanicTest(spec: UnexploredBossSpecV1): string {
  const pascal = pascalName(spec.mechanic.moduleName);
  return [
    'import { describe, expect, it } from "vitest";',
    "",
    `import { initial${pascal}State, normalize${pascal}State } from "./${spec.mechanic.moduleName}Mechanic";`,
    "",
    'const TOOLKIT_IMPLEMENT_ME = "replace this blocker with mechanic assertions";',
    "",
    `describe("${spec.name} mechanic", () => {`,
    '  it("initial state", () => {',
    `    expect(() => initial${pascal}State()).not.toThrow(TOOLKIT_IMPLEMENT_ME);`,
    "  });",
    "",
    '  it("malformed state normalization", () => {',
    `    expect(() => normalize${pascal}State({ broken: true })).not.toThrow(`,
    "      TOOLKIT_IMPLEMENT_ME,",
    "    );",
    "  });",
    "",
    '  it("simultaneous player and boss defeat", () => {',
    `    expect(() => normalize${pascal}State({ playerHp: 0, bossHp: 0 })).not.toThrow(`,
    "      TOOLKIT_IMPLEMENT_ME,",
    "    );",
    "  });",
    "",
    '  it("multi-hit boundary", () => {',
    `    expect(() => normalize${pascal}State({ hitIndex: 2, hitCount: 3 })).not.toThrow(`,
    "      TOOLKIT_IMPLEMENT_ME,",
    "    );",
    "  });",
    "",
    '  it("damage-over-time behavior", () => {',
    `    expect(() => normalize${pascal}State({ damageKind: "status_damage" })).not.toThrow(`,
    "      TOOLKIT_IMPLEMENT_ME,",
    "    );",
    "  });",
    "",
    '  it("session resume", () => {',
    `    const persisted = JSON.parse(JSON.stringify({ kind: "${spec.id}" }));`,
    `    expect(() => normalize${pascal}State(persisted)).not.toThrow(`,
    "      TOOLKIT_IMPLEMENT_ME,",
    "    );",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderStatus(spec: UnexploredBossSpecV1): string {
  const pascal = pascalName(spec.mechanic.moduleName);
  return [
    'import { SURFACE_INSET } from "@/components/ui/surfaces";',
    "",
    `export type ${pascal}StatusModel = Readonly<{`,
    "  label: string;",
    "}>;",
    "",
    `export function ${pascal}Status({`,
    "  model,",
    `}: { model: ${pascal}StatusModel | null }) {`,
    "  if (model === null) return null;",
    "",
    "  return (",
    `    <aside className={\`${"${SURFACE_INSET}"} p-3\`} aria-label=${JSON.stringify(`${spec.name} 상태`)}>` ,
    "      <p className=\"text-sm font-semibold text-zinc-900 dark:text-zinc-100\">",
    "        {model.label}",
    "      </p>",
    "    </aside>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function renderStatusTest(spec: UnexploredBossSpecV1): string {
  const pascal = pascalName(spec.mechanic.moduleName);
  return [
    'import { render, screen } from "@testing-library/react";',
    'import { describe, expect, it } from "vitest";',
    "",
    `import { ${pascal}Status } from "./${pascal}Status";`,
    "",
    `describe("${pascal}Status", () => {`,
    '  it("renders nothing without a model", () => {',
    `    const { container } = render(<${pascal}Status model={null} />);`,
    "    expect(container).toBeEmptyDOMElement();",
    "  });",
    "",
    '  it("renders the supplied display label on an opaque inset", () => {',
    `    render(<${pascal}Status model={{ label: "공명 대기" }} />);`,
    `    expect(screen.getByRole("complementary", { name: ${JSON.stringify(`${spec.name} 상태`)} })).toHaveClass(`,
    '      "bg-zinc-50",',
    '      "dark:bg-zinc-950",',
    "    );",
    '    expect(screen.getByText("공명 대기")).toBeInTheDocument();',
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderChecklist(spec: UnexploredBossSpecV1): string {
  const scopeCommand = `npm run toolkit -- task scope add ${spec.taskId} --paths ${MANUAL_INTEGRATION_PATHS.join(",")}`;
  return [
    `# ${spec.name} integration checklist`,
    "",
    "Generated catalog and extension files are owned by the toolkit. Record the exact existing files below before editing them:",
    "",
    "```bash",
    scopeCommand,
    "```",
    "",
    "- [ ] ATB engine hooks apply the mechanic at action and multi-hit boundaries.",
    "- [ ] session JSON parsing normalizes persisted mechanic state.",
    "- [ ] list/detail API responses expose the readonly display model.",
    "- [ ] replay payloads preserve mechanic transitions and terminal ordering.",
    "- [ ] UI registry renders the status component only for this boss.",
    "- [ ] simulation covers deterministic seeds and balance thresholds.",
    "",
  ].join("\n");
}

export function planMechanicScaffolds(
  spec: UnexploredBossSpecV1,
): readonly ArtifactPlan[] {
  const pascal = pascalName(spec.mechanic.moduleName);
  const plans: ArtifactPlan[] = [
    projectArtifact(
      `src/adventure/v2/combat/${spec.mechanic.moduleName}Mechanic.ts`,
      renderMechanic(spec),
    ),
    projectArtifact(
      `src/adventure/v2/combat/${spec.mechanic.moduleName}Mechanic.test.ts`,
      renderMechanicTest(spec),
    ),
  ];
  if (spec.mechanic.statusUi) {
    plans.push(
      projectArtifact(
        `src/adventure/v2/coop/${pascal}Status.tsx`,
        renderStatus(spec),
      ),
      projectArtifact(
        `src/adventure/v2/coop/${pascal}Status.test.tsx`,
        renderStatusTest(spec),
      ),
    );
  }
  plans.push({
    scope: "task",
    path: "integration.md",
    operation: "create",
    content: renderChecklist(spec),
  });
  return plans;
}
