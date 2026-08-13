# Local Development Auto Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an explicitly configured loopback `next dev` session to enter the game as an existing development-database account without interactive Kakao login.

**Architecture:** A server-only helper validates the development environment, configured email, and loopback request before looking up an existing user. Auth.js registers a guarded `local-dev` Credentials provider, while the sign-in page redirects eligible requests through a dedicated Route Handler that creates the normal JWT and device-session takeover cookie.

**Tech Stack:** Next.js 16 App Router, Auth.js v5, Drizzle ORM, Vitest, TypeScript

## Global Constraints

- The feature is active only when `NODE_ENV=development` and `LOCAL_DEV_AUTO_LOGIN_USER_EMAIL` is valid.
- Host and Origin, when present, must be loopback (`localhost`, `127.0.0.1`, or `::1`).
- No user is created; the configured email must already exist in the development database.
- Production and test environments remain unable to register or start local auto login.
- Existing user changes outside the authentication files are preserved.

---

### Task 1: Guarded local account authentication

**Files:**
- Create: `src/lib/server/localDevAutoLogin.ts`
- Test: `src/lib/server/localDevAutoLogin.test.ts`

**Interfaces:**
- Produces: `readLocalDevAutoLoginConfig(env, nodeEnv)`, `isLoopbackAuthRequest(request)`, and `authenticateLocalDevAccount(request, options)`.

- [ ] **Step 1: Write failing tests** for development-only configuration, invalid configuration, loopback validation, existing-account success, and rejected requests.
- [ ] **Step 2: Run `npm test -- src/lib/server/localDevAutoLogin.test.ts`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the minimal server-only helper** with dependency injection for the account lookup and a Drizzle-backed default lookup.
- [ ] **Step 4: Run the focused test** and confirm all cases pass.
- [ ] **Step 5: Commit the helper and tests.**

### Task 2: Auth.js provider and auto-login endpoint

**Files:**
- Modify: `src/auth.ts`
- Create: `src/app/api/auth/local-dev/route.ts`
- Test: `src/app/api/auth/local-dev/route.test.ts`

**Interfaces:**
- Consumes: Task 1 guard and account authentication functions.
- Produces: conditional Auth.js provider ID `local-dev` and `GET /api/auth/local-dev`.

- [ ] **Step 1: Write failing route tests** proving remote requests return 404 and eligible local requests return the Auth.js callback redirect.
- [ ] **Step 2: Run the route test** and confirm failure because the route does not exist.
- [ ] **Step 3: Add the conditional Credentials provider and Route Handler.** Use `signIn("local-dev", { redirect: false, redirectTo: "/" })`, then return a 303 redirect to the returned URL.
- [ ] **Step 4: Run helper and route tests** and confirm they pass.
- [ ] **Step 5: Commit the provider and endpoint.**

### Task 3: Sign-in page integration and operator configuration

**Files:**
- Modify: `src/app/sign-in/page.tsx`
- Modify: `.env.example`
- Test: `src/lib/server/localDevAutoLogin.test.ts`

**Interfaces:**
- Consumes: Task 1 configuration and loopback decision.
- Produces: automatic `/sign-in` to `/api/auth/local-dev` transition without retrying when an auth error exists.

- [ ] **Step 1: Add a failing decision test** proving a logged-out loopback request starts auto login only when there is no authentication error.
- [ ] **Step 2: Run the focused test** and confirm the new decision function is missing.
- [ ] **Step 3: Implement the decision function and call it from the sign-in page** after resolving `searchParams`, session, and request headers.
- [ ] **Step 4: Document `LOCAL_DEV_AUTO_LOGIN_USER_EMAIL`** in `.env.example`, including the existing-development-user and no-production-DB requirements.
- [ ] **Step 5: Run focused tests, TypeScript, and targeted ESLint.**
- [ ] **Step 6: Commit the page integration and configuration documentation.**

### Task 4: Regression verification

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] **Step 1: Run the complete `npm test` suite.**
- [ ] **Step 2: Run `npx tsc --noEmit`.**
- [ ] **Step 3: Run targeted ESLint for all changed TypeScript files.**
- [ ] **Step 4: Run `npm run build`** and confirm the production build succeeds with local auto login disabled.
- [ ] **Step 5: Run `git diff --check` and inspect the final staged diff**, excluding unrelated worktree changes.
