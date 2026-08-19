# Codex Mastery Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the permanent codex-mastery domain engine, additive database schema, transactional recording service, summary repair path, and independent operations switches that all later codex-mastery features depend on.

**Architecture:** Keep mastery rules in a pure catalog/transition layer under `src/adventure/data/v2/`, and keep locking, persistence, summary updates, and operations controls under `src/lib/server/`. Every gameplay integration will eventually call one transaction-aware recorder; this foundation does not yet wire hunting, fishing, equipment, cooking, life fields, jobs, UI, trophies, or monthly seasons.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19, TypeScript, Drizzle ORM/PostgreSQL, Vitest, ESLint.

## Global Constraints

- Preserve the current equipment- and fishing-codex SP milestones exactly; foundation code must not read or modify SP.
- New mastery progress and future rewards grant no SP, combat stats, drop-rate bonuses, gold, or consumable currency.
- All progress is server-authoritative and monotonic: stages, score, seals, and achievement timestamps never decrease.
- Published entry weights and thresholds are immutable; later catalog additions append new definitions.
- The schema migration is additive only. Do not drop, rename, or rewrite existing columns or tables.
- Do not deploy to any environment. Deployment requires a separate explicit user request.
- Preserve unrelated workspace changes and stage only files belonging to the current task.
- Read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js route; for this plan the relevant documents are `01-app/01-getting-started/15-route-handlers.md` and `01-app/01-getting-started/05-server-and-client-components.md`.
- Use regression-first TDD for behavior and schema contracts. Do not delete existing code or tests to restart a red-green cycle.
- All transaction-time setting reads must use the caller's `DbExecutor`; do not acquire a second database connection from inside an open transaction.
- No subagent may be created unless the user explicitly selects a subagent execution option.

---

## Program Decomposition

The approved design is a program of five independently reviewable subprojects. This plan implements only Phase A, because every other phase depends on its types and transactional contract.

| Phase | Deliverable | Depends on |
|---|---|---|
| A — Foundation | Pure engine, schema, persistence, recorder, summary repair, ops switches | Nothing |
| B — Catalog and gameplay integration | Six generated catalogs, historical backfill, authoritative event calls in fishing/hunt/equipment/cooking/life/job paths | A |
| C — Permanent UI and rankings | Mastery overview/detail APIs, codex UI, permanent overall/category rankings, tracking pins | A, B |
| D — Trophies and housing | Platinum/diamond badge tiers, evolving trophies, profile showcase and housing display | A, B, C |
| E — Monthly research | Month definitions, progress, seasonal ranking, idempotent settlement, seasonal trophies and operations | A, B, D |

Each later phase gets its own implementation plan before code changes begin. Phase A must leave stable interfaces so later plans do not reopen its storage or scoring boundaries.

### Approved-spec coverage ledger

| Design section | Delivery |
|---|---|
| §4 core model and §5 score model | Phase A Tasks 1, 2, and 5 |
| §6 category thresholds and seals | Phase B catalog/integration plan |
| §7 pacing | Phase B catalog validation and telemetry fixtures |
| §8 trophies | Phase D trophy/showcase plan |
| §9 monthly research | Phase E monthly-season plan |
| §10 codex and ranking UI | Phase C UI/ranking plan |
| §11 server/data foundation | Phase A Tasks 3–5; season/trophy tables remain in their owning phases |
| §12 historical migration | Phase A Task 6 provides repair; Phase B owns source-data backfill |
| §13 monthly settlement | Phase E |
| §14 abuse and consistency | Phase A Tasks 4–7 plus source-specific Phase B tests |
| §15 cosmetic rewards | Phases C–E; Phase A exposes no reward path |
| §16 operations | Phase A Task 7 defines all switches; owning phases consume them |
| §17 error/recovery | Phase A Tasks 5–7; season-specific recovery remains in Phase E |
| §18 rollout | Program decomposition table and per-phase plans |
| §19 verification | Task 8 plus each later phase's verification task |
| §20 completion criteria | Satisfied only after Phases A–E; Phase-A criteria are listed at the end of this plan |

## File and Responsibility Map

### New files

- `src/adventure/data/v2/codexMasteryTypes.ts` — shared category, stage, definition, mutation, progress, summary, and transition types.
- `src/adventure/data/v2/codexMastery.ts` — pure validation, stage resolution, score calculation, and monotonic transition functions.
- `src/adventure/data/v2/codexMastery.test.ts` — domain boundary and transition tests.
- `src/adventure/data/v2/codexMasteryCatalog.ts` — immutable catalog construction, keyed lookup, duplicate detection, and score-budget report.
- `src/adventure/data/v2/codexMasteryCatalog.test.ts` — catalog validation and budget tests.
- `src/db/codexMasterySchema.test.ts` — Drizzle table/column/index contract tests.
- `drizzle/0169_codex_mastery_foundation.sql` — additive generated migration.
- `drizzle/meta/0169_snapshot.json` — generated Drizzle snapshot.
- `src/lib/server/codexMasteryRepository.ts` — deterministic row creation, lock order, row conversion, and persistence.
- `src/lib/server/codexMasteryRepository.test.ts` — repository normalization and query-order tests with a fake executor.
- `src/lib/server/codexMasteryService.ts` — central transaction-aware recording service and typed failures.
- `src/lib/server/codexMasteryService.test.ts` — fake-store service tests for validation, deltas, and monotonicity.
- `src/lib/server/codexMasteryRepair.ts` — summary aggregation, dry-run comparison, and optional repair.
- `src/lib/server/codexMasteryRepair.test.ts` — aggregation and dry-run/apply tests.
- `scripts/repair-codex-mastery-summary.ts` — explicit `--dry-run`/`--apply` operator entry point.
- `src/app/api/admin/ops-settings/route.test.ts` — admin setting read/write and audit tests.

