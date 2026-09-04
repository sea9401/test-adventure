# Unexplored Boss Toolkit Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first complete content adapter, generating repeatable unexplored personal-boss catalog, reward, achievement, mechanic, status, and test scaffolding from a strict YAML spec.

**Architecture:** The adapter parses data-only YAML, renders deterministic TypeScript snippets, and uses TypeScript AST positions to insert entries into named registries without rewriting unrelated source. Existing catalog tests are converted from hard-coded counts to invariants once; unique combat behavior remains in generated, deliberately incomplete mechanic and status extension files until a developer implements and tests it.

**Tech Stack:** TypeScript compiler API, YAML 2.9, Vitest 4.1, existing unexplored boss catalogs and ATB combat modules

## Global Constraints

- Complete `2026-09-02-project-toolkit-core.md` first and consume its public contracts without duplicating them.
- The adapter may generate repeatable data and explicit extension files, but it must not invent unique combat behavior.
- Boss IDs use lower snake case; generated TypeScript file names use lower camel case; image names use existing kebab-case conventions.
- Every boss has exactly two distinct pools and exactly three independent equipment drops at 30%, 10%, and 0.5%.
- Equipment and image IDs must follow AGENTS.md identifier and filename rules.
- Source edits are limited to named TypeScript declarations verified through the compiler AST.
- Any existing target ID, ambiguous declaration, parse diagnostic, or user-modified owned output is a hard conflict.
- Applying a new boss intentionally leaves one concentrated mechanic implementation gate; PR and release remain blocked until it is cleared.
- Do not add a fake boss to the real production catalog while testing the adapter.

---

### Task 1: Define and validate the versioned boss spec

**Files:**
- Create: `toolkit/adapters/unexplored-boss/schema.ts`
- Create: `toolkit/adapters/unexplored-boss/schema.test.ts`
- Create: `toolkit/testing/fixtures/specs/unexplored-boss.yaml`

**Interfaces:**
- Consumes: YAML-loaded `unknown` from the core plan.
- Produces: `UnexploredBossSpecV1` and `parseUnexploredBossSpec(input): UnexploredBossSpecV1`.
- Produces: `bossModuleName(id): string` and `bossImagePath(id): string`.

- [ ] **Step 1: Write failing schema tests for a complete spec**

