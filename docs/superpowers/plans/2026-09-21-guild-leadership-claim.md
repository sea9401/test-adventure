# Guild leadership claim implementation plan

> Execute sequentially using superpowers:executing-plans; repository instructions prohibit subagents unless requested.

**Goal:** Allow a current guild member to claim leadership after the master's 72-hour absence.
**Architecture:** Reuse presence, serialize changes on the guild row, publish eligibility in guild info, and expose a members-tab action.
**Tech Stack:** Next.js 16 route handlers, Drizzle/PostgreSQL, React, Vitest.

## Constraints

- Follow the adjacent design. No migration, deployment, or unrelated changes.
- Work on the current non-main branch, preserving existing unrelated working-tree edits. No isolation is needed because touched files do not overlap.
- Use opaque surface tokens and preserve existing membership semantics.

## Tasks

- [x] Add `src/adventure/data/guildLeadership.test.ts` before `guildLeadership.ts`: helper `canClaimGuildLeadership(lastSeenAt: Date | null | undefined, now: number): boolean`; test exact 72h, 1ms short, missing/invalid/future timestamps.
- [x] Add `src/app/api/v2/guild/claim-leadership/route.test.ts` before `route.ts`: POST body `{ expectedMasterId: string }`; cover authentication, malformed input, absence threshold, membership recheck, missing/changed/disbanded guild, master identity, and success updating master ID, both roles, applicant presence, and activity in one transaction. Use table-aware DB mocks for route branches and SQL predicates; verify lock sequencing. Run tests to observe failure, then implement.
- [x] Modify `src/app/api/v2/me/guild/info/route.ts` and `src/adventure/v2/guild/guildShared.ts` to publish `canClaimLeadership` using the shared helper and viewer identity.
- [x] Add `GuildMembersPanel.test.tsx` before editing `GuildMembersPanel.tsx`: ordinary members see action only when eligible, confirm cancel makes no request, submit current master ID, handle errors, disable while busy, refresh after success. Use shared opaque surfaces for new panel and existing translucent leave panel.
- [x] Add `leadership_claim` to `src/lib/server/guildActivityLog.ts` and its readable rendering/test in `src/adventure/v2/GuildActivityList.tsx` / `.test.tsx`. Update `src/app/manual/content/guild.tsx`.
- [x] Run targeted new/existing guild tests, TypeScript, ESLint and `git diff --check`. Review transaction predicates and competing membership operations. Commit only task files on current branch after validation.


## Validation

- 7 test files / 59 tests passed, including the actual PostgreSQL route integration tests (simultaneous claims, concurrent heartbeat, concurrent kick, rollback on log failure).
- Guild info API tests cover ordinary member eligibility, master exclusion, membership loss, missing presence and the 72-hour boundary.
- The final UI assertion adjustment was rechecked: 11 tests passed.
- `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental false` passed. The default 2 GB heap was insufficient for this repository.
- ESLint on every changed TypeScript file and `git diff --check` passed.
- Reviewed request identity, guild/member/presence lock order, master ID and both role updates, activity attribution, and opaque light/dark surface tokens.
- No deployment or production data changes.