### Modified files

- `src/db/schema.ts` — exports `codexMasteryProgress` and `codexMasterySummary`.
- `drizzle/meta/_journal.json` — generated migration journal entry 169.
- `src/lib/server/opsSettings.ts` — codex feature-setting type, defaults, parser, and executor-aware reader.
- `src/lib/server/opsSettingsActive.test.ts` — parsing and same-executor read tests.
- `src/app/api/admin/ops-settings/route.ts` — admin GET/POST support and audit log for the new setting.
- `package.json` — adds a non-destructive summary-repair script alias.

## Stable Phase-A Interfaces

Later plans may consume these interfaces but must not rename them.

```ts
export type CodexMasteryCategory =
  | "equipment"
  | "fish"
  | "monster"
  | "cooking"
  | "life"
  | "job";

export type CodexMasteryStage =
  | "discovered"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "legendary";

export type CodexMasteryTier = "none" | CodexMasteryStage;

export type CodexMasteryMutation = {
  amount: number;
  discovered?: boolean;
  bestValue?: number;
  sealIds?: readonly string[];
};

export type CodexMasteryRecordingSettings = {
  recordingEnabled: boolean;
  sealsEnabled: boolean;
};

export async function recordCodexMastery(
  executor: DbExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now?: Date,
): Promise<CodexMasteryRecordResult>;
```

Scores are stored as integer milli-points. UI code later displays `Math.round(scoreMilli / 1000)`; no database column stores fractional numeric scores.

---

### Task 1: Pure mastery transition engine

**Files:**
- Create: `src/adventure/data/v2/codexMasteryTypes.ts`
- Create: `src/adventure/data/v2/codexMastery.ts`
- Create: `src/adventure/data/v2/codexMastery.test.ts`

**Interfaces:**
- Produces: `CodexMasteryCategory`, `CodexMasteryStage`, `CodexMasteryTier`, `CodexMasteryEntryDefinition`, `CodexMasteryProgress`, `CodexMasteryMutation`, `CodexMasteryTransition`.
- Produces: `emptyCodexMasteryProgress()`, `validateCodexMasteryDefinition()`, `applyCodexMasteryMutation()`, `displayCodexMasteryScore()`.
- Consumes: no database or React code.

- [ ] **Step 1: Write failing transition tests**

Create tests that cover multi-stage catch-up, score units, seal deduplication, best-value monotonicity, timestamps, and bad mutations:

```ts
import { describe, expect, it } from "vitest";
import {
  applyCodexMasteryMutation,
  displayCodexMasteryScore,
  emptyCodexMasteryProgress,
  validateCodexMasteryDefinition,
} from "./codexMastery";
import type { CodexMasteryEntryDefinition } from "./codexMasteryTypes";

const FISH: CodexMasteryEntryDefinition = {
  category: "fish",
  entryId: "fish:test-carp",
  label: "시험 잉어",
  thresholds: {
    bronze: 5,
    silver: 30,
    gold: 150,
    platinum: 500,
    diamond: 1_500,
    legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: {
    giant: { pointUnits: 2 },
    nearMax: { pointUnits: 4 },
  },
};

describe("codex mastery transition", () => {
  it("catches up through gold and awards every stage once", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const result = applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 150, sealIds: ["giant", "giant"] },
      now,
    );

    expect(result.next).toMatchObject({
      count: 150,
      currentTier: "gold",
      sealIds: ["giant"],
      scoreMilli: 9_000,
    });
    expect(result.newStages).toEqual([
      "discovered",
      "bronze",
      "silver",
      "gold",
    ]);
    expect(result.scoreDeltaMilli).toBe(9_000);
  });

  it("never lowers count, best value, tier, score, seals, or achieved timestamps", () => {
    const first = applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 500, bestValue: 75, sealIds: ["giant"] },
      new Date("2026-08-20T00:00:00.000Z"),
    ).next;
    const second = applyCodexMasteryMutation(
      FISH,
      first,
      { amount: 0, bestValue: 70, sealIds: ["giant"] },
      new Date("2026-08-21T00:00:00.000Z"),
    );

    expect(second.next).toEqual(first);
    expect(second.scoreDeltaMilli).toBe(0);
  });

  it("rejects decreasing thresholds, unknown seals, and negative or non-finite input", () => {
    expect(validateCodexMasteryDefinition({
      ...FISH,
      thresholds: { ...FISH.thresholds, silver: 4 },
    })).toContain("thresholds must increase");
    expect(() => applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: -1 },
      new Date(),
    )).toThrow("amount");
    expect(() => applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 1, sealIds: ["missing"] },
      new Date(),
    )).toThrow("unknown seal");
  });

  it("rounds milli-points only for display", () => {
    expect(displayCodexMasteryScore(10_499)).toBe(10);
    expect(displayCodexMasteryScore(10_500)).toBe(11);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts
```

Expected: FAIL because `codexMastery.ts` and `codexMasteryTypes.ts` do not exist.

- [ ] **Step 3: Add the domain types**

Define the stable types and constants in `codexMasteryTypes.ts`:

```ts
export const CODEX_MASTERY_CATEGORIES = [
  "equipment", "fish", "monster", "cooking", "life", "job",
] as const;

export const CODEX_MASTERY_STAGES = [
  "discovered", "bronze", "silver", "gold", "platinum", "diamond", "legendary",
] as const;

export const CODEX_MASTERY_POINT_UNITS = {
  discovered: 1,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  legendary: 6,
} as const;

export type CodexMasteryCategory = typeof CODEX_MASTERY_CATEGORIES[number];
export type CodexMasteryStage = typeof CODEX_MASTERY_STAGES[number];
export type CodexMasteryTier = "none" | CodexMasteryStage;
export type CodexMasteryCountStage = Exclude<CodexMasteryStage, "discovered">;

export type CodexMasteryEntryDefinition = {
  category: CodexMasteryCategory;
  entryId: string;
  label: string;
  thresholds: Record<CodexMasteryCountStage, number>;
  scoreWeightMilli: number;
  seals: Readonly<Record<string, { pointUnits: 2 | 4 }>>;
};

export type CodexMasteryProgress = {
  category: CodexMasteryCategory;
  entryId: string;
  count: number;
  bestValue: number | null;
  currentTier: CodexMasteryTier;
  sealIds: string[];
  tierAchievedAt: Partial<Record<CodexMasteryStage, string>>;
  scoreMilli: number;
};

export type CodexMasteryMutation = {
  amount: number;
  discovered?: boolean;
  bestValue?: number;
  sealIds?: readonly string[];
};
```

- [ ] **Step 4: Implement the minimal pure transition engine**

In `codexMastery.ts`:

```ts
export function emptyCodexMasteryProgress(
  category: CodexMasteryCategory,
  entryId: string,
): CodexMasteryProgress {
  return {
    category,
    entryId,
    count: 0,
    bestValue: null,
    currentTier: "none",
    sealIds: [],
    tierAchievedAt: {},
    scoreMilli: 0,
  };
}

export function displayCodexMasteryScore(scoreMilli: number): number {
  return Math.round(Math.max(0, scoreMilli) / 1_000);
}
```

Implement `validateCodexMasteryDefinition` so IDs are non-empty, `scoreWeightMilli` is a positive safe integer, all six count thresholds are positive safe integers in strict ascending order, and seal IDs are non-empty with point units 2 or 4. Implement `applyCodexMasteryMutation` so `amount` is a non-negative safe integer, `bestValue` is absent or finite and non-negative, unknown seals throw, `amount > 0` implies discovery, every newly crossed stage receives one immutable ISO timestamp, and score delta is the sum of new stage/seal units multiplied by `scoreWeightMilli`.

Use one ordered pass so a large historical mutation earns every crossed stage:

```ts
const discovered = previous.currentTier !== "none" || mutation.discovered === true || mutation.amount > 0;
const nextCount = previous.count + mutation.amount;
const reached = CODEX_MASTERY_STAGES.filter((stage) =>
  stage === "discovered"
    ? discovered
    : nextCount >= definition.thresholds[stage],
);
const newStages = reached.filter((stage) => previous.tierAchievedAt[stage] == null);
```

- [ ] **Step 5: Run the domain tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts
```

Expected: PASS with all four domain tests green.

- [ ] **Step 6: Commit the pure domain engine**

```bash
git add src/adventure/data/v2/codexMasteryTypes.ts src/adventure/data/v2/codexMastery.ts src/adventure/data/v2/codexMastery.test.ts
git commit -m "feat: add codex mastery domain engine"
```

---

### Task 2: Immutable catalog registry and budget validation

**Files:**
- Create: `src/adventure/data/v2/codexMasteryCatalog.ts`
- Create: `src/adventure/data/v2/codexMasteryCatalog.test.ts`

**Interfaces:**
- Consumes: `CodexMasteryEntryDefinition`, `CodexMasteryCategory`, `CODEX_MASTERY_POINT_UNITS` from Task 1.
- Produces: `CodexMasteryCatalog`, `createCodexMasteryCatalog()`, `codexMasteryBudgetReport()`.

- [ ] **Step 1: Write failing catalog tests**

```ts
import { describe, expect, it } from "vitest";
import {
  codexMasteryBudgetReport,
  createCodexMasteryCatalog,
} from "./codexMasteryCatalog";
import type { CodexMasteryEntryDefinition } from "./codexMasteryTypes";

