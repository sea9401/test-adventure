# Tier 7 Advancement Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable, server-authoritative first-unlock rules for the four internal tier-7 jobs without making those jobs selectable before their cultivation profiles and job bonuses are approved.

**Architecture:** Move shared tier-7 identity and prerequisite data into a small job metadata module, then evaluate mastery, current-job, level, material, and permanent-history state in a pure advancement policy module. Wire that result into the existing state response, advancement transaction, roadmap details, and confirmation modal; production remains inert because the four tier-7 jobs stay outside `V2_JOB_CATALOG`.

**Tech Stack:** TypeScript, Next.js App Router Route Handlers using native `Request`/`Response`, React, Vitest, React server rendering tests, Tailwind CSS, PostgreSQL transactions through Drizzle helpers.

## Global Constraints

- Initial tier-7 targets are only `shadowblade`, `ruinblade`, `skyascendant`, and `primordialsage`.
- Each first unlock requires both declared tier-6 job masteries at `100_000`, the current job to be one of those prerequisites, actual character level `100`, and 30 `v2_storm_origin_fragment`.
- Consume the 30 fragments exactly once, in the same transaction as the class change and `jobHistory` update.
- A target ID already present in `proficiency.v2.jobHistory` is permanently unlocked and skips tier-7 prerequisite and material checks; ordinary advancement-level rules still apply.
- Do not add the four jobs to `V2_JOB_CATALOG`, the codex total, selectable skill pools, or the legacy class/spec bridge in production.
- Do not invent cultivation profiles, job bonuses, feature flags, quests, animations, or a separate endpoint.
- Existing tier 0–6 advancement behavior and public API shapes remain backward-compatible apart from optional tier-7 view data and new error codes.
- New and modified panels use `SURFACE_CARD` or `SURFACE_INSET`; do not introduce translucent content surfaces or container-wide disabled opacity.
- Follow `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`: keep the existing `POST` Route Handler on native `Request` and `Response.json`; no caching configuration applies.
- Repository instructions prohibit subagents unless the user explicitly requests them; execute inline by default.
- Do not deploy or change maintenance mode.

---

## File Structure

- Create `src/adventure/data/v2/tier7Jobs.ts`: shared tier-7 IDs, names, and two-job prerequisite mappings.
- Create `src/adventure/data/v2/tier7Advancement.ts`: constants, policy records, status types, pure evaluation, safe material counting, and one-time material deduction.
- Create `src/adventure/data/v2/tier7Advancement.test.ts`: boundary tests for mastery, current job, actual level, fragments, permanent unlock, and deduction.
- Modify `src/adventure/data/v2/tier7SkillMechanics.ts`: import and re-export shared job identity metadata instead of owning duplicate prerequisites.
- Modify `src/adventure/data/v2/v2JobCatalog.ts`: extend the job tier type to 7 without adding tier-7 catalog entries.
- Create `src/lib/server/tier7AdvanceClassRoute.test.ts`: transaction-capable route harness with test-only catalog injection, rollback, concurrency, repeat visit, and public-boundary tests.
- Modify `src/app/api/v2/me/advance-class/route.ts`: evaluate the policy, bypass first-unlock checks only for permanent history, deduct fragments atomically, and return precise errors.
- Modify `src/app/api/v2/me/state/stateSections.ts`: include optional tier-7 progress data in future tier-7 job entries.
- Modify `src/app/api/v2/me/state/stateSections.test.ts`: verify serialized progress and permanent-unlock views using the pure row builder boundary.
- Modify `src/adventure/v2/jobExplorer.ts` and `src/adventure/v2/jobExplorer.test.ts`: make action availability understand first unlock versus permanent unlock.
- Create `src/adventure/v2/Tier7AdvancementRequirements.tsx` and `.test.tsx`: reusable opaque requirement list and first-unlock confirmation copy.
- Modify `src/adventure/v2/V2JobLadder.tsx` and `.test.tsx`: carry tier-7 status into pending confirmation, show error copy, and render the consumption notice.
- Modify `src/adventure/v2/JobRoadmapDialog.tsx` and `.test.tsx`: show the five progress rows or a permanent-unlock badge in job details.
- Modify `src/adventure/v2/jobRoadmapModel.ts` and `.test.ts`: preserve both tier-7 prerequisite IDs on hybrid roadmap nodes.
- Modify `src/adventure/data/v2/v2JobCatalog.test.ts` and `src/adventure/data/v2/v2SkillsByJob.test.ts`: enforce the unreleased boundary.

