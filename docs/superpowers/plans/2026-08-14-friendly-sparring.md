# User Friendly Sparring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only user-versus-user friendly match mode to `/battle/sparring`, with exact nickname lookup and a public-profile shortcut.

**Architecture:** Keep the dummy route unchanged. Add a friendly-sparring route with GET lookup and POST PvP simulation, a focused server helper, and a client panel/hook embedded as the second sparring mode. Convert the sparring page into a server wrapper plus client boundary so Next.js 16 search params are passed without a client-side Suspense bailout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, Vitest, existing PvP engine and UI surfaces.

## Global Constraints

- Do not deploy.
- Keep `/api/v2/training/spar` and dummy practice behavior unchanged.
- Use current equipment, skills, and combat pattern; never read `arena-loadouts.v2`.
- Exclude cooking buffs and start both combatants at full HP/MP.
- Reuse arena PvP damage and sustain multipliers.
- Do not change stamina, rewards, Elo, records, notifications, quests, achievements, or save rows.
- Return the replay only to the challenger and keep it only in client state.
- Enforce a separate 10-second server cooldown plus high-cost user/IP limits.
- Reject self-targets, operator accounts, missing/broken characters, and either-direction blocks without revealing block state.
- Use opaque shared surface constants for content panels.
- Preserve unrelated working-tree changes and stage only feature files.

---

### Task 1: Target resolution and combatant preparation

**Files:**
- Create: `src/lib/server/friendlySparring.ts`
- Test: `src/lib/server/friendlySparring.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `savesKv`, `usersCannotInteract`, `isSuperAdminEmail`, `derivePlayerCombatV2`, `sanitizeCombatLoadout`, `readCodexSpBonus`, and `readJobUnlockContext`.
- Produces: `resolveFriendlySparringTarget(viewerUserId, rawName)` and `prepareFriendlySparringCombatant(userId)`.

- [ ] **Step 1: Write failing helper tests**

Mock DB resolution and combat derivation, then assert public resolution and every rejection:

```ts
expect(await resolveFriendlySparringTarget("viewer", " target ")).toEqual(
  expect.objectContaining({ userId: "target", name: "상대", level: 77 }),
);
expect(await resolveFriendlySparringTarget("viewer", "viewer-name")).toBeNull();
expect(await resolveFriendlySparringTarget("viewer", "operator")).toBeNull();
expect(await resolveFriendlySparringTarget("viewer", "blocked")).toBeNull();
expect(derivePlayerCombatV2).toHaveBeenCalledWith(
  "target",
  expect.anything(),
  expect.objectContaining({ includeCookingBuff: false }),
);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/lib/server/friendlySparring.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the server helper**

Implement these signatures:

```ts
export type FriendlySparringTarget = {
  userId: string;
  name: string;
  level: number;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
};
export type FriendlySparringCombatant = {
  name: string;
  level: number;
  player: PlayerCombat;
  skills: V2SkillsState;
};
export async function resolveFriendlySparringTarget(
  viewerUserId: string,
  rawName: string,
): Promise<FriendlySparringTarget | null>;
export async function prepareFriendlySparringCombatant(
  userId: string,
): Promise<FriendlySparringCombatant | null>;
```

