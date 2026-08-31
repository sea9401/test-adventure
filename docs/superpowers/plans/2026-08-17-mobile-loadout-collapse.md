# Mobile Loadout Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the initial mobile height of the equipped combat skill section while preserving its 44px touch targets and existing editing behavior.

**Architecture:** Keep the behavior local to `V2LoadoutPanel` with a boolean disclosure state initialized to closed. CSS breakpoint classes hide the equipped-skill body only on mobile and force it visible from `sm` upward, so no viewport-reading effect or persisted state is needed.

**Tech Stack:** Next.js 16 client component, React 19 state, Tailwind CSS responsive utilities, Vitest server-rendered markup assertions

## Global Constraints

- Mobile touch targets remain at least 44px.
- Scene background images must not show through content surfaces; retain `SURFACE_INSET`.
- Do not change lifestyle passive behavior, combat ordering, drag handling, or server data flow.
- Do not deploy.

---

### Task 1: Add the mobile equipped-skill disclosure

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx:840-955`
- Test: `src/adventure/v2/V2LoadoutPanel.test.tsx:330-370`

**Interfaces:**
- Consumes: existing `combatEquippedSkills`, `clearCombatSkills`, `busy`, and equipped-skill chip rendering
- Produces: local `combatEquippedOpen: boolean` state and an accessible disclosure button controlling `combat-equipped-skills`

- [ ] **Step 1: Write the failing markup regression test**

Add these assertions to the existing lifestyle/equipped-skill rendering test after rendering a combat skill:

```tsx
expect(html).toContain("전투 스킬 1개 장착");
expect(html).toContain('aria-expanded="false"');
expect(html).toContain('aria-controls="combat-equipped-skills"');
expect(html).toContain(">펼쳐보기<");
expect(html).toContain(
  'id="combat-equipped-skills" class="hidden sm:block"',
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx
```

Expected: FAIL because the mobile summary, disclosure attributes, and responsive visibility wrapper do not exist.

- [ ] **Step 3: Implement the minimal disclosure behavior**

Initialize local state near the component's other UI state:

```tsx
const [combatEquippedOpen, setCombatEquippedOpen] = useState(false);
```

In the equipped combat section header, add a mobile count and toggle while retaining `전부 해제`:

```tsx
<span className="sm:hidden">
  {combatEquippedSkills.length}개 장착
</span>
<button
  type="button"
  onClick={() => setCombatEquippedOpen((open) => !open)}
  aria-expanded={combatEquippedOpen}
  aria-controls="combat-equipped-skills"
  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 sm:hidden dark:text-violet-300 dark:hover:bg-violet-900"
>
  {combatEquippedOpen ? "접기" : "펼쳐보기"}
</button>
```

Insert this opening wrapper immediately before the existing `표시 순서대로 전투에서 먼저 사용합니다.` paragraph:

```tsx
<div
  id="combat-equipped-skills"
  className={combatEquippedOpen ? "block" : "hidden sm:block"}
>
```

Insert the matching `</div>` immediately after the existing `combatEquippedSkills.length > 0` chip/empty-state conditional. Do not change the inner drag or toggle handlers.

Use an accessible combined summary such as `전투 스킬 1개 장착` in the mobile-only heading content. Keep the section's `SURFACE_INSET` class unchanged.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx
npx tsc --noEmit
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Review the responsive markup**

Confirm from the rendered classes that:

- mobile starts with the body hidden and the summary/toggle visible;
- `sm` and larger always show the body and hide the toggle;
- the existing `h-11 w-11` drag target remains unchanged;
- `SURFACE_INSET` remains on both equipped sections.

- [ ] **Step 6: Commit only the feature files**

```bash
git add src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx
git commit --only src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx -m "fix: collapse mobile equipped skills"
```