---

### Task 1: Shared tier-7 metadata and pure advancement policy

**Files:**
- Create: `src/adventure/data/v2/tier7Jobs.ts`
- Create: `src/adventure/data/v2/tier7Advancement.ts`
- Create: `src/adventure/data/v2/tier7Advancement.test.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.ts:1-19`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts:65-78`

**Interfaces:**
- Produces: `Tier7CombatJobId`, `TIER7_COMBAT_JOB_IDS`, `TIER7_COMBAT_JOB_NAMES`, `TIER7_COMBAT_JOB_PREREQS`.
- Produces: `TIER7_PREREQUISITE_MASTERY = 100_000`, `TIER7_FIRST_UNLOCK_LEVEL = 100`, `TIER7_FIRST_UNLOCK_MATERIAL_ID`, and `TIER7_FIRST_UNLOCK_MATERIAL_COST = 30`.
- Produces: `tier7AdvancementStatus(input): Tier7AdvancementStatus | null` and `spendTier7FirstUnlockMaterial(materials, status): Record<string, number>`.
- Consumes: `STORM_ORIGIN_FRAGMENT_MATERIAL_ID` from `stormExpeditionRewards.ts`.

- [ ] **Step 1: Write the failing metadata and policy tests**

```ts
import { describe, expect, it } from "vitest";
import {
  TIER7_FIRST_UNLOCK_MATERIAL_COST,
  TIER7_PREREQUISITE_MASTERY,
  spendTier7FirstUnlockMaterial,
  tier7AdvancementStatus,
} from "./tier7Advancement";

const ready = {
  targetJobId: "shadowblade",
  currentJobId: "swordsaint",
  currentLevel: 100,
  jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
  jobHistory: [] as string[],
  materials: { v2_storm_origin_fragment: 30 },
};

describe("tier 7 advancement", () => {
  it("declares the approved first-unlock price", () => {
    expect(TIER7_PREREQUISITE_MASTERY).toBe(100_000);
    expect(TIER7_FIRST_UNLOCK_MATERIAL_COST).toBe(30);
  });

  it.each([
    [99_999, 100_000],
    [150_000, 50_000],
  ])("requires each prerequisite independently", (swordsaint, blackmoon) => {
    const status = tier7AdvancementStatus({
      ...ready,
      jobCumLevel: { swordsaint, blackmoon },
    });
    expect(status?.firstUnlockReady).toBe(false);
    expect(status?.failure).toBe("tier7_prerequisite_proficiency");
  });

  it("requires a prerequisite as the current job and actual level 100", () => {
    expect(
      tier7AdvancementStatus({ ...ready, currentJobId: "warrior" })?.failure,
    ).toBe("tier7_current_job");
    expect(
      tier7AdvancementStatus({ ...ready, currentLevel: 99 })?.failure,
    ).toBe("level_too_low");
  });

  it("requires 30 fragments and spends exactly 30", () => {
    expect(
      tier7AdvancementStatus({
        ...ready,
        materials: { v2_storm_origin_fragment: 29 },
      })?.failure,
    ).toBe("tier7_material_shortage");
    const status = tier7AdvancementStatus({
      ...ready,
      materials: { v2_storm_origin_fragment: 35, other: 2 },
    });
    expect(status?.firstUnlockReady).toBe(true);
    expect(
      spendTier7FirstUnlockMaterial(
        { v2_storm_origin_fragment: 35, other: 2 },
        status!,
      ),
    ).toEqual({ v2_storm_origin_fragment: 5, other: 2 });
  });

  it("treats job history as permanent unlock", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      currentJobId: "warrior",
      currentLevel: 1,
      jobCumLevel: {},
      jobHistory: ["shadowblade"],
      materials: {},
    });
    expect(status?.permanentlyUnlocked).toBe(true);
    expect(status?.failure).toBeNull();
  });
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run: `npx vitest run src/adventure/data/v2/tier7Advancement.test.ts`

