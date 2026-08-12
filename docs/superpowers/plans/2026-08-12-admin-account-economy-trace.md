# Admin Account Economy Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable read-only admin report that traces any account's production, current balances, direct marketplace counterparties, guild warehouse actions, and major economy uses.

**Architecture:** Aggregate large event streams in PostgreSQL by period, event, item, and counterparty. Convert database rows through a pure report builder shared by the route contract and UI, then embed a lookup panel in the existing economy log tab and link to it from selected-user details.

**Tech Stack:** TypeScript, Next.js 16 App Router route handlers, React 19, Drizzle ORM/PostgreSQL, Vitest

## Global Constraints

- The feature is administrator-only and read-only.
- Accepted periods are exactly 7, 30, and 90 days; default is 30 days.
- The lookup accepts an exact game name or user ID.
- Do not claim per-unit lineage for stackable materials.
- Do not expose email, IP, auth, or other unrelated personal data.
- Use opaque UI surfaces from `src/components/ui/surfaces.ts`.
- Do not deploy or change maintenance mode.

---

### Task 1: Report contract and aggregation

**Files:**
- Create: `src/lib/server/accountEconomyTrace.ts`
- Create: `src/lib/server/accountEconomyTrace.test.ts`

**Interfaces:**
- Produces: `parseEconomyTraceDays(raw): 7 | 30 | 90 | null`, `buildAccountEconomyTrace(input): AccountEconomyTraceReport`, and the shared report/input row types.

- [ ] **Step 1: Write failing pure aggregation tests**

Test literal fixtures where woodcutting/mining rewards become activity and item totals, material sales identify a named counterparty, only the target actor's warehouse deposit counts, current production-item inventory is selected, and empty transfers produce false evidence flags.

- [ ] **Step 2: Verify RED**

Run `npm test -- src/lib/server/accountEconomyTrace.test.ts` and confirm failure because the module does not exist.

- [ ] **Step 3: Implement the minimal report builder**

Define the exact response shape and categorize the aggregated database rows without querying or mutating external state.

- [ ] **Step 4: Verify GREEN**

Run `npm test -- src/lib/server/accountEconomyTrace.test.ts` and expect all tests to pass.

### Task 2: Read-only admin API

**Files:**
- Create: `src/app/api/admin/economy-trace/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `economyEvents`, `users`, `savesKv`, `guildMembers`, `guilds`, `guildActivityLog`, and Task 1's builder.
- Produces: `GET /api/admin/economy-trace?user=<id-or-name>&days=<7|30|90>`.

- [ ] **Step 1: Resolve and validate the account**

Reject an empty `user` or invalid `days`, resolve exact ID/name, and return 404 when absent.

- [ ] **Step 2: Add bounded database aggregations**

Group economy events by event/item and by counterparty in PostgreSQL, group only target-actor warehouse actions, read current `character.v2`, and never load individual gathering attempts.

- [ ] **Step 3: Return the shared report**

Pass normalized rows to `buildAccountEconomyTrace` and return `{ ok: true, report }`.

### Task 3: Economy trace report UI

**Files:**
- Create: `src/admin/tabs/economy/AccountEconomyTracePanel.tsx`
- Create: `src/admin/tabs/economy/AccountEconomyTracePanel.test.tsx`
- Modify: `src/admin/tabs/EconomyLogTab.tsx`

**Interfaces:**
- Consumes: Task 1's `AccountEconomyTraceReport` and the new admin API.
- Produces: lookup by name/ID, 7/30/90-day selection, report summaries/tables, explicit empty states and lineage limitation.

- [ ] **Step 1: Write failing static render tests**

Render a sample report and assert account/guild, production quantity, counterparty, warehouse movement, direct-transfer evidence, and lineage limitation. Render an empty report and assert `없음` states.

- [ ] **Step 2: Verify RED**

Run `npm test -- src/admin/tabs/economy/AccountEconomyTracePanel.test.tsx` and confirm the component is missing.

- [ ] **Step 3: Implement the report and lookup panel**

Use `SURFACE_CARD` and `SURFACE_INSET`, submit only on an explicit button, initialize from `traceUser` query parameters, and show API errors without altering other economy filters.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 and Task 3 tests together and expect them to pass.

### Task 4: Selected-user entry point

**Files:**
- Modify: `src/admin/tabs/users/SelectedUserPanel.tsx`

**Interfaces:**
- Produces: `/admin?tab=economy&traceUser=<userId>` link labelled `재화 흐름 분석`.

- [ ] **Step 1: Add the read-only deep link**

Place the link in the selected account summary card. It is navigation, so it remains available in admin read-only mode.

- [ ] **Step 2: Run focused tests and type checking**

Run the Task 1/Task 3 tests and `npx tsc --noEmit`.

### Task 5: Full verification and commit

**Files:**
- Verify all files above plus this feature's spec and plan.

**Interfaces:**
- Produces: verified commits on the current branch without deployment.

- [ ] **Step 1: Run fresh verification**

Run `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run check-images`, and `npm run build`.

- [ ] **Step 2: Inspect scope and safety**

Confirm the route contains no INSERT/UPDATE/DELETE, unrelated changes are not staged, and the UI states the lineage limitation.

- [ ] **Step 3: Commit**

Commit implementation as `feat: add admin account economy trace`.