const definition = (entryId: string): CodexMasteryEntryDefinition => ({
  category: "fish",
  entryId,
  label: entryId,
  thresholds: {
    bronze: 5, silver: 30, gold: 150,
    platinum: 500, diamond: 1_500, legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: {},
});

describe("codex mastery catalog", () => {
  it("provides immutable keyed lookup and deterministic category lists", () => {
    const catalog = createCodexMasteryCatalog([
      definition("fish:b"),
      definition("fish:a"),
    ]);
    expect(catalog.get("fish", "fish:a")?.label).toBe("fish:a");
    expect(catalog.list("fish").map((entry) => entry.entryId)).toEqual([
      "fish:a", "fish:b",
    ]);
  });

  it("rejects duplicate category/entry keys", () => {
    expect(() => createCodexMasteryCatalog([
      definition("fish:a"), definition("fish:a"),
    ])).toThrow("duplicate codex mastery entry");
  });

  it("reports legendary standard-stage budget without seal points", () => {
    const report = codexMasteryBudgetReport(
      createCodexMasteryCatalog([definition("fish:a")]),
    );
    expect(report.fish).toEqual({ entries: 1, scoreMilli: 22_000 });
  });
});
```

- [ ] **Step 2: Verify the catalog test fails**

Run:

```bash
npm test -- src/adventure/data/v2/codexMasteryCatalog.test.ts
```

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Implement the catalog registry**

Implement a read-only registry:

```ts
export type CodexMasteryCatalog = {
  get(category: CodexMasteryCategory, entryId: string): CodexMasteryEntryDefinition | null;
  list(category?: CodexMasteryCategory): readonly CodexMasteryEntryDefinition[];
};

export function createCodexMasteryCatalog(
  definitions: readonly CodexMasteryEntryDefinition[],
): CodexMasteryCatalog;

export function codexMasteryBudgetReport(
  catalog: CodexMasteryCatalog,
): Record<CodexMasteryCategory, { entries: number; scoreMilli: number }>;
```

Validate every definition with Task 1, key entries by `${category}:${entryId}`, sort category lists by `entryId`, clone and freeze returned definitions, and calculate the 22 standard point units through legendary without adding seal points. Do not introduce an empty global production catalog; Phase B will export the real generated catalog.

- [ ] **Step 4: Run both pure test files**

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the catalog registry**

```bash
git add src/adventure/data/v2/codexMasteryCatalog.ts src/adventure/data/v2/codexMasteryCatalog.test.ts
git commit -m "feat: validate codex mastery catalogs"
```

---

### Task 3: Additive mastery database schema and migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/codexMasterySchema.test.ts`
- Create: `drizzle/0169_codex_mastery_foundation.sql`
- Create: `drizzle/meta/0169_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: Drizzle exports `codexMasteryProgress` and `codexMasterySummary`.
- Consumes: existing `users` foreign key and existing Drizzle migration workflow.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  codexMasteryProgress,
  codexMasterySummary,
} from "./schema";

describe("codex mastery schema", () => {
  it("exports dedicated progress and indexed-summary tables", () => {
    expect(getTableName(codexMasteryProgress)).toBe("codex_mastery_progress");
    expect(Object.keys(getTableColumns(codexMasteryProgress))).toEqual(
      expect.arrayContaining([
        "userId", "category", "entryId", "count", "bestValue",
        "currentTier", "sealIds", "tierAchievedAt", "scoreMilli",
        "firstRecordedAt", "updatedAt",
      ]),
    );
    expect(getTableName(codexMasterySummary)).toBe("codex_mastery_summary");
    expect(Object.keys(getTableColumns(codexMasterySummary))).toEqual(
      expect.arrayContaining([
        "userId", "totalScoreMilli", "equipmentScoreMilli", "fishScoreMilli",
        "monsterScoreMilli", "cookingScoreMilli", "lifeScoreMilli",
        "jobScoreMilli", "bronzeCount", "silverCount", "goldCount",
        "platinumCount", "diamondCount", "legendaryCount", "sealCount",
        "scoreReachedAt", "updatedAt",
      ]),
    );
  });
});
```

- [ ] **Step 2: Verify the schema test fails**

```bash
npm test -- src/db/codexMasterySchema.test.ts
```

Expected: FAIL because the two schema exports do not exist.

- [ ] **Step 3: Add the two schema definitions**

Add `codexMasteryProgress` with a primary key on `(userId, category, entryId)`, `bigint(..., { mode: "number" })` for `count` and `scoreMilli`, `doublePrecision` for nullable `bestValue`, JSONB arrays/maps for seals and achievement timestamps, and a user/category/tier index. Add non-negative checks for count and score.

Add `codexMasterySummary` with `userId` as a cascading foreign-key primary key, milli-point bigint columns for total and six categories, cumulative integer counts for bronze through legendary plus seals, and `scoreReachedAt`/`updatedAt`. Add descending indexes for total and each category score, with `scoreReachedAt` and `userId` as deterministic trailing sort columns.

Use this field pattern:

```ts
scoreMilli: bigint("score_milli", { mode: "number" }).notNull().default(0),
sealIds: jsonb("seal_ids").$type<string[]>().notNull().default([]),
tierAchievedAt: jsonb("tier_achieved_at")
  .$type<Partial<Record<CodexMasteryStage, string>>>()
  .notNull()
  .default({}),
```

- [ ] **Step 4: Run the schema test**

```bash
npm test -- src/db/codexMasterySchema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Generate the named migration**

```bash
npm run db:generate -- --name=codex_mastery_foundation
```

Expected: Drizzle creates `drizzle/0169_codex_mastery_foundation.sql`, `drizzle/meta/0169_snapshot.json`, and journal entry 169. Inspect the SQL and confirm it only creates the two new tables, checks, foreign keys, and indexes.

- [ ] **Step 6: Validate migration bookkeeping**

```bash
npm run check-migrations
npm test -- src/db/migrationJournal.test.ts src/db/codexMasterySchema.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit schema and migration**

```bash
git add src/db/schema.ts src/db/codexMasterySchema.test.ts drizzle/0169_codex_mastery_foundation.sql drizzle/meta/0169_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: add codex mastery storage"
```

---

### Task 4: Deterministic locking and persistence adapter

**Files:**
- Create: `src/lib/server/codexMasteryRepository.ts`
- Create: `src/lib/server/codexMasteryRepository.test.ts`

**Interfaces:**
- Consumes: Task 1 progress types and Task 3 Drizzle tables.
- Produces: `CodexMasterySummaryState`, `CodexMasteryStore`, `emptyCodexMasterySummary()`, `lockCodexMasteryState()`, `saveCodexMasteryState()`, `readCodexMasteryProgressRows()`, `createDrizzleCodexMasteryStore()`.

- [ ] **Step 1: Write failing row-normalization and lock-order tests**

Test corrupt-row normalization and the required summary-before-progress lock order:

```ts
describe("codex mastery repository", () => {
  it("normalizes persisted arrays, timestamps, and non-negative counters", () => {
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: -4,
      bestValue: Number.NaN,
      currentTier: "bogus",
      sealIds: ["giant", "giant", 4],
      tierAchievedAt: { bronze: "bad", gold: "2026-08-20T00:00:00.000Z" },
      scoreMilli: -10,
    })).toMatchObject({
      count: 0,
      bestValue: null,
      currentTier: "none",
      sealIds: ["giant"],
      tierAchievedAt: {},
      scoreMilli: 0,
    });
  });

  it("ensures and locks the user summary before the entry row", async () => {
    const fake = recordingExecutor();
    await lockCodexMasteryState(
      fake.executor,
      "user-1",
      "fish",
      "fish:a",
      new Date("2026-08-20T00:00:00.000Z"),
    );
    expect(fake.events).toEqual([
      "ensure-summary",
      "lock-summary",
      "ensure-progress",
      "lock-progress",
    ]);
  });
});
```

The fake executor must implement only the Drizzle chain methods used by the repository and record each terminal call. It must return one zero-valued summary row and one zero-valued progress row.

- [ ] **Step 2: Verify the repository tests fail**

```bash
npm test -- src/lib/server/codexMasteryRepository.test.ts
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement row conversion and empty state**

Export a summary state with cumulative stage counts:

```ts
export type CodexMasterySummaryState = {
  totalScoreMilli: number;
  categoryScoreMilli: Record<CodexMasteryCategory, number>;
  stageCounts: Record<Exclude<CodexMasteryStage, "discovered">, number>;
  sealCount: number;
  scoreReachedAt: Date | null;
};
```

Normalize every numeric field to a finite non-negative safe integer, deduplicate valid string seal IDs, retain only valid stage keys with ISO timestamp values at or below the valid current tier, and return `none` with no achievement timestamps for an unknown tier. Do not silently change category or entry ID.

- [ ] **Step 4: Implement deterministic locks and writes**

`lockCodexMasteryState` must:

1. insert a zero-valued summary row with `onConflictDoNothing()`;
2. select that summary row `FOR UPDATE`;
3. insert a zero-valued progress row with `onConflictDoNothing()`;
4. select that progress row `FOR UPDATE`;
5. return normalized domain states.

All calls for one user therefore serialize on the summary row before attempting an entry lock, preventing cross-entry deadlocks. `saveCodexMasteryState` updates both locked rows with the same `updatedAt`. It must not start its own transaction or import the global `db`; it only accepts the caller's `DbExecutor`.

Keep the lock sequence explicit in the implementation:

```ts
await executor.insert(codexMasterySummary).values(emptySummaryRow(userId, now)).onConflictDoNothing();
const summaryRow = await selectSummary(executor, userId, { forUpdate: true });
await executor.insert(codexMasteryProgress).values(emptyProgressRow(userId, category, entryId, now)).onConflictDoNothing();
const progressRow = await selectProgress(executor, userId, category, entryId, { forUpdate: true });
return {
  summary: codexMasterySummaryRowToState(summaryRow),
  progress: codexMasteryRowToProgress(progressRow),
};
```

Expose the store boundary used by the service tests:

```ts
export type CodexMasteryStore = {
  lock(input: { userId: string; category: CodexMasteryCategory; entryId: string }, now: Date): Promise<{
    summary: CodexMasterySummaryState;
    progress: CodexMasteryProgress;
  }>;
  save(input: { userId: string; summary: CodexMasterySummaryState; progress: CodexMasteryProgress }, now: Date): Promise<void>;
};

export function createDrizzleCodexMasteryStore(executor: DbExecutor): CodexMasteryStore;
```

- [ ] **Step 5: Run repository and schema tests**

```bash
npm test -- src/lib/server/codexMasteryRepository.test.ts src/db/codexMasterySchema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit repository code**

```bash
git add src/lib/server/codexMasteryRepository.ts src/lib/server/codexMasteryRepository.test.ts
git commit -m "feat: persist codex mastery progress"
```

---

### Task 5: Central transaction-aware recording service

**Files:**
- Create: `src/lib/server/codexMasteryService.ts`
- Create: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Consumes: Task 1 transition engine, Task 2 `CodexMasteryCatalog`, and Task 4 repository.
- Produces: `CodexMasteryRecordingSettings`, `CodexMasteryRecordInput`, `CodexMasteryRecordResult`, `CodexMasteryRecordError`, `createCodexMasteryRecorder()`, `recordCodexMastery()`.

- [ ] **Step 1: Write failing service tests with an in-memory store**

```ts
describe("recordCodexMastery", () => {
  it("updates entry and cumulative summary deltas exactly once", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    const result = await recorder.record({
      userId: "user-1",
      category: "fish",
      entryId: "fish:test-carp",
      mutation: { amount: 150, sealIds: ["giant"] },
      source: "fishing.catch",
    }, ENABLED, new Date("2026-08-20T00:00:00.000Z"));

    expect(result).toMatchObject({
      recorded: true,
      newStages: ["discovered", "bronze", "silver", "gold"],
      newSealIds: ["giant"],
      scoreDeltaMilli: 9_000,
    });
    expect(store.summary).toMatchObject({
      totalScoreMilli: 9_000,
      categoryScoreMilli: { fish: 9_000 },
      stageCounts: { bronze: 1, silver: 1, gold: 1 },
      sealCount: 1,
    });
  });

  it("returns a no-op without locking when recording is disabled", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    expect(await recorder.record(validInput(), {
      ...ENABLED,
      recordingEnabled: false,
    }, new Date())).toEqual({ recorded: false, reason: "disabled" });
    expect(store.lockCalls).toBe(0);
  });

  it("records stages but suppresses seals when seal scoring is disabled", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    const result = await recorder.record({
      ...validInput(),
      mutation: { amount: 5, sealIds: ["giant"] },
    }, { ...ENABLED, sealsEnabled: false }, new Date());
    expect(result).toMatchObject({ recorded: true, newSealIds: [] });
    expect(store.progress.sealIds).toEqual([]);
  });

  it("rejects unknown entries, blank sources, and client-derived sources", async () => {
    const recorder = createCodexMasteryRecorder(memoryCodexMasteryStore(), TEST_CATALOG);
    await expect(recorder.record({
      ...validInput(),
      entryId: "fish:missing",
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "unknown_entry" });
    await expect(recorder.record({
      ...validInput(),
      source: "client",
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "invalid_source" });
  });

  it("does not write when a repeated event adds no progress", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    await recorder.record(validInput(), ENABLED, new Date());
    store.saveCalls = 0;
    const result = await recorder.record({
      ...validInput(),
      mutation: { amount: 0 },
    }, ENABLED, new Date());
    expect(result).toEqual({ recorded: false, reason: "unchanged" });
    expect(store.saveCalls).toBe(0);
  });
});
```

Use Task 4's `CodexMasteryStore` interface and a test-only in-memory implementation. The production adapter is Task 4's `createDrizzleCodexMasteryStore`.

- [ ] **Step 2: Verify service tests fail**

```bash
npm test -- src/lib/server/codexMasteryService.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement typed input, result, and errors**

```ts
export type CodexMasteryRecordInput = {
  userId: string;
  category: CodexMasteryCategory;
  entryId: string;
  mutation: CodexMasteryMutation;
  source: string;
};

export type CodexMasteryRecordingSettings = {
  recordingEnabled: boolean;
  sealsEnabled: boolean;
};

export type CodexMasteryRecordResult =
  | { recorded: false; reason: "disabled" | "unchanged" }
  | {
      recorded: true;
      progress: CodexMasteryProgress;
      newStages: CodexMasteryStage[];
      newSealIds: string[];
      scoreDeltaMilli: number;
    };

export class CodexMasteryRecordError extends Error {
  constructor(
    readonly code: "unknown_entry" | "invalid_source" | "invalid_mutation",
    message: string,
  ) {
    super(message);
  }
}
```

Accept only server-owned dot-separated source IDs matching `/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/`; the literal `client` and blank strings fail this rule.

Validate requested seal IDs against the entry definition even when `sealsEnabled` is false, so an integration typo is not hidden by an operations switch. After validation, pass an empty seal list to the transition engine when seal scoring is disabled; count, best-value, and stage progress still record normally.

- [ ] **Step 4: Implement summary delta application**

For each newly earned count stage, increment its cumulative counter once. When a transition reaches gold, for example, a fresh entry increments bronze, silver, and gold because `newStages` contains all three. Increase the seal count by `newSealIds.length`, add score delta to total and the matching category column, and set `scoreReachedAt` to `now` only when `scoreDeltaMilli > 0`. Guard every addition with `Number.isSafeInteger` and throw `invalid_mutation` before saving on overflow.

Use the transition list rather than inferring deltas from the final tier:

```ts
for (const stage of transition.newStages) {
  if (stage !== "discovered") nextSummary.stageCounts[stage] += 1;
}
nextSummary.sealCount += transition.newSealIds.length;
nextSummary.totalScoreMilli += transition.scoreDeltaMilli;
nextSummary.categoryScoreMilli[input.category] += transition.scoreDeltaMilli;
if (transition.scoreDeltaMilli > 0) nextSummary.scoreReachedAt = now;
```

- [ ] **Step 5: Implement production wrapper without nested transactions**

```ts
export async function recordCodexMastery(
  executor: DbExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store = createDrizzleCodexMasteryStore(executor);
  return createCodexMasteryRecorder(store, catalog).record(input, settings, now);
}
```

This wrapper assumes the gameplay route already owns the transaction. It must never call `db.transaction()` itself.

- [ ] **Step 6: Run domain, repository, and service tests**

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the recording service**

```bash
git add src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryService.test.ts
git commit -m "feat: record codex mastery transactionally"
```

---

### Task 6: Summary rebuild and dry-run repair tool

**Files:**
- Create: `src/lib/server/codexMasteryRepair.ts`
- Create: `src/lib/server/codexMasteryRepair.test.ts`
- Create: `scripts/repair-codex-mastery-summary.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 3 progress/summary tables and Task 4 summary state.
- Produces: `aggregateCodexMasterySummary()`, `compareCodexMasterySummary()`, `repairCodexMasterySummary()`, CLI `npm run codex-mastery:repair -- --dry-run`.

- [ ] **Step 1: Write failing pure aggregation tests**

```ts
describe("codex mastery summary repair", () => {
  it("rebuilds category scores and cumulative stage counts from progress rows", () => {
    const rebuilt = aggregateCodexMasterySummary([
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000, sealIds: ["giant"] }),
      progressRow({ category: "job", currentTier: "silver", scoreMilli: 4_000, sealIds: [] }),
    ]);
    expect(rebuilt).toMatchObject({
      totalScoreMilli: 13_000,
      categoryScoreMilli: { fish: 9_000, job: 4_000 },
      stageCounts: {
        bronze: 2,
        silver: 2,
        gold: 1,
        platinum: 0,
        diamond: 0,
        legendary: 0,
      },
      sealCount: 1,
    });
  });

  it("reports differences in dry-run mode without writing", async () => {
    const store = repairStore({ totalScoreMilli: 1 }, [
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000 }),
    ]);
    const result = await repairCodexMasterySummary(store, "user-1", {
      apply: false,
      now: new Date("2026-08-20T00:00:00.000Z"),
    });
    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(store.saveCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Verify the repair tests fail**

```bash
npm test -- src/lib/server/codexMasteryRepair.test.ts
```

Expected: FAIL because the repair module does not exist.

- [ ] **Step 3: Implement aggregation and repair**

Aggregate cumulative counts by comparing each valid current tier against the ordered count stages. Sum each row's stored score into its category and total, count deduplicated row seals, and use the latest row update as the rebuilt `scoreReachedAt` only when the existing exact reach time cannot be recovered. `compareCodexMasterySummary` returns field-level `{ before, after }` entries. `repairCodexMasterySummary` writes only when `apply: true` and a difference exists.

The repair boundary stays dependency-injected for tests:

```ts
export async function repairCodexMasterySummary(
  store: CodexMasteryRepairStore,
  userId: string,
  options: { apply: boolean; now: Date },
): Promise<{
  changed: boolean;
  applied: boolean;
  before: CodexMasterySummaryState;
  after: CodexMasterySummaryState;
  differences: Record<string, { before: number | Date | null; after: number | Date | null }>;
}> {
  const before = await store.readSummary(userId);
  const after = aggregateCodexMasterySummary(await store.readProgress(userId));
  const differences = compareCodexMasterySummary(before, after);
  if (options.apply && Object.keys(differences).length > 0) await store.saveSummary(userId, after, options.now);
  return { changed: Object.keys(differences).length > 0, applied: options.apply && Object.keys(differences).length > 0, before, after, differences };
}
```

- [ ] **Step 4: Implement the explicit CLI guard**

The script must require exactly one mode:

```ts
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (apply === dryRun) {
  throw new Error("pass exactly one of --dry-run or --apply");
}
```

Support optional `--user=<userId>`; without it, page through summary users in stable user-ID order and print changed/applied/error counts. Never include a production environment file path in the script. Add:

```json
"codex-mastery:repair": "tsx scripts/repair-codex-mastery-summary.ts"
```

- [ ] **Step 5: Run tests and a mode-validation smoke check**

```bash
npm test -- src/lib/server/codexMasteryRepair.test.ts
npm run codex-mastery:repair
```

Expected: tests PASS; the CLI exits non-zero with `pass exactly one of --dry-run or --apply` before attempting a database connection.

- [ ] **Step 6: Commit repair support**

```bash
git add src/lib/server/codexMasteryRepair.ts src/lib/server/codexMasteryRepair.test.ts scripts/repair-codex-mastery-summary.ts package.json
git commit -m "feat: repair codex mastery summaries"
```

---

### Task 7: Independent operations switches and admin API

**Files:**
- Modify: `src/lib/server/opsSettings.ts`
- Modify: `src/lib/server/opsSettingsActive.test.ts`
- Modify: `src/app/api/admin/ops-settings/route.ts`
- Create: `src/app/api/admin/ops-settings/route.test.ts`

**Interfaces:**
- Produces: `CODEX_MASTERY_FEATURES_KEY`, `CodexMasteryFeatureSettings`, `DEFAULT_CODEX_MASTERY_FEATURES`, `parseCodexMasteryFeatureSettings()`, `readCodexMasteryFeatureSettings()`.
- Consumes: existing `ops_settings`, admin authorization, `upsertOpsSetting`, and `logAdminAction` patterns.

- [ ] **Step 1: Add failing parser and executor tests**

```ts
describe("codex mastery feature settings", () => {
  it("defaults every new feature off and preserves explicit switches", () => {
    expect(parseCodexMasteryFeatureSettings({ recordingEnabled: true })).toEqual({
      recordingEnabled: true,
      rankingVisible: false,
      sealsEnabled: false,
      trophiesEnabled: false,
      monthlyProgressEnabled: false,
      monthlyRankingVisible: false,
      settlementEnabled: false,
      feedEnabled: false,
    });
  });

  it("reads through the supplied executor", async () => {
    const { executor, select } = executorReturning([{
      key: CODEX_MASTERY_FEATURES_KEY,
      value: { recordingEnabled: true },
    }]);
    const settings = await readCodexMasteryFeatureSettings(executor);
    expect(select).toHaveBeenCalledTimes(1);
    expect(settings.recordingEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Verify the settings test fails**

```bash
npm test -- src/lib/server/opsSettingsActive.test.ts
```

Expected: FAIL because the codex setting exports do not exist.

- [ ] **Step 3: Implement parser and executor-aware reader**

```ts
export const CODEX_MASTERY_FEATURES_KEY = "codex-mastery-features.v1";

export type CodexMasteryFeatureSettings = {
  recordingEnabled: boolean;
  rankingVisible: boolean;
  sealsEnabled: boolean;
  trophiesEnabled: boolean;
  monthlyProgressEnabled: boolean;
  monthlyRankingVisible: boolean;
  settlementEnabled: boolean;
  feedEnabled: boolean;
};

export const DEFAULT_CODEX_MASTERY_FEATURES: CodexMasteryFeatureSettings = {
  recordingEnabled: false,
  rankingVisible: false,
  sealsEnabled: false,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
  monthlyRankingVisible: false,
  settlementEnabled: false,
  feedEnabled: false,
};
```

Parse only booleans and fall back field-by-field. Read the single setting row through the supplied `DbExecutor`, matching `readLifeFieldFeatureSettings` without importing a second connection during transactions.

- [ ] **Step 4: Write failing admin route tests**

Mock `requireAdmin`, `currentAdminEmail`, readers, `upsertOpsSetting`, and `logAdminAction`. Assert GET includes `codexMasteryFeatures`; POST with `{ codexMasteryFeatures: { recordingEnabled: true } }` stores the fully parsed eight-field object under `CODEX_MASTERY_FEATURES_KEY` and logs `ops-settings.codex-mastery-features.update`; a body without a supported setting still returns 400.

- [ ] **Step 5: Implement admin GET/POST support**

Add `readCodexMasteryFeatureSettings()` to the GET `Promise.all`, return it as `codexMasteryFeatures`, accept `codexMasteryFeatures?: unknown` in POST, parse before storing, and include only the eight booleans in the audit detail. Do not add a public mutation route.

Use the existing audited setting pattern:

```ts
if ("codexMasteryFeatures" in body) {
  const codexMasteryFeatures = parseCodexMasteryFeatureSettings(body.codexMasteryFeatures);
  await upsertOpsSetting(CODEX_MASTERY_FEATURES_KEY, codexMasteryFeatures, adminEmail, now);
  await logAdminAction({
    adminEmail,
    action: "ops-settings.codex-mastery-features.update",
    detail: codexMasteryFeatures,
  });
  updated.codexMasteryFeatures = codexMasteryFeatures;
}
```

- [ ] **Step 6: Run settings and route tests**

```bash
npm test -- src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit operations controls**

```bash
git add src/lib/server/opsSettings.ts src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.ts src/app/api/admin/ops-settings/route.test.ts
git commit -m "feat: add codex mastery operations switches"
```

---

### Task 8: Foundation verification and phase-boundary audit

**Files:**
- Modify only files from Tasks 1–7 if verification finds a defect.

**Interfaces:**
- Verifies all Phase-A stable interfaces and confirms Phase B can integrate without schema redesign.

- [ ] **Step 1: Run all foundation tests together**

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts src/db/codexMasterySchema.test.ts src/db/migrationJournal.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryRepair.test.ts src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run migration and static checks**

```bash
npm run check-migrations
npx tsc --noEmit
npx eslint src/adventure/data/v2/codexMasteryTypes.ts src/adventure/data/v2/codexMastery.ts src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.ts src/adventure/data/v2/codexMasteryCatalog.test.ts src/db/schema.ts src/db/codexMasterySchema.test.ts src/lib/server/codexMasteryRepository.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryRepair.ts src/lib/server/codexMasteryRepair.test.ts src/lib/server/opsSettings.ts src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.ts src/app/api/admin/ops-settings/route.test.ts scripts/repair-codex-mastery-summary.ts
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the full regression suite and production build**

```bash
npm test
npm run build
```

Expected: all Vitest suites pass and Next.js 16.2.11 build exits 0. The image hooks should report the existing optimized state and must not introduce unrelated asset changes.

- [ ] **Step 4: Audit the stable contract against Phase B needs**

Confirm from the actual exports and tests that Phase B can:

- create one immutable catalog containing all six categories;
- call `recordCodexMastery` inside an existing gameplay transaction;
- pass source IDs such as `fishing.catch`, `hunt.victory`, `equipment.drop`, `equipment.craft`, `cooking.complete`, `life.complete`, and `job.victory`;
- receive newly reached stages and seals for batched notification;
- rebuild summaries after historical progress backfill;
- enable recording independently while rankings, seals, trophies, monthly progress, settlement, and feed remain off.

If any item is false, fix it with a failing test in the responsible task's test file before continuing.

- [ ] **Step 5: Confirm repository scope**

```bash
git status --short
git log --oneline -8
```

Expected: only intended Phase-A files are changed, or the tree is clean after the task commits. No deployment, push, PR, production migration, repair `--apply`, or operations-setting write has occurred.

## Phase-A Exit Criteria

- All seven permanent stages are represented by one shared type and one monotonic pure transition function.
- Catalog validation rejects bad thresholds, weights, seals, and duplicates.
- The additive migration creates dedicated progress and indexed summary tables.
- Every write locks the per-user summary before an entry row and runs in the caller's transaction.
- Summary score and cumulative stage/seal counts update only by transition deltas.
- A dry-run-first repair path can rebuild summary rows from detailed progress.
- Eight independent operations switches default off and are admin-audited.
- No gameplay route, user UI, trophy, season, SP calculation, or deployment is changed in Phase A.