Expected: FAIL because `tier7Advancement.ts` does not exist.

- [ ] **Step 3: Move shared identity metadata into `tier7Jobs.ts`**

```ts
export const TIER7_COMBAT_JOB_IDS = [
  "shadowblade",
  "ruinblade",
  "skyascendant",
  "primordialsage",
] as const;

export type Tier7CombatJobId = (typeof TIER7_COMBAT_JOB_IDS)[number];

export const TIER7_COMBAT_JOB_NAMES: Record<Tier7CombatJobId, string> = {
  shadowblade: "무영검신",
  ruinblade: "멸검제",
  skyascendant: "비천무신",
  primordialsage: "태초현자",
};

export const TIER7_COMBAT_JOB_PREREQS: Record<
  Tier7CombatJobId,
  readonly [string, string]
> = {
  shadowblade: ["swordsaint", "blackmoon"],
  ruinblade: ["swordsaint", "hegemon"],
  skyascendant: ["heavenlybow", "celestialdragon"],
  primordialsage: ["archmage", "primordialmage"],
};

export function isTier7CombatJobId(value: string): value is Tier7CombatJobId {
  return (TIER7_COMBAT_JOB_IDS as readonly string[]).includes(value);
}
```

Import these values into `tier7SkillMechanics.ts` and re-export them there so current imports remain source-compatible.

- [ ] **Step 4: Implement the pure advancement contract**

```ts
import { STORM_ORIGIN_FRAGMENT_MATERIAL_ID } from "./stormExpeditionRewards";
import {
  TIER7_COMBAT_JOB_IDS,
  TIER7_COMBAT_JOB_PREREQS,
  type Tier7CombatJobId,
} from "./tier7Jobs";

export const TIER7_PREREQUISITE_MASTERY = 100_000;
export const TIER7_FIRST_UNLOCK_LEVEL = 100;
export const TIER7_FIRST_UNLOCK_MATERIAL_ID =
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID;
export const TIER7_FIRST_UNLOCK_MATERIAL_COST = 30;

export type Tier7AdvancementFailure =
  | "tier7_prerequisite_proficiency"
  | "tier7_current_job"
  | "level_too_low"
  | "tier7_material_shortage";

export type Tier7AdvancementStatus = {
  jobId: Tier7CombatJobId;
  permanentlyUnlocked: boolean;
  prerequisiteProgress: readonly [
    { jobId: string; current: number; required: number; met: boolean },
    { jobId: string; current: number; required: number; met: boolean },
  ];
  currentJob: { current: string; allowed: readonly [string, string]; met: boolean };
  level: { current: number; required: 100; met: boolean };
  material: { id: string; current: number; required: 30; met: boolean };
  nonLevelRequirementsMet: boolean;
  firstUnlockReady: boolean;
  failure: Tier7AdvancementFailure | null;
};

export function tier7AdvancementStatus(input: {
  targetJobId: string;
  currentJobId: string;
  currentLevel: number;
  jobCumLevel: Readonly<Record<string, number>>;
  jobHistory: readonly string[];
  materials: unknown;
}): Tier7AdvancementStatus | null;

export function spendTier7FirstUnlockMaterial(
  materials: unknown,
  status: Tier7AdvancementStatus,
): Record<string, number>;
```

The evaluator must clamp every number to a non-negative integer, evaluate both prerequisites separately, use the failure priority mastery → current job → level → material, and return `failure: null` immediately for permanent history. The spending helper must throw unless this is a non-permanent ready first unlock, preserve unrelated positive material balances, subtract exactly 30, and delete the fragment key when the remainder is zero.

- [ ] **Step 5: Extend the tier type without publishing a job**

Change `V2JobDefinition["tier"]` to `0 | 1 | 2 | 3 | 4 | 5 | 6 | 7`. Do not add any catalog or bridge rows.

- [ ] **Step 6: Run policy and existing package tests**