Resolve the display name with `game_name` first and profile-name fallback, exact case-insensitive match. Reject empty/self/operator/blocked targets and require `character.v2`. Read only current character/equipment/skills/proficiency, sanitize the loadout, derive with `includeCookingBuff: false`, and set HP/MP to maxima.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/lib/server/friendlySparring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/friendlySparring.ts src/lib/server/friendlySparring.test.ts
git commit -m "feat: prepare friendly sparring combatants"
```

### Task 2: Read-only friendly sparring API

**Files:**
- Create: `src/app/api/v2/training/friendly/route.ts`
- Create: `src/app/api/v2/training/friendly/route.test.ts`
- Modify: `src/lib/server/highCostRateLimit.ts`

**Interfaces:**
- Consumes: Task 1 helpers, `ensureUser`, `resolveBattlePvP`, `autoDuelContext`, `toPvpReplayPayload`, and arena multiplier constants.
- Produces: `GET /api/v2/training/friendly?name=...` and `POST /api/v2/training/friendly`.

- [ ] **Step 1: Write failing route tests**

Cover unauthenticated requests, empty/hidden targets, public summary, PvP options, no writes, and cooldown:

```ts
expect(resolveBattlePvP).toHaveBeenCalledWith(
  expect.objectContaining({ hp: 100 }),
  expect.objectContaining({ hp: 120 }),
  "나",
  "상대",
  expect.objectContaining({
    damageMultiplier: ARENA_DAMAGE_MULTIPLIER,
    sustainMultiplier: ARENA_SUSTAIN_MULTIPLIER,
  }),
);
expect(secondResponse.status).toBe(429);
expect(await secondResponse.json()).toMatchObject({
  ok: false,
  error: "cooldown",
  retryAfterSec: 10,
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/app/api/v2/training/friendly/route.test.ts`

Expected: FAIL because the route and friendly limit key do not exist.

- [ ] **Step 3: Implement GET, POST, and limiting**

Add `friendlySparring` to `HIGH_COST_RATE_LIMITS` with action `v2:training:friendly`, user limit 20, and IP limit 80. In POST, also call `enforceUserRateLimit` with action `v2:training:friendly:cooldown`, limit 1, and `windowMs: 10_000` after target validation and before simulation. Translate its response into `{ error: "cooldown", retryAfterSec }`.

Return 404 `{ error: "target_not_found" }` for hidden targets and 400 `{ error: "no_character" }` for the challenger. Run `resolveBattlePvP` once with `autoDuelContext()`, both skill states, and arena damage/sustain multipliers. Return `toPvpReplayPayload` directly; do not import save-upsert or replay-store functions.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/app/api/v2/training/friendly/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v2/training/friendly/route.ts src/app/api/v2/training/friendly/route.test.ts src/lib/server/highCostRateLimit.ts
git commit -m "feat: add friendly sparring API"
```

### Task 3: Friendly sparring client panel

**Files:**
- Create: `src/adventure/v2/useFriendlySparring.ts`
- Create: `src/adventure/v2/FriendlySparringPanel.tsx`
- Create: `src/adventure/v2/FriendlySparringPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 responses, `CosmeticAvatar`, `ReplayBattleScene`, `SURFACE_CARD`, and `SURFACE_INSET`.
- Produces: `<FriendlySparringPanel initialTargetName playerName gender playerSubtitle playerCombat />`.

- [ ] **Step 1: Write failing panel tests**

Assert exact-search copy, opaque surfaces, selected target, errors, result, and countdown:

```ts
expect(html).toContain("정확한 닉네임");
expect(html).toContain("친선전 시작");
expect(html).toContain("상대를 찾을 수 없습니다");
expect(html).toContain("다시 대련까지 10초");
expect(html).not.toContain("bg-white/");
```

Assert the initial target triggers GET but never POST, a new search clears the prior result, and rapid double submission makes one POST.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/adventure/v2/FriendlySparringPanel.test.tsx`

Expected: FAIL because the panel and hook do not exist.

- [ ] **Step 3: Implement hook and panel**

The hook owns `target`, `result`, `busy`, `searching`, `error`, `cooldownUntil`, and an in-flight ref. Expose `search(name)` and `fight()`. Convert API errors to Korean copy and use server `retryAfterSec`/`cooldownMs` for countdown.

Render the exact nickname form, an opaque target card, a start/countdown button, result summary, and:

```tsx
<ReplayBattleScene
  payload={result.replay}
  startPlayerHp={result.startPlayerHp}
  logTitle="친선전 전체 전투 로그"
/>
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/FriendlySparringPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/useFriendlySparring.ts src/adventure/v2/FriendlySparringPanel.tsx src/adventure/v2/FriendlySparringPanel.test.tsx
git commit -m "feat: add friendly sparring panel"
```

### Task 4: Mode integration and profile shortcut

**Files:**
- Modify: `src/adventure/v2/V2SparringView.tsx`
- Create: `src/adventure/v2/V2SparringView.test.tsx`
- Create: `src/adventure/v2/SparringPageClient.tsx`
- Modify: `src/app/(game)/battle/sparring/page.tsx`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Create: `src/adventure/v2/friendlySparringLink.ts`
- Create: `src/adventure/v2/friendlySparringLink.test.ts`

**Interfaces:**
- Consumes: Task 3 panel.
- Produces: `V2SparringView` props `initialMode?: "dummy" | "friendly"`, `initialTargetName?: string`, and `friendlySparringHref(name)`.

- [ ] **Step 1: Write failing integration tests**

```ts
expect(friendlySparringHref("검 은&별")).toBe(
  "/battle/sparring?mode=friendly&target=%EA%B2%80%20%EC%9D%80%26%EB%B3%84",
);
expect(dummyHtml).toContain("허수아비치기 시작");
expect(friendlyHtml).toContain("유저 친선전");
```

Also assert that the profile shortcut is rendered only for another user's loaded character.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/adventure/v2/V2SparringView.test.tsx src/adventure/v2/friendlySparringLink.test.ts`

Expected: FAIL because the mode props and helper do not exist.

- [ ] **Step 3: Integrate modes and search params**

Move the current client page body to `SparringPageClient.tsx`. Make `page.tsx` an async server wrapper:

```tsx
export default async function SparringPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; target?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <SparringPageClient
      initialMode={query.mode === "friendly" ? "friendly" : "dummy"}
      initialTargetName={typeof query.target === "string" ? query.target : undefined}
    />
  );
}
```

Render an opaque two-option mode control in `V2SparringView`, existing dummy content in dummy mode, and `FriendlySparringPanel` in friendly mode. Add `<Link href={friendlySparringHref(character.name)}>친선전</Link>` only for another user's public profile.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/V2SparringView.test.tsx src/adventure/v2/friendlySparringLink.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/V2SparringView.tsx src/adventure/v2/V2SparringView.test.tsx src/adventure/v2/SparringPageClient.tsx 'src/app/(game)/battle/sparring/page.tsx' src/adventure/v2/V2CharacterScreen.tsx src/adventure/v2/friendlySparringLink.ts src/adventure/v2/friendlySparringLink.test.ts
git commit -m "feat: expose user friendly sparring"
```

### Task 5: Cross-feature verification

**Files:**
- Modify only if verification exposes a friendly-sparring defect.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: verified feature with unrelated changes left untouched.

- [ ] **Step 1: Run all focused tests**

```bash
npx vitest run \
  src/lib/server/friendlySparring.test.ts \
  src/app/api/v2/training/friendly/route.test.ts \
  src/adventure/v2/FriendlySparringPanel.test.tsx \
  src/adventure/v2/V2SparringView.test.tsx \
  src/adventure/v2/friendlySparringLink.test.ts
```

- [ ] **Step 2: Run static checks**

Run `npx tsc --noEmit`, focused `npx eslint` on every changed source/test file, and `npm run check-images`. Expected: all exit 0.

- [ ] **Step 3: Inspect scope**

```bash
git status --short
git log -5 --oneline
```

Confirm unrelated existing files remain untouched and no deployment command ran.