```ts
it("parses the complete version-one boss contract", () => {
  const spec = parseUnexploredBossSpec(validBossInput());
  expect(spec).toMatchObject({
    version: 1,
    id: "echo_warden",
    pools: ["runaway_machines", "shadow_stalkers"],
    drops: [
      { chancePct: 30 },
      { chancePct: 10 },
      { chancePct: 0.5 },
    ],
    mechanic: { moduleName: "echoWarden", persistedState: true, statusUi: true },
  });
});

it.each([
  ["duplicate pools", { pools: ["runaway_machines", "runaway_machines"] }],
  ["wrong drop order", { drops: [{ chancePct: 10 }, { chancePct: 30 }, { chancePct: 0.5 }] }],
  ["unknown key", { unexpected: true }],
])("rejects %s", (_name, override) => {
  expect(() => parseUnexploredBossSpec(validBossInput(override))).toThrow();
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npx vitest run toolkit/adapters/unexplored-boss/schema.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Define the exact V1 shape**

```ts
export type UnexploredBossSpecV1 = {
  version: 1;
  taskId: string;
  id: string;
  name: string;
  pools: readonly [string, string];
  summon: { materialId: string; name: string; description: string };
  boss: {
    sharedMaxHp: number;
    anchorDepth: number;
    monster: {
      hp: number; atk: number; atkType?: "physical" | "magic";
      def: number; magicDef: number; spd: number;
      accuracy: number; evasionPct: number;
      skill: Readonly<Record<string, string | number>>;
    };
    traits: readonly [string, string, string];
  };
  drops: readonly [EquipmentDropSpec, EquipmentDropSpec, EquipmentDropSpec];
  title: { id: string; name: string; description: string; condition: string; category: "battle" | "endgame" };
  achievement: { id: string; name: string; description: string };
  mechanic: { moduleName: string; persistedState: boolean; statusUi: boolean };
  images: readonly [ImageSpec, ImageSpec, ImageSpec, ImageSpec];
};
```

Equipment specs include `id`, `name`, `description`, `slot`, `concept`, `tier: 16`, `power`, `weight`,
`options`, `image`, and fixed ordered `chancePct`. Image specs include `role`, project-relative `target`,
`requiresAlpha`, and `rightsSource: "operator-cleared-game-art"`.

- [ ] **Step 4: Implement strict runtime validation**

Reject unknown keys at every object level, non-finite numbers, unsafe integers, empty Korean copy,
incorrect ID prefixes, paths outside `public/images/{monster/v2,equipment}`, duplicate equipment IDs,
image targets not matching the declared boss/equipment IDs, and skill objects containing arrays or nested
objects. Require the boss image path `/images/monster/v2/unexplored-boss-<kebab-id>.webp`.

- [ ] **Step 5: Run schema tests**

Run: `npx vitest run toolkit/adapters/unexplored-boss/schema.test.ts`

Expected: PASS for valid, unknown-key, path traversal, duplicate ID, unsafe number, drop-order, image-name,
pool, and module-name cases.

- [ ] **Step 6: Commit the boss spec contract**

```bash
git add toolkit/adapters/unexplored-boss/schema.ts toolkit/adapters/unexplored-boss/schema.test.ts toolkit/testing/fixtures/specs/unexplored-boss.yaml
git commit -m "feat: validate unexplored boss toolkit specs"
```

---

### Task 2: Build TypeScript AST insertion primitives

**Files:**
- Create: `toolkit/adapters/unexplored-boss/typescriptEditor.ts`
- Create: `toolkit/adapters/unexplored-boss/typescriptEditor.test.ts`

**Interfaces:**
- Produces: `insertObjectProperty(source, request): string`.
- Produces: `insertArrayElement(source, request): string`.
- Produces: `readObjectPropertyNames(source, declarationName): readonly string[]`.

- [ ] **Step 1: Write failing preservation and conflict tests**

```ts
it("inserts before the named object closing brace and preserves unrelated bytes", () => {
  const source = "const CATALOG = {\n  old: { id: \"old\" },\n} as const;\nconst untouched = 1;\n";
  const output = insertObjectProperty(source, {
    fileName: "catalog.ts",
    declarationName: "CATALOG",
    propertyName: "new_id",
    renderedProperty: "  new_id: { id: \"new_id\" },\n",
  });
  expect(output).toContain("old: { id: \"old\" },\n  new_id:");
  expect(output.endsWith("const untouched = 1;\n")).toBe(true);
});

it("rejects an existing property", () => {
  expect(() => insertObjectProperty(source, request("old")))
    .toThrow("CATALOG already contains old");
});
```

- [ ] **Step 2: Run editor tests and verify RED**

Run: `npx vitest run toolkit/adapters/unexplored-boss/typescriptEditor.test.ts`

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Implement compiler-AST declaration discovery**

Parse with `ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)` and reject
all parse diagnostics. Find exactly one variable declaration with the requested identifier and require an
object or array literal initializer after unwrapping `as` and `satisfies` expressions. Never print the whole
AST back to text.

- [ ] **Step 4: Implement byte-preserving insertion**

Use the literal node's `getEnd() - 1` closing-brace position, derive newline and indentation from existing
members, require the rendered snippet to end with the source newline, and splice only at that position.
Handle quoted and identifier property names. Reject spread elements, computed names, duplicate declarations,
mixed newline styles, or rendered snippets containing the target file outside their insertion span.

- [ ] **Step 5: Run editor tests**

Run: `npx vitest run toolkit/adapters/unexplored-boss/typescriptEditor.test.ts`

Expected: PASS for LF, CRLF, object, array, `as const satisfies`, duplicate declaration, existing entry,
parse error, spread, and unrelated-byte preservation.

- [ ] **Step 6: Commit the AST editor**

```bash
git add toolkit/adapters/unexplored-boss/typescriptEditor.ts toolkit/adapters/unexplored-boss/typescriptEditor.test.ts
git commit -m "feat: edit toolkit registries through typescript ast"
```

---

### Task 3: Make existing unexplored registries extension-friendly

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.test.ts`
- Modify: `src/adventure/data/v2/unexploredBossRewards.test.ts`