Run: `npx vitest run src/adventure/data/v2/tier7Advancement.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2JobCatalog.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the domain contract**

```bash
git add src/adventure/data/v2/tier7Jobs.ts src/adventure/data/v2/tier7Advancement.ts src/adventure/data/v2/tier7Advancement.test.ts src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/v2JobCatalog.ts
git commit -m "feat: add tier 7 advancement policy"
```

---

### Task 2: Atomic first unlock in the advancement Route Handler

**Files:**
- Create: `src/lib/server/tier7AdvanceClassRoute.test.ts`
- Modify: `src/app/api/v2/me/advance-class/route.ts:55-285`

**Interfaces:**
- Consumes: `tier7AdvancementStatus` and `spendTier7FirstUnlockMaterial` from Task 1.
- Produces: `tier7_prerequisite_proficiency`, `tier7_current_job`, and `tier7_material_shortage` Route Handler responses.
- Preserves: native `POST(req: Request)` and `Response.json` behavior.

- [ ] **Step 1: Build a transaction-capable failing route test harness**

Create a dedicated test file whose mocked transaction copies the global save map into a transaction-local map, commits only when the callback resolves, restores nothing on rejection, and serializes callbacks through a promise mutex. Make `lockSaveForUpdate` and `upsertSave` read and write the transaction-local map. Add a `failUpsertKey` hook that throws before committing a named save.

Inject a test-only `shadowblade` definition and legacy bridge in `beforeEach`, then delete both in `afterEach`:

```ts
V2_JOB_CATALOG.shadowblade = {
  id: "shadowblade",
  name: "무영검신",
  tier: 7,
  cultivateProfile: { luk: 1 },
  jobBonus: { luk: 1 },
  unlock: {
    prereqs: { swordsaint: 100_000, blackmoon: 100_000 },
  },
};
LEGACY_CLASS_SPEC_BY_JOB.shadowblade = {
  class: "rogue",
  spec: "shadowblade",
};
```

This injection exists only in the isolated test module and must not mutate production catalog source.

- [ ] **Step 2: Add failing first-unlock and validation tests**

```ts
it("consumes 30 fragments and records the first unlock", async () => {
  seedCandidate({ fragments: 35 });
  const response = await POST(advanceReq("shadowblade"));
  expect(response.status).toBe(200);
  expect(character()).toMatchObject({
    class: "rogue",
    specChoice: "shadowblade",
    level: 1,
    materials: { v2_storm_origin_fragment: 5 },
  });
  expect(proficiency().jobHistory).toContain("shadowblade");
});

it.each([
  ["mastery", { jobCumLevel: { swordsaint: 100_000, blackmoon: 99_999 } }, "tier7_prerequisite_proficiency", 30],
  ["current job", { currentJobId: "warrior" }, "tier7_current_job", 30],
  ["level", { level: 99 }, "level_too_low", 30],
  ["material", { fragments: 29 }, "tier7_material_shortage", 29],
])("rejects a missing %s requirement", async (_label, override, error, expectedFragments) => {
  seedCandidate(override);
  const response = await POST(advanceReq("shadowblade"));
  expect((await response.json()).error).toBe(error);
  expect(character().materials.v2_storm_origin_fragment).toBe(expectedFragments);
});
```

- [ ] **Step 3: Add failing rollback, concurrency, and revisit tests**

```ts
it("rolls back the fragment debit when a later save fails", async () => {
  seedCandidate({ fragments: 30 });
  failUpsertKey = "skills.v2";
  await expect(POST(advanceReq("shadowblade"))).rejects.toThrow("forced save failure");
  expect(character().materials.v2_storm_origin_fragment).toBe(30);
  expect(character().specChoice).toBe("swordsaint");
  expect(proficiency().jobHistory ?? []).not.toContain("shadowblade");
});

it("serializes duplicate first-unlock requests and charges once", async () => {
  seedCandidate({ fragments: 60 });
  const responses = await Promise.all([
    POST(advanceReq("shadowblade")),
    POST(advanceReq("shadowblade")),
  ]);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
  expect(character().materials.v2_storm_origin_fragment).toBe(30);
});

