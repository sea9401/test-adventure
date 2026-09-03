# Minimum Age Grace Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are disabled by repository instructions.

**Goal:** Keep the 14+ gate dormant until 2026-10-04 00:00 KST while publishing an advance notice and future-dated policy text.

**Architecture:** The pure age policy module owns the single activation instant and combines it with signed-cookie validation. Every existing server boundary consumes that shared decision. A static public notice page and landing link communicate the change before enforcement.

**Tech Stack:** Next.js 16 App Router and Proxy, React 19, TypeScript, Vitest.

## Global Constraints

- Official game rating remains `12세이용가`.
- Service minimum age is `만 14세 이상` from `2026-10-04T00:00:00+09:00`.
- Do not collect birth date or add external identity verification.
- Keep the public notice available without login or age confirmation.
- Do not deploy, merge, or push.

---

### Task 1: Shared activation boundary

**Files:**
- Modify: `src/lib/ageEligibility.ts`
- Modify: `src/lib/server/ageEligibility.ts`
- Modify: `src/lib/server/ageEligibility.test.ts`
- Modify: `src/auth.config.ts`
- Modify: `src/auth.ts`
- Modify: `src/lib/server/ensureUser.ts`
- Modify: `src/app/(game)/layout.tsx`
- Modify: `src/app/create/page.tsx`
- Modify the corresponding existing tests.

**Interfaces:**
- Produces: `AGE_ELIGIBILITY_ENFORCEMENT_START_ISO`, `isAgeEligibilityEnforced(nowMs?)`, and `canAccessMinimumAgeService(token, secret, nowMs?)`.
- Consumes: existing signed age token verification.

- [ ] Add tests for one millisecond before activation, exact activation, invalid cookies before/after activation, and valid cookies after activation.
- [ ] Run the focused tests and verify that they fail because the activation policy does not exist.
- [ ] Implement the shared activation helpers and replace direct cookie checks at every existing enforcement boundary.
- [ ] Run all focused age, auth, layout, create-page, and common API tests until green.

### Task 2: Public advance notice

**Files:**
- Create: `src/app/notices/minimum-age-policy/page.tsx`
- Create: `src/app/notices/minimum-age-policy/page.test.tsx`
- Modify: `src/app/sign-in/LandingContent.tsx`
- Modify: `src/app/sign-in/LandingContent.test.tsx`
- Modify: `src/auth.config.ts`
- Modify: `src/auth.config.test.ts`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/sitemap.test.ts`

**Interfaces:**
- Produces: public route `/notices/minimum-age-policy`.

- [ ] Add failing tests requiring the exact notice dates, 12+/14+ distinction, existing-user impact, no-birth-date statement, account deletion path, public authorization, sitemap entry, and landing link.
- [ ] Run the focused tests and confirm that the notice route and links are missing.
- [ ] Implement the static opaque notice page and add public navigation and sitemap entries.
- [ ] Run the focused notice, landing, authorization, and sitemap tests until green.

### Task 3: Future-dated policies and operations record

**Files:**
- Modify: `src/app/terms/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/policy-pages.test.tsx`
- Modify: `docs/release-readiness.md`

- [ ] Change policy tests to require 2026년 10월 4일 and verify they fail against the current date.
- [ ] Update both policy effective dates and document the automatic enforcement instant and pre-deployment notice requirement.
- [ ] Run the policy and release-focused tests until green.

### Task 4: Verification and commit

- [ ] Run `npm test` and require zero failures.
- [ ] Run `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, `npm run lint`, `npm run check-images`, and `npm run check-asset-rights`.
- [ ] Run `NODE_OPTIONS=--max-old-space-size=4096 npm run build` and confirm the public notice route and Proxy compile.
- [ ] Run `git diff --check`, review the staged diff, and commit the implementation without deploying, merging, or pushing.
