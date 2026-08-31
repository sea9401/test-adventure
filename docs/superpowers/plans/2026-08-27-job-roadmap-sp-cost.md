# Job Roadmap SP Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this repository.

**Goal:** Show the calculated SP cost for representative skills that the player may inspect in the advancement roadmap.

**Architecture:** The roadmap detail already resolves each representative skill definition. It will calculate `spCostOf(skillDef)` locally and render one explicit chip inside the expanded skill detail, leaving the shared effect-chip component unchanged.

**Tech Stack:** React 19 server rendering tests, existing v2 skill catalog, Vitest, opaque surface tokens.

## Global Constraints

- Use `spCostOf`; do not read raw `spCost` fields or duplicate the pricing formula.
- Preserve the existing inspection gate for locked unvisited jobs.
- Do not change `SkillEffectChips`, because learn and loadout views already have their own SP presentation.
- Do not deploy.

---

### Task 1: SP chip in inspectable roadmap skills

**Files:**
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx`
- Modify: `src/adventure/v2/JobRoadmapDialog.test.tsx`

**Interfaces:**
- Consumes: `spCostOf(V2SkillDefinition): number`.
- Produces: visible text `SP {cost}` inside each expanded representative-skill detail.

- [ ] **Step 1: Write the failing roadmap tests**

Extend the unlocked-job test with calculated costs:

```ts
expect(html).toContain(`SP ${spCostOf(V2_SKILLS.v2c_squire_cleave)}`);
expect(html).toContain(`SP ${spCostOf(V2_SKILLS.v2c_squire_might)}`);
```

Keep the locked-unvisited test and add `expect(html).not.toMatch(/SP \d+/)`.

- [ ] **Step 2: Run the roadmap test and confirm failure**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx`

Expected: FAIL because roadmap details do not show SP.

- [ ] **Step 3: Render the calculated SP chip**

Import `spCostOf` beside `V2_SKILLS`. When `skillDef` exists, render this before `SkillEffectChips`:

```tsx
<span className="mt-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
  SP {spCostOf(skillDef)}
</span>
```

Do not render a fallback SP value when the catalog entry is missing.

- [ ] **Step 4: Run the roadmap tests**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/V2JobLadder.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/JobRoadmapDialog.test.tsx
git commit -m "feat: show SP costs in job roadmap"
```