it("does not charge a permanently unlocked revisit", async () => {
  seedCandidate({
    currentJobId: "warrior",
    level: 100,
    fragments: 0,
    jobCumLevel: {},
    jobHistory: ["shadowblade"],
  });
  const response = await POST(advanceReq("shadowblade"));
  expect(response.status).toBe(200);
  expect(character().materials.v2_storm_origin_fragment).toBeUndefined();
});
```

Also assert that a direct production request for `shadowblade` without test injection remains `400 bad_target` in the existing route suite.

- [ ] **Step 4: Run the route tests to verify they fail**

Run: `npx vitest run src/lib/server/tier7AdvanceClassRoute.test.ts src/lib/server/advanceClassRoute.test.ts`

Expected: FAIL because the Route Handler does not evaluate or spend the tier-7 policy.

- [ ] **Step 5: Wire the policy into the existing transaction**

Extend `CharSaveShape.materials` to `unknown`. After resolving `jobDef`, current job, and the normal current-job level gate, calculate:

```ts
const tier7Status = tier7AdvancementStatus({
  targetJobId,
  currentJobId,
  currentLevel: lvl,
  jobCumLevel: prof.jobCumLevel ?? {},
  jobHistory: prof.jobHistory ?? [],
  materials: charSave.materials,
});
const tier7PreviouslyUnlocked = tier7Status?.permanentlyUnlocked === true;
```

Allow `tier7PreviouslyUnlocked` to bypass `isJobUnlocked`; do not extend that bypass to tier 0–6. For a non-permanent tier-7 target, map `tier7Status.failure` to these bodies before any save:

```ts
{ ok: false, error: "tier7_prerequisite_proficiency" }
{ ok: false, error: "tier7_current_job" }
{ ok: false, error: "level_too_low", required: 100, have: lvl }
{ ok: false, error: "tier7_material_shortage", required: 30, have: status.material.current }
```

When ready, compute `nextMaterials = spendTier7FirstUnlockMaterial(charSave.materials, tier7Status)` and include it in the same `character.v2` upsert that writes the new class/spec and level reset. Permanent visits and every tier 0–6 target must preserve `charSave.materials` byte-for-byte.

- [ ] **Step 6: Run route and policy tests**

Run: `npx vitest run src/lib/server/tier7AdvanceClassRoute.test.ts src/lib/server/advanceClassRoute.test.ts src/adventure/data/v2/tier7Advancement.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the atomic server behavior**

```bash
git add src/app/api/v2/me/advance-class/route.ts src/lib/server/tier7AdvanceClassRoute.test.ts
git commit -m "feat: enforce tier 7 first unlock"
```

---

### Task 3: Serialize tier-7 progress and resolve advancement actions

**Files:**
- Modify: `src/app/api/v2/me/state/stateSections.ts:164-245`
- Modify: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/adventure/v2/jobExplorer.ts:15-70`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/V2JobLadder.tsx:28-90`
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx:34-58`

**Interfaces:**
- Consumes: `Tier7AdvancementStatus` from Task 1.
- Produces: optional `tier7Advancement?: Tier7AdvancementStatus` on `JobLadderEntry` and `JobRoadmapPlayerJob`.
- Produces: `resolveJobAdvanceAction` behavior that distinguishes first unlock from permanent revisit.

- [ ] **Step 1: Add failing state serialization tests**

Export a focused row helper from `stateSections.ts`:

```ts
export function tier7AdvancementViewForJob(args: {
  jobId: string;
  currentJobId: string;
  level: number;
  proficiency: V2ProficiencyState;
  materials: unknown;
}): Tier7AdvancementStatus | null;
```

Test a 99,999/100,000 candidate, a ready 100,000/100,000 candidate with 30 fragments, and a history-unlocked candidate with no fragments. Assert all progress objects contain current and required values and permanent history returns `permanentlyUnlocked: true`.

- [ ] **Step 2: Add failing action-resolution tests**

Create both fixtures with the real evaluator so they cannot drift from the domain contract:

```ts
const incompleteStatus = tier7AdvancementStatus({
  targetJobId: "shadowblade",
  currentJobId: "swordsaint",
  currentLevel: 100,
  jobCumLevel: { swordsaint: 100_000, blackmoon: 99_999 },
  jobHistory: [],
  materials: { v2_storm_origin_fragment: 30 },
})!;
const permanentStatus = tier7AdvancementStatus({
  targetJobId: "shadowblade",
  currentJobId: "warrior",
  currentLevel: 100,
  jobCumLevel: {},
  jobHistory: ["shadowblade"],
  materials: {},
})!;

