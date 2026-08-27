# Retroactive Referral Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any previously un-attributed account permanently register one referrer and receive signup and already-earned referral tutorial rewards for both users.

**Architecture:** Extend the existing server-only referral service with pasted-link normalization and explicit failure reasons, then expose a rate-limited authenticated Route Handler that performs attribution and current-progress reconciliation in one database transaction. Add a focused client registration form to the existing referral view and derive its visibility from the referral summary.

**Tech Stack:** Next.js 16.2 Route Handlers and Client Components, React 19, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Testing Library, Tailwind UI primitives.

## Global Constraints

- Registration has no account-age or elapsed-time limit.
- A login identity may be attributed once and the referrer cannot be changed or removed.
- Self-referral and rewards after deletion/re-registration remain blocked.
- Signup and all currently satisfied hunt, guild, and life tutorial tasks are rewarded retroactively to both users.
- Attribution and all generated rewards must commit or roll back together.
- Reuse opaque UI surfaces from `src/components/ui/surfaces.ts`; do not introduce translucent content cards.
- Do not deploy.

---

### Task 1: Referral Input and Explicit Attribution Results

**Files:**
- Modify: `src/lib/server/referrals.ts`
- Modify: `src/lib/server/referrals.test.ts`

**Interfaces:**
- Produces: `normalizeReferralInput(value: unknown): string | null`
- Produces: `ReferralAttributionResult = { attributed: true } | { attributed: false; reason: "invalid_code" | "self_referral" | "already_attributed" }`
- Changes: `attributeReferral(...): Promise<ReferralAttributionResult>`

- [ ] **Step 1: Add failing normalization and failure-reason tests**

Add tests proving raw mixed-case codes, `https://msmsge.com/r/<code>`, and `/r/<code>` normalize to lowercase, while other paths and malformed input return `null`. Update invalid-owner, self-referral, identity-ledger rejection, and conversion-conflict expectations to use the exact reason union.

```ts
expect(normalizeReferralInput("https://msmsge.com/r/ABCDEF0123456789")).toBe(
  "abcdef0123456789",
);
expect(normalizeReferralInput("/not-referral/abcdef0123456789")).toBeNull();
expect(result).toEqual({ attributed: false, reason: "self_referral" });
```

- [ ] **Step 2: Run the referral unit tests and confirm RED**

Run: `npm test -- src/lib/server/referrals.test.ts`

Expected: FAIL because `normalizeReferralInput` and explicit failure reasons do not exist.

- [ ] **Step 3: Implement minimal input normalization and result reasons**

Normalize a raw code first, then parse absolute or root-relative URLs against a harmless base and accept only a pathname shaped exactly as `/r/<16 hex characters>` with an optional trailing slash. Return `invalid_code` when normalization or active-owner lookup fails, `self_referral` for the current owner, and `already_attributed` when identity reservation or conversion insertion fails. Keep successful signup mailbox writes unchanged.

```ts
export type ReferralAttributionResult =
  | { attributed: true }
  | { attributed: false; reason: "invalid_code" | "self_referral" | "already_attributed" };

export function normalizeReferralInput(value: unknown): string | null {
  const direct = normalizeReferralCode(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim(), "https://referral.invalid");
    const match = url.pathname.match(/^\/r\/([a-f0-9]{16})\/?$/i);
    return match ? normalizeReferralCode(match[1]) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the referral unit tests and confirm GREEN**

Run: `npm test -- src/lib/server/referrals.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the service change**

```bash
git add src/lib/server/referrals.ts src/lib/server/referrals.test.ts
git commit -m "feat: accept retroactive referral inputs"
```

### Task 2: Atomic Retroactive Attribution Route

**Files:**
- Create: `src/app/api/referrals/me/attribute/route.ts`
- Create: `src/app/api/referrals/me/attribute/route.test.ts`

**Interfaces:**
- Consumes: `normalizeReferralInput`, `attributeReferral`, `loadReferralTutorialSnapshot`, `rewardReferralTutorialTasks`, and `readSave`
- Produces: `POST /api/referrals/me/attribute` with body `{ referral: string }`
- Produces success: `{ ok: true, newlyCompletedTaskIds: ReferralTutorialProgressTaskId[], staminaPotions: number }`
- Produces failure: `{ ok: false, error: "invalid_referral" | "self_referral" | "already_attributed" }`

- [ ] **Step 1: Write failing authenticated-route tests**

Mock the auth, active-session, rate-limit, database transaction, profile read, snapshot, and reward dependencies used by the existing sync route. Test that a valid pasted link calls attribution with the normalized code and current game name, then passes the current snapshot task IDs to reward reconciliation in the same transaction. Test malformed input (`400`), self-referral (`409`), already-attributed identity (`409`), unauthenticated (`401`), and inactive session (`410`) paths, asserting reward reconciliation is never called after rejection.

```ts
const response = await POST(new Request("http://test/api/referrals/me/attribute", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ referral: "https://msmsge.com/r/abcdef0123456789" }),
}));
expect(mocks.attributeCalls[0]?.slice(1)).toEqual([
  "referred-user", "abcdef0123456789", "새싹",
]);
expect(mocks.rewardCalls[0]?.slice(1)).toEqual([
  "referred-user", "새싹", mocks.snapshot.taskIds,
]);
```

- [ ] **Step 2: Run the route test and confirm RED**

