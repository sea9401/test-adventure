# Arena Tournament Dishonor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the second arena tournament's match results while permanently hiding the sanctioned champion's identity from tournament and replay views.

**Architecture:** Store an optional `dishonoredUserIds` list in the existing tournament bracket JSON, so the decision is season-specific and survives sanction expiry. Pure public-view helpers replace marked participants with `불명예 처리된 참가자` and redact their names from replay payloads; UI presentation suppresses championship badges for marked participants.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Drizzle/PostgreSQL JSONB, Vitest.

## Global Constraints

- Preserve match winners, scores, placements, rewards, titles, and runner-up ordering.
- Do not infer dishonor from generic active sanctions or free-form reason text.
- Mask the marked participant in the tournament bracket, champion card, and replay response.
- Do not modify `src/lib/server/pvp/arenaTournamentService.ts`, which has unrelated in-progress changes.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Season-specific dishonor and public bracket projection

**Files:**
- Modify: `src/lib/server/pvp/arenaTournament.ts`
- Modify: `src/lib/server/pvp/arenaTournament.test.ts`

**Interfaces:**
- Produces: `isArenaTournamentParticipantDishonored(bracket, userId)`.
- Produces: `arenaTournamentParticipantForPublic(bracket, participant)`.
- Extends: `ArenaTournamentParticipant` with optional `dishonored` and `ArenaTournamentBracket` with optional `dishonoredUserIds`.

- [ ] Add a failing test that marks a participant, preserves all results, and verifies `arenaTournamentBracketOverview` returns the replacement label and `dishonored: true`.
- [ ] Run `npm test -- src/lib/server/pvp/arenaTournament.test.ts` and confirm the new assertions fail against the current public projection.
- [ ] Implement the minimal public projection helpers; the one-time marker write remains a direct audited operations transaction rather than an unused runtime mutator.
- [ ] Re-run the test and confirm it passes.

### Task 2: Replay redaction and UI badge suppression

**Files:**
- Modify: `src/app/api/v2/arena/tournament/[seasonId]/matches/[matchId]/route.ts`
- Modify: `src/app/api/v2/arena/tournament/[seasonId]/matches/[matchId]/route.test.ts`
- Modify: `src/adventure/v2/V2ArenaTournamentTab.tsx`

**Interfaces:**
- Produces: `arenaTournamentPublicReplay(replay, bracket)` which replaces marked participant names in `enemy.name` and log entry text without changing combat values.
- Consumes: the public participant projection from Task 1.

- [ ] Add a failing route test whose marked participant appears in participant data and replay log text, asserting neither response field contains the original name.
- [ ] Run the route test and confirm the original name leaks before implementation.
- [ ] Apply public participant and replay projection in the replay route.
- [ ] Suppress the championship badge and qualifying detail in the champion card when `dishonored` is true; retain scores and match outcome.
- [ ] Run tournament, route, and type tests and confirm they pass.

### Task 3: Mark the second tournament and verify

**Files:**
- Data only: production `pvp_tournaments.bracket` row for season `2026-W32`.

**Interfaces:**
- Consumes: the `dishonoredUserIds` JSON contract from Task 1.

- [ ] Read the `2026-W32` champion id and confirm it is the currently sanctioned champion without printing identity fields.
- [ ] In one transaction, append the champion id to `bracket.dishonoredUserIds` with JSONB deduplication and return only the season id and marker count.
- [ ] Read the row again and verify the champion id is present in the marker list.
- [ ] Run focused tests, ESLint, TypeScript, and the production build.
- [ ] Commit only this feature's files; leave unrelated worktree changes untouched.