it("blocks an incomplete tier-7 first unlock", () => {
  expect(resolveJobAdvanceAction({
    job: {
      id: "shadowblade",
      name: "무영검신",
      unlocked: true,
      tier7Advancement: incompleteStatus,
    },
    currentJobId: "swordsaint",
    atLevelCap: true,
    currentJobSelectable: true,
  })).toMatchObject({ enabled: false, label: "조건 부족" });
});

it("uses ordinary rejob availability after permanent unlock", () => {
  expect(resolveJobAdvanceAction({
    job: {
      id: "shadowblade",
      name: "무영검신",
      unlocked: true,
      tier7Advancement: permanentStatus,
    },
    currentJobId: "warrior",
    atLevelCap: true,
    currentJobSelectable: false,
  })).toMatchObject({ enabled: true, label: "전직" });
});
```

- [ ] **Step 3: Run state and action tests to verify they fail**

Run: `npx vitest run src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/jobExplorer.test.ts`

Expected: FAIL because the view and action interfaces lack tier-7 data.

- [ ] **Step 4: Serialize policy progress from authoritative state**

Implement `tier7AdvancementViewForJob` as a thin call to `tier7AdvancementStatus`. In `jobsV2Section`, calculate it from the current character level, parsed proficiency, and `charSave.materials` for each row.

For future tier-7 rows, set `unlocked` to true when either:

```ts
tier7Advancement.permanentlyUnlocked ||
tier7Advancement.nonLevelRequirementsMet
```

This preserves the existing separation where the job can be unlocked but the current character still needs Lv.100. Keep the full status on the row so a revisited prerequisite at Lv.1 cannot use the ordinary expedited flag to bypass the first-unlock actual-level requirement.

- [ ] **Step 5: Extend the action resolver and shared row types**

Add the optional status field to the two UI job types and `JobExplorerJob`. In `resolveJobAdvanceAction`:

- a non-permanent tier-7 target is enabled only when `firstUnlockReady` is true;
- if only its actual level requirement is missing, label it `Lv 100 필요`;
- any mastery, current-job, or material failure uses `조건 부족`;
- a permanent tier-7 target follows the current `atLevelCap/currentJobSelectable` branch unchanged;
- tier 0–6 rows follow the current branch unchanged.

- [ ] **Step 6: Run state, action, and existing ladder tests**

Run: `npx vitest run src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/JobRoadmapDialog.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the state contract**

```bash
git add src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/jobExplorer.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/V2JobLadder.tsx src/adventure/v2/JobRoadmapDialog.tsx
git commit -m "feat: expose tier 7 unlock progress"
```

---

### Task 4: Requirement details, confirmation copy, and server errors

**Files:**
- Create: `src/adventure/v2/Tier7AdvancementRequirements.tsx`
- Create: `src/adventure/v2/Tier7AdvancementRequirements.test.tsx`
- Modify: `src/adventure/v2/V2JobLadder.tsx:85-215,350-405`
- Modify: `src/adventure/v2/V2JobLadder.test.tsx`
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx:180-305`
- Modify: `src/adventure/v2/JobRoadmapDialog.test.tsx`

**Interfaces:**
- Consumes: serialized `Tier7AdvancementStatus` from Task 3.
- Produces: `Tier7AdvancementRequirements({ status, compact? })` and `Tier7FirstUnlockNotice({ status })`.
- Produces: Korean messages for three new Route Handler errors.

- [ ] **Step 1: Write failing presentation tests**

Build the fixtures with `tier7AdvancementStatus`: `candidateStatus` uses 검성 숙련도 99,999 and 29 fragments, `readyStatus` uses both masteries at 100,000 and 30 fragments, and `permanentStatus` adds `shadowblade` to `jobHistory`. Assert each result is non-null before rendering.

```tsx
it("shows all five first-unlock requirements", () => {
  const html = renderToStaticMarkup(
    <Tier7AdvancementRequirements status={candidateStatus} />,
  );
  expect(html).toContain("검성 숙련도");
  expect(html).toContain("99,999 / 100,000");
  expect(html).toContain("흑월 숙련도");
  expect(html).toContain("현재 직업");
  expect(html).toContain("현재 레벨");
  expect(html).toContain("폭풍 기원의 파편");
  expect(html).toContain("29 / 30");
});

