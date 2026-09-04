# Auth Account Switch Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a logged-out review-account JWT cannot reappear when a subsequent Kakao login fails, while allowing a successful Kakao login to switch accounts normally.

**Architecture:** Keep the existing logout guard as defense in depth, but clear it only from the JWT callback after Auth.js has completed account ownership checks. The menu first invokes Auth.js's own session cleanup and then invokes the existing catch-all cookie cleanup route, so both the active Auth.js cookie contract and legacy/chunked variants are removed.

**Tech Stack:** Next.js 16.2.11 App Router/Proxy, Auth.js (`next-auth` 5 beta), React 19, Vitest, Testing Library, TypeScript

## Global Constraints

- Read the relevant Next.js 16 guides in `node_modules/next/dist/docs/` before changing authentication or cookie code.
- Do not automatically link or merge the Kakao account and review account.
- Do not relax `OAuthAccountNotLinked` or enable email-based automatic account linking.
- Do not modify review-account or Kakao-account save data.
- Preserve the existing single-device session and explicit account-linking policies.
- Do not write to the production database and do not deploy without a separate explicit deployment request.
- Preserve unrelated worktree changes and commit only files belonging to each task.

---

### Task 1: Release the Logout Guard Only After Successful JWT Issuance

**Files:**
- Modify: `src/auth.ts:164-266`
- Modify: `src/productionSecuritySurface.test.ts:145-165`

**Interfaces:**
- Consumes: `AUTH_LOGOUT_GUARD_COOKIE`, the per-request `cookies()` store, and Auth.js `callbacks.jwt({ token, user, account })` arguments.
- Produces: a JWT callback that removes `game-auth-logged-out.v1` only when both `account` and `user.id` prove that Auth.js reached token issuance; pre-authorization and OAuth-error paths retain the guard.

- [ ] **Step 1: Add a failing authentication-boundary regression test**

Add this test beside the existing review-account authentication security test in `src/productionSecuritySurface.test.ts`:

```ts
it("로그아웃 보호는 Auth.js 계정 확인 뒤 JWT 발급 단계에서만 해제한다", () => {
  const auth = source(join(ROOT, "src/auth.ts"));
  const signInCallback = auth.slice(
    auth.indexOf("async signIn({ account, user })"),
    auth.indexOf("async jwt({ token, user, account })"),
  );
  const jwtCallback = auth.slice(
    auth.indexOf("async jwt({ token, user, account })"),
    auth.indexOf("session({ session, token })"),
  );

  expect(signInCallback).not.toContain(
    'cookieStore.set(AUTH_LOGOUT_GUARD_COOKIE, ""',
  );
  expect(jwtCallback).toContain("if (account && user?.id)");
  expect(jwtCallback).toContain(
    'cookieStore.set(AUTH_LOGOUT_GUARD_COOKIE, ""',
  );
  expect(jwtCallback).toContain("!account &&");
  expect(jwtCallback).toContain(
    "cookieStore.has(AUTH_LOGOUT_GUARD_COOKIE)",
  );
});
```

- [ ] **Step 2: Run the regression test and confirm the current ordering fails**

Run:

```bash
npx vitest run src/productionSecuritySurface.test.ts
```

Expected: FAIL because `callbacks.signIn` currently clears the logout guard and `callbacks.jwt` does not clear it on successful issuance.

- [ ] **Step 3: Move guard deletion to the completed-authentication boundary**

Remove both `AUTH_LOGOUT_GUARD_COOKIE` deletion blocks from `callbacks.signIn`: the credentials pre-authorization branch and the Kakao pre-authorization branch.

Replace the beginning of `callbacks.jwt` with:

```ts
async jwt({ token, user, account }) {
  const cookieStore = await cookies();
  if (account && user?.id) {
    cookieStore.set(AUTH_LOGOUT_GUARD_COOKIE, "", {
      maxAge: 0,
      path: "/",
    });
  } else if (
    !account &&
    cookieStore.has(AUTH_LOGOUT_GUARD_COOKIE)
  ) {
    return null;
  }
  if (user?.id) token.sub = user.id;
  return token;
},
```

This callback runs after `handleLoginOrRegister` for OAuth. Therefore Auth.js account ownership errors, including `OAuthAccountNotLinked`, occur before the guard is removed.

- [ ] **Step 4: Run focused authentication tests**

Run:

```bash
npx vitest run src/productionSecuritySurface.test.ts src/auth.config.test.ts src/app/api/auth/logout/route.test.ts
```

Expected: PASS. The review-account takeover assertions and existing logged-out authorization assertions remain intact.

- [ ] **Step 5: Commit the server-side authentication boundary**

```bash
git add src/auth.ts src/productionSecuritySurface.test.ts
git commit -m "fix: retain logout guard through OAuth validation"
```

---