**Interfaces:**
- Consumes: existing `UNEXPLORED_BOSS_IDS` and `UNEXPLORED_BOSSES`.
- Produces: catalog-driven personal boss registration and conquest checks that do not require numeric test edits.

- [ ] **Step 1: Write failing extension-invariant tests**

Replace literal expectations for six bosses, twelve craft recipes, and eighteen equipment drops with invariants:

```ts
expect(COOP_BOSS_KIND_IDS.filter((id) => COOP_BOSSES[id].rewardMode === "unexplored_personal"))
  .toEqual(UNEXPLORED_BOSS_IDS);
expect(UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES).toHaveLength(UNEXPLORED_BOSS_IDS.length * 2);
expect(Object.values(UNEXPLORED_BOSSES).flatMap((boss) => boss.uniqueDrops))
  .toHaveLength(UNEXPLORED_BOSS_IDS.length * 3);
```

Add a progression test that constructs `defeatedBossIds: UNEXPLORED_BOSS_IDS` and expects conquest, then removes
each ID in turn and expects conquest to be absent.

- [ ] **Step 2: Run the focused product tests and verify RED where registration remains hard-coded**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/coopBosses.test.ts`

Expected: At least the new catalog-driven coop registration assertion fails until the implementation changes.

- [ ] **Step 3: Derive personal coop boss entries from the catalog**

```ts
const UNEXPLORED_COOP_BOSSES = Object.fromEntries(
  UNEXPLORED_BOSS_IDS.map((bossId) => [bossId, unexploredPersonalBossKind(bossId)]),
) as { [K in UnexploredBossId]: CoopBossKind & { id: K; rewardMode: "unexplored_personal" } };

export const COOP_BOSSES = {
  // existing standard boss entries remain unchanged
  ...UNEXPLORED_COOP_BOSSES,
};
```

Keep standard boss ordering unchanged and append personal bosses in `UNEXPLORED_BOSS_IDS` order.

- [ ] **Step 4: Derive conquest completeness from catalog IDs**

Keep the per-boss achievement map exhaustive, but replace the separate literal boss-count comparison with
`UNEXPLORED_BOSS_IDS.every((bossId) => defeated.has(bossId))`. Build the conquest description from
`UNEXPLORED_BOSS_IDS.length` so the displayed count cannot drift.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/unexploredBossRewards.test.ts src/adventure/data/v2/coopBosses.test.ts && npx tsc --noEmit`

Expected: PASS without changing current six-boss runtime ordering or rewards.

- [ ] **Step 6: Commit extension-friendly registries**

```bash
git add src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredProgression.ts src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/unexploredBossRewards.test.ts
git commit -m "refactor: derive unexplored boss registry invariants"
```

---

### Task 4: Render catalog and progression artifacts

**Files:**
- Create: `toolkit/adapters/unexplored-boss/templates.ts`
- Create: `toolkit/adapters/unexplored-boss/templates.test.ts`
- Create: `toolkit/adapters/unexplored-boss/targets.ts`
- Create: `toolkit/adapters/unexplored-boss/targets.test.ts`

**Interfaces:**
- Consumes: `UnexploredBossSpecV1` and AST insertion primitives.
- Produces: `renderBossDefinition`, `renderSummonMaterial`, `renderEquipmentEntries`, `renderTitle`, and `renderAchievement`.
- Produces: `planCatalogArtifacts(context, spec): Promise<readonly ArtifactPlan[]>`.

- [ ] **Step 1: Write failing deterministic-render tests**

```ts
it("renders the fixed drop order and image paths", () => {
  const rendered = renderBossDefinition(validSpec());
  expect(rendered).toContain("echo_warden: {");
  expect(rendered.indexOf("chancePct: 30")).toBeLessThan(rendered.indexOf("chancePct: 10"));
  expect(rendered.indexOf("chancePct: 10")).toBeLessThan(rendered.indexOf("chancePct: 0.5"));
  expect(rendered).toContain('/images/monster/v2/unexplored-boss-echo-warden.webp');
});
```

- [ ] **Step 2: Run template tests and verify RED**

