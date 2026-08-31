# Tier 7 Four-Job Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish 무영검신, 멸검제, 비천무신, and 태초현자 through the existing catalog, roadmap, advancement, codex, SP, skill, and mastery-content flows without exposing the three unfinished tier-7 jobs.

**Architecture:** Keep `V2_JOB_CATALOG` as the public job-definition boundary and reuse the existing tier-7 advancement transaction for first-unlock requirements and material spending. Add one shared permanent-content predicate so mastery prerequisites alone can reveal an advancement candidate but cannot grant codex unlock, SP, mastery-tower, or certificate access before the first successful tier-7 visit is recorded in `jobHistory`.

**Tech Stack:** TypeScript, Next.js 16 route handlers, React 19, Vitest, ESLint

## Global Constraints

- Publish only `shadowblade`, `ruinblade`, `skyascendant`, and `primordialsage`.
- Tier-7 cultivate profiles total exactly 7 and job bonuses total exactly 48.
- First unlock requires both prerequisite job masteries at 100,000, an allowed current tier-6 job, level 100, and 30 `v2_storm_origin_fragment` materials.
- Only a successful first advancement recorded in `proficiency.v2.jobHistory` grants permanent tier-7 content access and job-SP credit.
- Keep the existing diminishing job-SP formula unchanged; unlocking all four new jobs increases the current maximum by exactly 2 SP.
- Do not add a database migration, backfill, new API, feature flag, quest, or advancement ceremony.
- Do not publish 오행법왕, 혈천마신, or 부동성주.
- Do not deploy without a separate explicit user request.

---

### Task 1: Publish the four catalog definitions and cultivation identities

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`

**Interfaces:**
- Consumes: `TIER7_COMBAT_JOB_IDS`, `TIER7_COMBAT_JOB_NAMES`, `TIER7_COMBAT_JOB_PREREQS`, and `TIER7_PREREQUISITE_MASTERY`.
- Produces: four `V2JobDefinition` entries, four legacy class/spec mappings, and tier-7-aware `effectiveCultivateProfile(group, jobId)` behavior.

- [ ] **Step 1: Replace the unreleased-boundary test with failing public catalog contracts**

Add exact table-driven expectations to `v2JobCatalog.test.ts`:

```ts
const RELEASED_TIER7 = [
  ["shadowblade", "무영검신", { luk: 4, dex: 2, str: 1 }, { luk: 32, dex: 10, str: 6 }, { class: "warrior", spec: "shadowblade" }],
  ["ruinblade", "멸검제", { str: 4, vit: 2, luk: 1 }, { str: 34, vit: 10, luk: 4 }, { class: "warrior", spec: "ruinblade" }],
  ["skyascendant", "비천무신", { dex: 4, str: 2, luk: 1 }, { dex: 32, str: 10, luk: 6 }, { class: "rogue", spec: "skyascendant" }],
  ["primordialsage", "태초현자", { int: 4, spi: 3 }, { int: 32, spi: 16 }, { class: "mage", spec: "primordialsage" }],
] as const;

it.each(RELEASED_TIER7)("publishes %s with its approved tier-7 identity", (id, name, profile, bonus, legacy) => {
  const job = V2_JOB_CATALOG[id];
  expect(job).toMatchObject({ id, name, tier: 7, cultivateProfile: profile, jobBonus: bonus });
  expect(job.unlock.prereqs).toEqual(
    Object.fromEntries(TIER7_COMBAT_JOB_PREREQS[id].map((parent) => [parent, 100_000])),
  );
  expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual(legacy);
  expect(jobIdFromLegacy(legacy.class, legacy.spec)).toBe(id);
  expect(effectiveCultivateProfile(legacy.class, id)).toEqual(profile);
});
```

Also change the tier histogram expectation to `byTier(7) === 4` and assert the complete set of catalog entries with `tier === 7` equals `TIER7_COMBAT_JOB_IDS`. This proves that no unfinished fifth, sixth, or seventh tier-7 job is published.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/adventure/data/v2/v2JobCatalog.test.ts
```