### Task 2: Layer Auth.js Sign-Out with Catch-All Cookie Cleanup

**Files:**
- Modify: `src/adventure/v2/V2SettingsMenu.tsx:1-75`
- Create: `src/adventure/v2/V2SettingsMenu.logout.test.tsx`

**Interfaces:**
- Consumes: `signOut({ redirect: false })` from `next-auth/react` and `POST /api/auth/logout` returning `{ ok: true }` on success.
- Produces: menu logout ordering `Auth.js signOut -> catch-all cleanup -> location.replace`; cleanup still runs if Auth.js sign-out rejects.

- [ ] **Step 1: Add failing UI tests for logout ordering and fallback**

Create `src/adventure/v2/V2SettingsMenu.logout.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2SettingsMenu } from "./V2SettingsMenu";

const authMocks = vi.hoisted(() => ({
  events: [] as string[],
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("next-auth/react", () => ({ signOut: authMocks.signOut }));
vi.mock("./useAttendanceReminder", () => ({
  useAttendanceReminder: () => false,
}));

describe("게임 메뉴 로그아웃", () => {
  beforeEach(() => {
    authMocks.events.length = 0;
    authMocks.signOut.mockReset();
    authMocks.signOut.mockImplementation(async () => {
      authMocks.events.push("authjs");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/auth/logout") {
          authMocks.events.push("cleanup");
        }
        return { ok: false };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Auth.js 로그아웃 뒤 잔여 세션 쿠키를 정리한다", async () => {
    render(<V2SettingsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(authMocks.events).toEqual(["authjs", "cleanup"]);
    });
    expect(authMocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
  });

  it("Auth.js 로그아웃이 실패해도 잔여 쿠키 정리를 시도한다", async () => {
    authMocks.signOut.mockImplementation(async () => {
      authMocks.events.push("authjs");
      throw new Error("signout failed");
    });

    render(<V2SettingsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(authMocks.events).toEqual(["authjs", "cleanup"]);
    });
  });
});
```

The cleanup response is deliberately unsuccessful in these unit tests so the menu reopens and jsdom does not need to emulate navigation.

- [ ] **Step 2: Run the UI test and confirm Auth.js sign-out is missing**

Run:

```bash
npx vitest run src/adventure/v2/V2SettingsMenu.logout.test.tsx
```

Expected: FAIL because `V2SettingsMenu` does not import or invoke `signOut`.

- [ ] **Step 3: Implement layered logout in the settings menu**

Add the import:

```ts
import { signOut } from "next-auth/react";
```

Change `handleSignOut` to:

```ts
const handleSignOut = async () => {
  setOpen(false);
  try {
    await signOut({ redirect: false });
  } catch {}
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    setOpen(true);
    return;
  }
  window.location.replace("/sign-in");
};
```

The catch-all cleanup remains authoritative for whether navigation proceeds. Auth.js failure does not prevent the second cleanup layer from running.

- [ ] **Step 4: Run settings-menu tests**

Run:

```bash
npx vitest run src/adventure/v2/V2SettingsMenu.logout.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the layered browser logout**

```bash
git add src/adventure/v2/V2SettingsMenu.tsx src/adventure/v2/V2SettingsMenu.logout.test.tsx
git commit -m "fix: fully clear sessions before account switching"
```

---

### Task 3: Verify the Authentication Regression as a Whole

**Files:**
- Verify: `src/auth.ts`
- Verify: `src/auth.config.ts`
- Verify: `src/app/api/auth/logout/route.ts`
- Verify: `src/adventure/v2/V2SettingsMenu.tsx`
- Verify: `src/productionSecuritySurface.test.ts`
- Verify: `src/app/api/auth/logout/route.test.ts`
- Verify: `src/adventure/v2/V2SettingsMenu.logout.test.tsx`

**Interfaces:**
- Consumes: the completed server and client changes from Tasks 1 and 2.
- Produces: evidence that successful authentication releases the guard, failed OAuth cannot expose the prior JWT, and the repository remains type- and lint-clean for touched files.

- [ ] **Step 1: Run the complete focused regression suite**

Run:

```bash
npx vitest run src/productionSecuritySurface.test.ts src/auth.config.test.ts src/app/api/auth/logout/route.test.ts src/adventure/v2/V2SettingsMenu.logout.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx
```

Expected: PASS with no failed tests.

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Lint only the changed implementation and test files**

Run:

```bash
npx eslint src/auth.ts src/productionSecuritySurface.test.ts src/adventure/v2/V2SettingsMenu.tsx src/adventure/v2/V2SettingsMenu.logout.test.tsx
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```bash
git diff --check
git status --short
git log -3 --oneline
```

Expected: no whitespace errors, no uncommitted task files, and separate plan/server/client commits at the top of the current branch. Do not deploy or run any production write operation.