Run: `npx vitest run toolkit/adapters/unexplored-boss/templates.test.ts toolkit/adapters/unexplored-boss/targets.test.ts`

Expected: FAIL because renderers and targets do not exist.

- [ ] **Step 3: Implement syntax-safe literal rendering**

Render all string values with `JSON.stringify`, numbers with finite canonical decimal notation, object keys
with JSON strings unless valid identifiers, and stable option-key order. Never interpolate raw YAML into
TypeScript comments or identifiers. Verify every rendered snippet by parsing it inside a fixture declaration.

- [ ] **Step 4: Plan the six named registry edits**

Use AST insertions for `UNEXPLORED_SUMMON_STONE_MATERIALS` and `UNEXPLORED_BOSSES` in
`unexploredBosses.ts`, `V2_EQUIPMENT_BASE` in `v2EquipmentCatalog.ts`, `TITLES` in `titles.ts`, and both
`BOSS_ACHIEVEMENT_ID_BY_BOSS` and `UNEXPLORED_ACHIEVEMENTS` in `unexploredProgression.ts`. Read pool IDs
from `UNEXPLORED_POOL_BY_ID` in `unexploredMonsterPools.ts` and reject unknown pools before planning writes.

- [ ] **Step 5: Run template and target tests**

Run: `npx vitest run toolkit/adapters/unexplored-boss/templates.test.ts toolkit/adapters/unexplored-boss/targets.test.ts`

Expected: PASS; fixture source retains unrelated bytes and the generated files parse with zero TypeScript diagnostics.

- [ ] **Step 6: Commit catalog rendering**

```bash
git add toolkit/adapters/unexplored-boss/templates.ts toolkit/adapters/unexplored-boss/templates.test.ts toolkit/adapters/unexplored-boss/targets.ts toolkit/adapters/unexplored-boss/targets.test.ts
git commit -m "feat: render unexplored boss catalog artifacts"
```

---

### Task 5: Generate concentrated mechanic, status, and test extension files

**Files:**
- Create: `toolkit/adapters/unexplored-boss/scaffolds.ts`
- Create: `toolkit/adapters/unexplored-boss/scaffolds.test.ts`
- Create: `toolkit/adapters/unexplored-boss/validators.ts`
- Create: `toolkit/adapters/unexplored-boss/validators.test.ts`

**Interfaces:**
- Produces: `planMechanicScaffolds(spec): readonly ArtifactPlan[]`.
- Produces: `validateUnexploredBossArtifacts(context, spec): Promise<readonly ValidationIssue[]>`.
- Uses the literal blocker `TOOLKIT_IMPLEMENT_ME` in generated extension files.

- [ ] **Step 1: Write failing scaffold-concentration tests**

```ts
it("keeps implementation blockers in mechanic and mechanic test only", () => {
  const plans = planMechanicScaffolds(validSpec());
  const blocked = plans.filter((plan) => textOf(plan).includes("TOOLKIT_IMPLEMENT_ME"));
  expect(blocked.map((plan) => plan.path)).toEqual([
    "src/adventure/v2/combat/echoWardenMechanic.ts",
    "src/adventure/v2/combat/echoWardenMechanic.test.ts",
  ]);
});
```

- [ ] **Step 2: Run scaffold tests and verify RED**

Run: `npx vitest run toolkit/adapters/unexplored-boss/scaffolds.test.ts toolkit/adapters/unexplored-boss/validators.test.ts`

Expected: FAIL because scaffold and validation modules do not exist.

- [ ] **Step 3: Render the mechanic extension contract**

Generate `<moduleName>Mechanic.ts` with a named battle-state type, `initial<PascalName>State`,
`normalize<PascalName>State`, and a module-level blocker that throws if executed. Generate its test with
explicit cases for initial state, malformed-state normalization, player/boss simultaneous defeat,
multi-hit boundary behavior, damage-over-time behavior, and session resume, each failing on the blocker.

- [ ] **Step 4: Render optional status files without business logic**

