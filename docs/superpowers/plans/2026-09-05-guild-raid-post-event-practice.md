# Guild Raid Post-Event Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep guild raid practice battles playable after the real raid period ends without changing competition state.

**Architecture:** Remove the active-period gate from the existing read-only practice service while retaining the current-week event requirement. Keep real attacks unchanged, enable the existing practice control during settling and claim phases, and synchronize the manual copy.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Vitest, Testing Library, existing read-only guild raid simulation.

## Global Constraints

- Practice must not insert, update, or delete guild raid rows, consume attack counts, alter HP/stage/rank/reward state, or add recent attack logs.
- Real attack availability, settlement, and reward claim rules remain unchanged.
- Practice requires a current guild, a current-week raid event, a valid boss, and a battle-ready character.
- Do not deploy or change maintenance mode.

---

### Task 1: Permit post-event practice in the service

**Files:**
- Modify: `src/lib/server/guildRaidPractice.test.ts`
- Modify: `src/lib/server/guildRaidPractice.ts`

**Interfaces:**
- Consumes: `createGuildRaidPracticeService({ readContext, simulate })`.
- Produces: the existing `GuildRaidPracticeOutcome`; `event_ended` now means the current-week event is absent rather than merely inactive.

- [x] **Step 1: Write failing service tests**

Replace the settled/expired rejection table with explicit cases proving a settled event and an event whose `endsAt` is before `now` both call `simulate` and return `{ ok: true, practice: true }`. Retain a missing-event case that expects `{ ok: false, error: "event_ended" }` and no simulation.

- [x] **Step 2: Run the service test and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidPractice.test.ts`

Expected: the settled and elapsed-time cases fail with `event_ended`.

- [x] **Step 3: Implement the minimal service change**

Change the event gate from checking `status` and `endsAt` to checking only `!context.event`. Keep current guild, boss parsing, character simulation, and response mapping unchanged.

- [x] **Step 4: Run the service test and confirm GREEN**

Run: `npx vitest run src/lib/server/guildRaidPractice.test.ts`

Expected: all service tests pass.

### Task 2: Enable and explain the post-event UI

**Files:**
- Modify: `src/adventure/v2/guild/GuildRaidPanel.test.tsx`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.tsx`

**Interfaces:**
- Consumes: `state.event.phase`, `attacking`, `practicing`, and `onPractice`.
- Produces: an enabled `연습 전투` button during `settling` and `claim`, while the real attack button remains disabled.

- [x] **Step 1: Write failing panel tests**

Change the ended-event test to render a settled claim state, assert the real attack button is disabled, assert the practice button is enabled, click it, and assert `onPractice` is called once. Add an assertion for the post-event availability copy.

- [x] **Step 2: Run the panel test and confirm RED**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: the practice button remains disabled and the new copy is absent.

- [x] **Step 3: Implement the minimal panel change**

Remove `!active` from the practice button's `disabled` expression, retaining mutual exclusion with `attacking`. Update the nearby note to state that practice remains available after the raid ends and never affects attempts, damage, or rewards.

- [x] **Step 4: Run the panel test and confirm GREEN**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: all panel tests pass.

### Task 3: Synchronize documentation and verify

**Files:**
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/app/manual/content/guild.tsx`

**Interfaces:**
- Documents: post-event practice availability and unchanged non-persistence rules.

- [x] **Step 1: Write the failing manual assertion**

Extend the guild manual test to require `토벌전이 끝난 뒤에도` in the rendered content.

- [x] **Step 2: Run the manual test and confirm RED**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: the new phrase is missing.

- [x] **Step 3: Update the manual**

Amend the existing practice bullet to say it remains available after daily attempts are exhausted and after the raid period ends, while retaining the no-consumption and no-record rules.

- [x] **Step 4: Run focused and repository verification**

Run:

```bash
npx vitest run src/lib/server/guildRaidPractice.test.ts src/app/api/v2/guild/raid/practice/route.test.ts src/adventure/v2/guild/GuildRaidPanel.test.tsx src/adventure/v2/guild/useGuildRaid.test.tsx src/app/manual/current-content.test.tsx src/lib/server/guildRaidAttack.test.ts src/app/api/v2/guild/raid/attack/route.test.ts
npx eslint src/lib/server/guildRaidPractice.ts src/lib/server/guildRaidPractice.test.ts src/adventure/v2/guild/GuildRaidPanel.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx
npm test
npm run build
git diff --check
```

Expected: all tests, lint, production build, and diff validation pass.

- [x] **Step 5: Commit the implementation**

```bash
git add docs/superpowers/specs/2026-09-05-guild-raid-post-event-practice-design.md docs/superpowers/plans/2026-09-05-guild-raid-post-event-practice.md src/lib/server/guildRaidPractice.ts src/lib/server/guildRaidPractice.test.ts src/adventure/v2/guild/GuildRaidPanel.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx
git commit -m "feat: allow guild raid practice after event"
```