Expected: FAIL because all four tier-7 IDs are absent from `V2_JOB_CATALOG`, legacy mappings are absent, and `byTier(7)` is zero.

- [ ] **Step 3: Add the minimal catalog and compatibility definitions**

Import the shared tier-7 metadata and `TIER7_PREREQUISITE_MASTERY`. Add four tier-7 entries after the tier-6 definitions with the exact approved profiles and bonuses. Each `unlock.prereqs` must use the two shared prerequisite IDs at `TIER7_PREREQUISITE_MASTERY`.

Add these exact compatibility mappings:

```ts
shadowblade: { class: "warrior", spec: "shadowblade" },
ruinblade: { class: "warrior", spec: "ruinblade" },
skyascendant: { class: "rogue", spec: "skyascendant" },
primordialsage: { class: "mage", spec: "primordialsage" },
```

Change the direct catalog-profile branch in `effectiveCultivateProfile` from tier 5/6-only to tiers 5 through 7:

```ts
if (job && job.tier >= 5) return job.cultivateProfile;
```

- [ ] **Step 4: Run focused catalog, proficiency, class, and skill mapping tests**

Run:

```bash
npx vitest run \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/proficiency.test.ts \
  src/adventure/data/v2/classes.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts
```

Expected: PASS. If a generic profile-total test still encodes only tiers 5 and 6, update it to require totals 5, 6, and 7 for those tiers without weakening lower-tier assertions.

- [ ] **Step 5: Commit the catalog publication**

```bash
git add src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.ts
git commit -m "feat: publish four tier 7 jobs"
```

---

### Task 2: Separate advancement eligibility from permanent content access

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCodex.test.ts`
- Modify: `src/adventure/data/v2/v2JobCodex.ts`
- Modify: `src/lib/server/masteryCertificateStatus.test.ts`
- Modify: `src/lib/server/masteryCertificateStatus.ts`
- Modify: `src/app/api/v2/mastery-tower/route.ts`
- Modify: `src/app/api/v2/mastery-tower/use-certificate/route.ts`

**Interfaces:**
- Produces: `isJobContentUnlocked(job, proficiency, ctx?): boolean`.
- Consumers: job SP counting, job codex, mastery certificate status, mastery tower job selection, and mastery certificate application.
- Preserves: `isJobUnlocked` as the non-consuming prerequisite predicate used by the advancement transaction and next-goal displays.

- [ ] **Step 1: Write failing permanent-access and SP tests**

In `v2JobCatalog.test.ts`, build a proficiency with both prerequisite masteries at 100,000 but no tier-7 `jobHistory`. Assert:

```ts
expect(isJobUnlocked(V2_JOB_CATALOG.shadowblade, candidate)).toBe(true);
expect(isJobContentUnlocked(V2_JOB_CATALOG.shadowblade, candidate)).toBe(false);

candidate.jobHistory = ["shadowblade"];
expect(isJobContentUnlocked(V2_JOB_CATALOG.shadowblade, candidate)).toBe(true);
```

Also assert ordinary tier 1–6 jobs preserve current `isJobUnlocked` behavior. Extend the existing “all jobs unlocked” fixture: first leave the four tier-7 IDs out of `jobHistory` and record its SP result, then add all four IDs to `jobHistory` and assert the result increases by exactly 2. The fixture already fills every prerequisite mastery and life-content context, so the first result also proves mastery prerequisites without history add 0 tier-7 SP.

In `v2JobCodex.test.ts`, replace the old “does not publish” test with:

```ts
expect(candidateCodex.jobs.find((job) => job.id === "shadowblade")?.unlocked).toBe(false);
expect(permanentCodex.jobs.find((job) => job.id === "shadowblade")?.unlocked).toBe(true);
```

In `masteryCertificateStatus.test.ts`, assert `shadowblade` is absent for a prerequisite-only candidate and present after adding it to `jobHistory`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/v2JobCodex.test.ts \
  src/lib/server/masteryCertificateStatus.test.ts
```