When `statusUi` is true, generate `src/adventure/v2/coop/<PascalName>Status.tsx` and its test. The component
accepts a named readonly display model and renders an opaque `SURFACE_INSET`. It contains no blocker and
renders only `null` for an absent model; the developer adds mechanic-specific fields while implementing the
mechanic. Add an integration checklist text artifact under `.toolkit/work/<task-id>/integration.md`, not the
repository, listing ATB, session JSON, list/detail API, replay, UI registry, and simulation touchpoints. The
checklist includes one exact `task scope add --paths ...` command for the selected existing files before they
are edited. Return this checklist as an `ArtifactPlan` with `scope: "task"`; every source and image output uses
`scope: "project"`.

- [ ] **Step 5: Implement release blockers and run tests**

The validator scans only planned mechanic files for `TOOLKIT_IMPLEMENT_ME`, checks all planned images are
referenced, requires no unresolved conflict, and reports `code: "mechanic-incomplete"` with both paths.

Run: `npx vitest run toolkit/adapters/unexplored-boss/scaffolds.test.ts toolkit/adapters/unexplored-boss/validators.test.ts`

Expected: PASS for blocker present, blocker cleared, status disabled, opaque surface import, and integration checklist cases.

- [ ] **Step 6: Commit concentrated scaffolding**

```bash
git add toolkit/adapters/unexplored-boss/scaffolds.ts toolkit/adapters/unexplored-boss/scaffolds.test.ts toolkit/adapters/unexplored-boss/validators.ts toolkit/adapters/unexplored-boss/validators.test.ts
git commit -m "feat: scaffold unexplored boss mechanics"
```

---

### Task 6: Register the adapter and prove real-repository dry-run behavior

**Files:**
- Create: `toolkit/adapters/unexplored-boss/adapter.ts`
- Create: `toolkit/adapters/unexplored-boss/adapter.test.ts`
- Modify: `toolkit/cli/runtime.ts`
- Create: `toolkit/testing/fixtures/repos/unexplored-boss/README.md`

**Interfaces:**
- Consumes: all adapter modules and core `ToolkitAdapter`.
- Produces: `unexploredBossAdapter: ToolkitAdapter<UnexploredBossSpecV1>`.

- [ ] **Step 1: Write a failing adapter integration test**

```ts
it("applies in a fixture, resumes, and produces an empty second diff", async () => {
  const first = await runContentCreate(fixtureRepo, fixtureSpec, { dryRun: false });
  expect(first.changedPaths).toContain("src/adventure/data/v2/unexploredBosses.ts");
  expect(first.changedPaths).toContain("src/adventure/v2/combat/echoWardenMechanic.ts");
  const second = await runContentCreate(fixtureRepo, fixtureSpec, { dryRun: false });
  expect(second.changedPaths).toEqual([]);
});
```

- [ ] **Step 2: Run the adapter integration test and verify RED**

Run: `npx vitest run toolkit/adapters/unexplored-boss/adapter.test.ts`

Expected: FAIL because the adapter is not registered.

- [ ] **Step 3: Compose adapter plans and checks**

Return catalog plus scaffold artifacts in stable path order. Fast checks are adapter tests, affected product
catalog tests, targeted ESLint, `npm run check-images` when images exist, and a 10-trial boss simulation after
the mechanic blocker is cleared. Full checks are supplied by Plan 3; until then return the core typecheck and
full product tests as conservative defaults.

- [ ] **Step 4: Register only the new adapter**

Register `unexplored-boss` in `toolkit/cli/runtime.ts`; reject any unknown adapter. Keep the registry explicit
so importing toolkit code cannot discover or execute arbitrary filesystem modules.

- [ ] **Step 5: Run the adapter suite and a real repository dry run**

Run: `npx vitest run toolkit/adapters/unexplored-boss src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/coopBosses.test.ts`

Run: `npm run toolkit -- content create unexplored-boss --spec toolkit/testing/fixtures/specs/unexplored-boss.yaml --dry-run`

Expected: Tests PASS. The dry run lists only the named registries, mechanic/status scaffolds, local checklist,
and four image targets; `git status --short` remains unchanged after the command.

- [ ] **Step 6: Commit the completed adapter**

```bash
git add toolkit/adapters/unexplored-boss toolkit/cli/runtime.ts toolkit/testing/fixtures
git commit -m "feat: add unexplored boss toolkit adapter"
```