it("replaces first-unlock progress with a permanent badge", () => {
  const html = renderToStaticMarkup(
    <Tier7AdvancementRequirements status={permanentStatus} />,
  );
  expect(html).toContain("영구 해금");
  expect(html).not.toContain("폭풍 기원의 파편");
});

it("warns that the first confirmation consumes 30 fragments once", () => {
  const html = renderToStaticMarkup(
    <Tier7FirstUnlockNotice status={readyStatus} />,
  );
  expect(html).toContain("폭풍 기원의 파편 30개");
  expect(html).toContain("최초 전직에만");
  expect(html).toContain("Lv.1");
  expect(html).toContain("숙련도와 배운 스킬은 유지");
});
```

- [ ] **Step 2: Run the new component test to verify it fails**

Run: `npx vitest run src/adventure/v2/Tier7AdvancementRequirements.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the opaque requirement components**

Use `SURFACE_INSET` for the requirement list. Render each row with semantic `<dl>` markup, tabular numbers, a green met state, and an amber unmet state. Do not apply `opacity-*` to the container. Use the names from `TIER7_COMBAT_JOB_NAMES` or `V2_JOB_CATALOG` prerequisite names; never expose raw IDs.

- [ ] **Step 4: Put tier-7 progress in roadmap details**

Below the existing unlock-condition summary in `JobRoadmapDetails`, render `Tier7AdvancementRequirements` when the optional status exists. Preserve current details for every other job. The permanent badge remains visible even if ordinary rejob level is not yet met.

- [ ] **Step 5: Carry status into pending confirmation**

Change `Pending` to include the selected row's optional status and make `pickJob` receive the full row. In the existing confirmation modal, render `Tier7FirstUnlockNotice` only when the target has a non-permanent ready status. Keep the current generic level-reset paragraph for permanent visits and tier 0–6 jobs.

Map errors in `confirmReJob` exactly:

```ts
tier7_prerequisite_proficiency: "두 선행 6차 숙련도가 각각 100,000 필요해요"
tier7_current_job: "선행 6차 직업으로 Lv.100을 달성한 뒤 전직할 수 있어요"
tier7_material_shortage: `폭풍 기원의 파편 ${required ?? 30}개가 필요해요`
```

Keep the modal open after failure. On success, keep the existing `onChanged()` refresh so character, material, proficiency, and roadmap data are reloaded from the server.

- [ ] **Step 6: Add roadmap and confirmation regressions**

Add static rendering tests that a candidate roadmap row shows all progress, a permanent row shows `영구 해금`, and the first-unlock notice is absent for permanent history. Add a small exported `advanceClassErrorLabel` pure helper if testing the fetch path would require a browser environment, and test all old and new error mappings directly.

- [ ] **Step 7: Run UI tests and lint the touched components**

Run: `npx vitest run src/adventure/v2/Tier7AdvancementRequirements.test.tsx src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/jobExplorer.test.ts`

Run: `npx eslint src/adventure/v2/Tier7AdvancementRequirements.tsx src/adventure/v2/Tier7AdvancementRequirements.test.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/jobExplorer.ts src/adventure/v2/jobExplorer.test.ts`

Expected: PASS with no lint errors.

- [ ] **Step 8: Commit the tier-7 advancement UI**

```bash
git add src/adventure/v2/Tier7AdvancementRequirements.tsx src/adventure/v2/Tier7AdvancementRequirements.test.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/jobExplorer.ts src/adventure/v2/jobExplorer.test.ts
git commit -m "feat: show tier 7 unlock requirements"
```

---

### Task 5: Hybrid roadmap metadata and unreleased boundary

**Files:**
- Modify: `src/adventure/v2/jobRoadmapModel.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`