Run: `npm test -- src/app/api/referrals/me/attribute/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the Route Handler**

Follow the installed Next.js Route Handler guide: treat the handler as a public endpoint, verify the user and active device session, and validate all body data. Apply `enforceUserAndIpRateLimit` using action `referrals:attribute`, user limit `10`, IP limit `100`, and a `60_000` ms window. Within `db.transaction`, read `character-profile.v2`, run `attributeReferral`, and only on success load and reward the current snapshot. Map service reasons to limited client errors without returning referrer data.

```ts
const attributed = await attributeReferral(tx, userId, code, name);
if (!attributed.attributed) return attributed;
const snapshot = await loadReferralTutorialSnapshot(tx, userId);
const reward = await rewardReferralTutorialTasks(
  tx, userId, name, snapshot.taskIds,
);
return { attributed: true as const, reward };
```

- [ ] **Step 4: Run route and existing referral tests and confirm GREEN**

Run: `npm test -- src/app/api/referrals/me/attribute/route.test.ts src/app/api/referrals/me/sync/route.test.ts src/lib/server/referrals.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the route**

```bash
git add src/app/api/referrals/me/attribute/route.ts src/app/api/referrals/me/attribute/route.test.ts
git commit -m "feat: attribute referrers after signup"
```

### Task 3: Referral Summary and Registration Form

**Files:**
- Modify: `src/app/api/referrals/me/route.ts`
- Modify: `src/app/api/referrals/me/route.test.ts`
- Create: `src/adventure/v2/ReferralRegistrationForm.tsx`
- Create: `src/adventure/v2/ReferralRegistrationForm.test.tsx`
- Modify: `src/adventure/v2/V2ReferralView.tsx`

**Interfaces:**
- Produces summary field: `hasReferrer: boolean`
- Produces component: `<ReferralRegistrationForm onRegistered={() => Promise<void> | void} />`
- Consumes: `POST /api/referrals/me/attribute`

- [ ] **Step 1: Write failing summary and component tests**

In the summary route test, assert `hasReferrer` is false for no current conversion and true when `currentProgressRows` contains a conversion. In a jsdom component test, render the form, verify the permanent one-time warning and link/code field, submit a successful response, and assert `onRegistered` is called. Add table-driven error responses proving `invalid_referral`, `self_referral`, and `already_attributed` render distinct Korean messages without calling the callback.

```tsx
render(<ReferralRegistrationForm onRegistered={onRegistered} />);
fireEvent.change(screen.getByLabelText("추천인의 홍보 링크 또는 코드"), {
  target: { value: "abcdef0123456789" },
});
fireEvent.click(screen.getByRole("button", { name: "추천인 등록" }));
await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/app/api/referrals/me/route.test.ts src/adventure/v2/ReferralRegistrationForm.test.tsx`

Expected: FAIL because the summary flag and form do not exist.

- [ ] **Step 3: Add the summary state and opaque registration form**

Return `hasReferrer: currentProgress != null` from `referralSummary`. Build the form using the existing `Card`, `Button`, and `SURFACE_INSET` primitives. Keep its input and button state local, disable duplicate submissions, POST JSON `{ referral }`, translate the three server errors, and call `onRegistered` only after success. Explain that registration is permanent and that completed tasks are rewarded retroactively.

```ts
const REGISTER_ERROR_MESSAGES: Record<string, string> = {
  invalid_referral: "유효한 홍보 링크 또는 코드를 확인해 주세요.",
  self_referral: "내 홍보 코드는 추천인으로 등록할 수 없습니다.",
  already_attributed: "이미 추천인이 등록되었거나 홍보 보상을 받은 계정입니다.",
};
```

- [ ] **Step 4: Integrate the form into the referral view**

Extend `ReferralSummary` with `hasReferrer: boolean`. After the introductory promotion card and only when loading has finished and `summary.hasReferrer` is false, render `ReferralRegistrationForm`. Pass an async callback that invokes the existing `load()` function so a success hides the form and shows the server-reconciled roadmap. Do not alter the referrer's own link issuance or statistics.

- [ ] **Step 5: Run summary, form, and view tests and confirm GREEN**

Run: `npm test -- src/app/api/referrals/me/route.test.ts src/adventure/v2/ReferralRegistrationForm.test.tsx src/adventure/v2/V2ReferralView.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the UI integration**

```bash
git add src/app/api/referrals/me/route.ts src/app/api/referrals/me/route.test.ts src/adventure/v2/ReferralRegistrationForm.tsx src/adventure/v2/ReferralRegistrationForm.test.tsx src/adventure/v2/V2ReferralView.tsx
git commit -m "feat: add referrer registration form"
```

### Task 4: Player Documentation and Verification

**Files:**
- Modify: `src/app/manual/content/controls.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Documents the final player-facing policy; produces no code API.

- [ ] **Step 1: Add a failing manual-content assertion**

Extend the existing game-promotion manual test to require copy covering post-signup referrer registration, permanent one-time attribution, and retroactive completed-task rewards.

```ts
expect(html).toContain("가입 후에도");
expect(html).toContain("한 번만");
expect(html).toContain("이미 완료한 단계");
```

- [ ] **Step 2: Run the manual test and confirm RED**

Run: `npm test -- src/app/manual/current-content.test.tsx`

Expected: FAIL because the policy copy is absent.

- [ ] **Step 3: Update the manual copy**

Add concise Korean copy explaining that an un-attributed account can paste a referrer's link or code at any later time, can do so only once with no changes, and receives rewards for already completed milestones immediately. Preserve all existing task thresholds and reward quantities.

- [ ] **Step 4: Run all focused tests, lint, and diff checks**

Run the seven focused test files, then ESLint only the touched referral/manual files, followed by `git diff --check` and `git status --short`. Expected: all focused tests and ESLint pass; diff check emits no errors; unrelated dirty-worktree files remain unstaged.

- [ ] **Step 5: Commit documentation**

```bash
git add src/app/manual/content/controls.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain post-signup referrals"
```