Expected: FAIL because `isJobContentUnlocked` does not exist and current codex/SP/certificate logic treats prerequisite mastery as full access.

- [ ] **Step 3: Implement the shared permanent-content predicate**

Add to `v2JobCatalog.ts`:

```ts
export function isJobContentUnlocked(
  job: V2JobDefinition,
  proficiency: V2ProficiencyState,
  ctx?: JobUnlockContext,
): boolean {
  if (isTier7CombatJobId(job.id)) {
    return (proficiency.jobHistory ?? []).includes(job.id);
  }
  return isJobUnlocked(job, proficiency, ctx);
}
```

Use it in `unlockedJobCount`. Do not replace the `isJobUnlocked` call in `/api/v2/me/advance-class`; first unlock still needs prerequisite eligibility before it can create the history record.

- [ ] **Step 4: Wire all permanent-content consumers**

Replace `isJobUnlocked` with `isJobContentUnlocked` in:

- `v2JobCodex.ts` for each job's `unlocked` state;
- `masteryCertificateStatus.ts` for offered certificate jobs;
- `mastery-tower/route.ts` for offered tower jobs;
- `mastery-tower/use-certificate/route.ts` for server-authoritative certificate validation.

Keep `stateSections.ts` on its existing `tier7AdvancementStatus` branch so candidates can see the five first-unlock requirements. Keep guild training-ground next-goal logic on `isJobUnlocked`; it reports remaining prerequisite mastery rather than granting tier-7 content.

- [ ] **Step 5: Run permanent-access and route-adjacent tests**

Run:

```bash
npx vitest run \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/v2JobCodex.test.ts \
  src/lib/server/masteryCertificateStatus.test.ts \
  src/app/api/v2/mastery-tower/claim/route.test.ts \
  src/app/api/v2/mastery-tower/attempt/request.test.ts
```

Expected: PASS with no tier-7 content access before first advancement history.

- [ ] **Step 6: Commit the permanent-access boundary**

```bash
git add \
  src/adventure/data/v2/v2JobCatalog.ts \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/v2JobCodex.ts \
  src/adventure/data/v2/v2JobCodex.test.ts \
  src/lib/server/masteryCertificateStatus.ts \
  src/lib/server/masteryCertificateStatus.test.ts \
  src/app/api/v2/mastery-tower/route.ts \
  src/app/api/v2/mastery-tower/use-certificate/route.ts
git commit -m "fix: gate tier 7 content on first unlock"
```

---

### Task 3: Verify roadmap, state serialization, and first-advancement behavior with real catalog jobs

**Files:**
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`
- Modify: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/lib/server/tier7AdvanceClassRoute.test.ts`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/JobRoadmapDialog.test.tsx`
- Modify: `src/adventure/v2/Tier7AdvancementRequirements.test.tsx`

**Interfaces:**
- Consumes: the real four tier-7 catalog definitions and existing `tier7AdvancementStatus` view.
- Verifies: two-parent roadmap nodes, five progress rows, first-unlock action state, exact one-time material spending, and permanent revisit behavior.

- [ ] **Step 1: Convert synthetic/public-boundary tests to real-catalog assertions**

In `jobRoadmapModel.test.ts`, use `buildJobRoadmap()` and assert all four real tier-7 nodes exist exactly once. For `shadowblade`, assert:

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

In `stateSections.test.ts`, exercise a real `shadowblade` row from `jobsV2Section` for candidate, ready, and permanent states. In the advancement route test, remove test-only catalog injection if it is now redundant and prove the production catalog path spends 30 fragments once, writes history, rolls back on failure, and does not spend on revisit.

- [ ] **Step 2: Run the UI/server tests against the real published catalog**

Run:

```bash
npx vitest run \
  src/adventure/v2/jobRoadmapModel.test.ts \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/lib/server/tier7AdvanceClassRoute.test.ts \
  src/adventure/v2/jobExplorer.test.ts \
  src/adventure/v2/JobRoadmapDialog.test.tsx \
  src/adventure/v2/Tier7AdvancementRequirements.test.tsx