**Interfaces:**
- Produces: `JobRoadmapNode.prerequisiteJobIds: string[]` while retaining the existing primary-parent tree placement.
- Verifies: all four tier-7 IDs remain absent from production-selectable surfaces.

- [ ] **Step 1: Add a failing hybrid metadata test**

Extract `buildJobRoadmapFromJobs(jobs)` and keep `buildJobRoadmap()` as the production wrapper over `V2_JOB_LIST`. Pass a supplied list containing synthetic `swordsaint`, `blackmoon`, and tier-7 `shadowblade` definitions, then assert:

```ts
expect(node).toMatchObject({
  id: "shadowblade",
  tier: 7,
  hybrid: true,
  prerequisiteJobIds: ["swordsaint", "blackmoon"],
});
expect(node?.prereqText).toContain("검성 숙련도 100000");
expect(node?.prereqText).toContain("흑월 숙련도 100000");
```

The existing tree stays nested under the first prerequisite for layout compatibility; `prerequisiteJobIds` and the detail requirement list preserve the second incoming lineage explicitly.

- [ ] **Step 2: Add failing production-boundary assertions**

```ts
for (const jobId of TIER7_COMBAT_JOB_IDS) {
  expect(V2_JOB_CATALOG[jobId]).toBeUndefined();
  expect(V2_JOB_LIST.some((job) => job.id === jobId)).toBe(false);
  expect(LEGACY_CLASS_SPEC_BY_JOB[jobId]).toBeUndefined();
}
```

Retain the existing assertion that no tier-7 package skill appears in the selectable skill pool. Also assert `buildJobCodex(...).jobs` and `unlockedJobs(...)` contain none of the four IDs.

- [ ] **Step 3: Run the roadmap and boundary tests to verify the new metadata test fails**

Run: `npx vitest run src/adventure/v2/jobRoadmapModel.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts`

Expected: FAIL only on the missing `prerequisiteJobIds`/builder interface; the production boundary must already pass.

- [ ] **Step 4: Implement the injectable roadmap builder**

Move the existing tree-building body into `buildJobRoadmapFromJobs(jobs)`, build both its ID/name lookup and order map from the supplied list, and include every prerequisite returned by the current `prerequisiteJobIds(job)` helper in each node. The injectable builder must resolve prerequisite display names from that supplied lookup, not the global catalog. Keep `buildJobRoadmap()` behavior and current production output unchanged.

- [ ] **Step 5: Run the complete focused suite**

Run:

```bash
npx vitest run \
  src/adventure/data/v2/tier7Advancement.test.ts \
  src/adventure/data/v2/tier7SkillMechanics.test.ts \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts \
  src/lib/server/tier7AdvanceClassRoute.test.ts \
  src/lib/server/advanceClassRoute.test.ts \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/adventure/v2/jobExplorer.test.ts \
  src/adventure/v2/jobRoadmapModel.test.ts \
  src/adventure/v2/Tier7AdvancementRequirements.test.tsx \
  src/adventure/v2/V2JobLadder.test.tsx \
  src/adventure/v2/JobRoadmapDialog.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 6: Run repository verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/tier7Jobs.ts src/adventure/data/v2/tier7Advancement.ts src/adventure/data/v2/tier7Advancement.test.ts src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/v2JobCatalog.ts src/app/api/v2/me/advance-class/route.ts src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts src/lib/server/tier7AdvanceClassRoute.test.ts src/adventure/v2/jobExplorer.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/Tier7AdvancementRequirements.tsx src/adventure/v2/Tier7AdvancementRequirements.test.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/JobRoadmapDialog.test.tsx`

Run: `npm run build`

Expected: all commands exit 0. `prebuild` must report no missing image references; existing orphan warnings are informational unless the repository is already configured as strict.

- [ ] **Step 7: Confirm scope and commit the final guard**

Run: `git diff --check`

Run: `git status --short`

Inspect `git diff --name-only HEAD~4..HEAD` and confirm there is no migration, dependency, image, job bonus, cultivation profile, deployment, maintenance, or production tier-7 catalog entry.

```bash
git add src/adventure/v2/jobRoadmapModel.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
git commit -m "test: guard unreleased tier 7 jobs"
```
