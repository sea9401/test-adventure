# Referral Rejoin Abuse Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve referral history across account deletion and prevent the same login identity from earning referral rewards again after re-registration.

**Architecture:** Store only keyed HMAC hashes of every linked login identity in a durable one-time claims table. Detach and anonymize referral conversions before deleting users, while summary queries retain the conversion and expose an explicit deleted state.

**Tech Stack:** TypeScript, Next.js 16 Route Handlers, Drizzle ORM, PostgreSQL, Vitest

## Global Constraints

- Do not deploy.
- Require `REFERRAL_IDENTITY_SECRET`; never persist raw OAuth or credential identifiers in the reward identity ledger.
- Use TDD for every behavior change and preserve existing user work.
- Keep account deletion, identity claiming, and reward issuance in the existing database transactions.

---

### Task 1: Durable reward identity claims

**Files:**
- Create: `src/lib/server/referralIdentity.ts`
- Create: `src/lib/server/referralIdentity.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0163_*.sql`
- Create: `drizzle/meta/0163_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `reserveReferralIdentityClaims(tx, userId): Promise<boolean>`
- Produces: `backfillReferralIdentityClaims(tx, userId): Promise<void>`

- [ ] Write tests proving deterministic keyed hashes, cross-user duplicate rejection, and partial-claim rollback.
- [ ] Run `npm test -- src/lib/server/referralIdentity.test.ts` and confirm the missing behavior fails.
- [ ] Implement HMAC identity collection and atomic claim/rollback behavior.
- [ ] Add the claims table and generate the migration.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Referral conversion retention and reward gate

**Files:**
- Modify: `src/lib/server/referrals.ts`
- Modify: `src/lib/server/referrals.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `drizzle/0163_*.sql`

**Interfaces:**
- Consumes: `reserveReferralIdentityClaims(tx, userId)`
- Produces: a nullable `referredUserId`, stable `referredName`, and `referredDeletedAt` conversion record.

- [ ] Add a failing regression test showing a previously claimed login identity gets no conversion or reward mail.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Gate `attributeReferral` on identity reservation and persist the referred-name snapshot.
- [ ] Change conversion ownership from the user ID PK to an independent serial PK with `ON DELETE SET NULL`.
- [ ] Re-run referral tests and confirm they pass.

### Task 3: Account deletion anonymization

**Files:**
- Modify: `src/app/api/account/delete/route.ts`
- Modify: `src/app/api/account/delete/route.test.ts`
- Modify: `src/lib/server/referralIdentity.ts`

**Interfaces:**
- Consumes: `backfillReferralIdentityClaims(tx, userId)`
- Produces: preserved conversion rows named `탈퇴한 사용자` with a deletion timestamp.

- [ ] Add a failing route regression test for backfill and anonymization before user deletion.
- [ ] Run the route test and confirm the expected failure.
- [ ] Backfill legacy identity claims and detach/anonymize the conversion inside the deletion transaction.
- [ ] Re-run the route and identity tests and confirm they pass.

### Task 4: Referral summary and policy surfaces

**Files:**
- Modify: `src/app/api/referrals/me/route.ts`
- Create: `src/app/api/referrals/me/route.test.ts`
- Modify: `src/adventure/v2/V2ReferralView.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/account-deletion/page.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: referral items with `deleted: boolean`, preserved counts, names, and earned reward totals.

- [ ] Add a failing API test showing a detached conversion remains in counts and is marked deleted.
- [ ] Run the focused API test and confirm the expected failure.
- [ ] Replace the mandatory user join with a left join and return snapshot/deleted state.
- [ ] Render deleted referrals without a misleading current-stage label.
- [ ] Document the required HMAC secret and pseudonymous ledger retention period.
- [ ] Re-run focused tests.

### Task 5: Verification and commit

**Files:**
- Review all modified files.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run check-migrations`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check`, `git diff --stat`, and the final diff for privacy or migration mistakes.
- [ ] Commit the verified implementation without deploying.
