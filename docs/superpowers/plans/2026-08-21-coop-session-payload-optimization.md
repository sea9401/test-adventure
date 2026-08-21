# Coop Session Payload Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove full replay JSON from the five-second cooperative session poll while preserving navigation to the existing on-demand attack-log screen.

**Architecture:** The session route maps database rows to a replay-free attack summary through a pure server helper. The cooperative detail view treats every returned attack ID as an available persisted log and navigates to the existing attack-detail route, which remains the only full-replay reader.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19, TypeScript, Drizzle ORM, Vitest, Testing Library

## Global Constraints

- Preserve cooperative combat, rewards, access control, claim rules, and the five-second polling cadence.
- Do not add authenticated response caching or expose replay payloads through the session endpoint.
- Do not deploy, mutate production data, or change maintenance mode.
- Follow test-first red-green-refactor for behavior changes.

---

### Task 1: Replay-free session attack summaries

**Files:**
- Create: `src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.ts`
- Create: `src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts`

**Interfaces:**
- Consumes: a recent attack row with `id`, `userId`, `name`, damage fields, `diedEarly`, and `createdAt`, plus viewer/avatar/cosmetic presentation values.
- Produces: `toCoopSessionAttackSummary(input)` returning the existing recent-attack fields without `log` or `replay`.

- [ ] **Step 1: Write the failing summary-contract test**

```ts
it("returns a lightweight attack summary without replay data", () => {
  const summary = toCoopSessionAttackSummary({
    attack: {
      id: 7,
      userId: "attacker",
      name: "모험가",
      damageDealt: 123,
      damageTaken: 45,
      diedEarly: false,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    },
    viewerUserId: "viewer",
    avatar: "male1",
    profileBorder: null,
  });

  expect(summary).toEqual({
    id: 7,
    name: "모험가",
    damageDealt: 123,
    damageTaken: 45,
    diedEarly: false,
    isMe: false,
    avatar: "male1",
    profileBorder: null,
    at: Date.parse("2026-08-21T00:00:00.000Z"),
  });
  expect(summary).not.toHaveProperty("replay");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run 'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.test.ts'`

Expected: FAIL because `coopSessionAttackSummary.ts` does not exist.

- [ ] **Step 3: Implement the pure mapper and use it in the session route**

Create an explicitly typed mapper whose return type contains only the lightweight
summary. Remove `ReplayPayload`, `parseReplayPayload`, and `log` from the session
route's recent-attack select, then map rows through the helper.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run 'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.test.ts'`

Expected: PASS with one test and no warnings.

- [ ] **Step 5: Commit the server change**

```bash
git add 'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.ts' \
  'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.test.ts' \
  'src/app/api/v2/coop/[sessionId]/route.ts'
git commit -m "perf: remove replays from cooperative session polling"
```

### Task 2: Replay-independent attack-log navigation

**Files:**
- Create: `src/adventure/v2/coop/CoopRecentAttackList.test.tsx`
- Create: `src/adventure/v2/coop/CoopRecentAttackList.tsx`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`

**Interfaces:**
- Consumes: `attacks: readonly CoopRecentAttack[]` and
  `onOpenAttackLog(attackId: number): void`.
- Produces: `CoopRecentAttackList`, which renders every persisted summary as an
  enabled attack-log navigation button.

- [ ] **Step 1: Write the failing user-behavior test**

```tsx
it("opens a persisted attack log without embedded replay data", () => {
  const onOpenAttackLog = vi.fn();
  render(<CoopRecentAttackList attacks={[attack]} onOpenAttackLog={onOpenAttackLog} />);

  fireEvent.click(screen.getByRole("button", { name: /모험가/ }));

  expect(onOpenAttackLog).toHaveBeenCalledWith(17);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/adventure/v2/coop/CoopRecentAttackList.test.tsx`

Expected: FAIL because `CoopRecentAttackList.tsx` does not exist.

- [ ] **Step 3: Extract the real attack-list component and remove replay from the client summary type**

Remove `replay` from `CoopRecentAttack`. Move the existing recent-attack markup
into `CoopRecentAttackList`, remove the replay-based disabled state, navigate
with `attack.id`, and always show the film icon. The parent renders the extracted
component only when the list is non-empty. Do not fetch a replay from the polling
hook.

- [ ] **Step 4: Run cooperative focused tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/coop/CoopRecentAttackList.test.tsx 'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.test.ts' 'src/app/api/v2/coop/[sessionId]/attacks/[attackId]/route.test.ts'`

Expected: all focused tests PASS with no warnings.

- [ ] **Step 5: Run phase verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/coop/useCoopBossState.ts src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/v2/coop/CoopRecentAttackList.tsx 'src/app/api/v2/coop/[sessionId]/route.ts' 'src/app/api/v2/coop/[sessionId]/coopSessionAttackSummary.ts'`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 6: Commit the client change**

```bash
git add src/adventure/v2/coop/CoopRecentAttackList.tsx \
  src/adventure/v2/coop/CoopRecentAttackList.test.tsx \
  src/adventure/v2/coop/useCoopBossState.ts \
  src/adventure/v2/coop/V2CoopBossDetailView.tsx
git commit -m "fix: keep cooperative attack logs available on demand"
```