```

Expected: PASS. These are coverage conversions after Task 1, not new production behavior; if a test still asserts that the four jobs are hidden, replace only that stale assertion and rerun.

- [ ] **Step 3: Make only fixture/contract adjustments required by public catalog entries**

Do not duplicate tier-7 UI or transaction code. Update tests to consume the real catalog. If no production change is required, leave production files untouched. Preserve the existing error codes and Korean copy.

- [ ] **Step 4: Re-run the focused UI/server tests**

Run:

```bash
npx vitest run \
  src/adventure/v2/jobRoadmapModel.test.ts \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/lib/server/tier7AdvanceClassRoute.test.ts \
  src/adventure/v2/jobExplorer.test.ts \
  src/adventure/v2/JobRoadmapDialog.test.tsx \
  src/adventure/v2/Tier7AdvancementRequirements.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit real-catalog coverage**

```bash
git add \
  src/adventure/v2/jobRoadmapModel.test.ts \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/lib/server/tier7AdvanceClassRoute.test.ts \
  src/adventure/v2/jobExplorer.test.ts \
  src/adventure/v2/JobRoadmapDialog.test.tsx \
  src/adventure/v2/Tier7AdvancementRequirements.test.tsx
git commit -m "test: cover released tier 7 advancement"
```

If only a subset changed, stage only that subset.

---

### Task 4: Run release verification and audit the diff

**Files:**
- Verify only; modify files only if a test reveals a release-scope defect.

**Interfaces:**
- Verifies all spec requirements and the production build contract.

- [ ] **Step 1: Run the complete tier-7 focused suite**

```bash
npx vitest run \
  src/adventure/data/v2/tier7Advancement.test.ts \
  src/adventure/data/v2/tier7SkillMechanics.test.ts \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/v2JobCodex.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts \
  src/adventure/data/v2/proficiency.test.ts \
  src/adventure/v2/jobRoadmapModel.test.ts \
  src/adventure/v2/jobExplorer.test.ts \
  src/adventure/v2/JobRoadmapDialog.test.tsx \
  src/adventure/v2/Tier7AdvancementRequirements.test.tsx \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/lib/server/tier7AdvanceClassRoute.test.ts \
  src/lib/server/masteryCertificateStatus.test.ts \
  src/app/api/v2/mastery-tower/claim/route.test.ts \
  src/app/api/v2/mastery-tower/attempt/request.test.ts
```

Expected: PASS, zero failures.

- [ ] **Step 2: Run static verification**

```bash
npx tsc --noEmit
npx eslint \
  src/adventure/data/v2/v2JobCatalog.ts \
  src/adventure/data/v2/v2JobCatalog.test.ts \
  src/adventure/data/v2/proficiency.ts \
  src/adventure/data/v2/v2JobCodex.ts \
  src/adventure/data/v2/v2JobCodex.test.ts \
  src/lib/server/masteryCertificateStatus.ts \
  src/lib/server/masteryCertificateStatus.test.ts \
  src/app/api/v2/mastery-tower/route.ts \
  src/app/api/v2/mastery-tower/use-certificate/route.ts \
  src/adventure/v2/jobRoadmapModel.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: exit 0, including image checks and Next.js route compilation.

- [ ] **Step 4: Audit scope and clean state**

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Confirm the diff contains only the approved four-job release, permanent-content guards, tests, design, and plan. Confirm there is no migration, deployment workflow change, feature flag, or data mutation.

- [ ] **Step 5: Resolve verification failures through the owning TDD task**

If verification exposes a defect, return to the task that owns that behavior, add or tighten its failing regression test, implement the minimal correction, rerun Task 4 from Step 1, and commit the exact test and implementation files under `fix: finalize tier 7 release guards`. If verification produces no source changes, do not create an empty commit.
