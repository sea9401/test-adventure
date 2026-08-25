# Dangerous Fishing Return Coin Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce ordinary dangerous-fishing stacked coin income by changing the return reward rate from 2% to 1% while preserving immediate catch coins and giant-fish rewards.

**Architecture:** Keep the existing two-stage reward flow and change only the pure return-reward coefficient. The transaction service continues to pass server-confirmed retained cargo value and current risk into the pure function, so normal and incident returns inherit the new rate without storage or API shape changes. Update the player manual and regression expectations to the same formula.

**Tech Stack:** TypeScript, Vitest, Next.js 16 Route Handlers, React 19 server rendering

## Global Constraints

- Return reward is `floor(retainedCargoValue * risk * 0.01)` fishing coins.
- Keep per-fish immediate rewards at 4–40 fishing coins.
- Keep giant-fish rewards at 80/140/190/220 coins plus the 40-coin discoverer bonus.
- Do not change risk growth, accident loss, cargo protection, catalog weights, prices, daily-cap policy, wallet shape, or dangerous-fishing save shape.
- Do not add a migration.
- Do not deploy or change maintenance mode.
- Preserve unrelated working-tree changes.

---

### Task 1: Rebalance the pure return reward and transaction expectations

**Files:**
- Modify: `src/adventure/v2/dangerousFishingRewards.test.ts`
- Modify: `src/adventure/v2/dangerousFishingRewards.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`

**Interfaces:**
- Consumes: `dangerousReturnFishingCoins(retainedCargoValue: number, risk: number): number`
- Produces: `DANGEROUS_RETURN_FISHING_COIN_RATE = 0.01` and the same `dangerousReturnFishingCoins` signature
- Preserves: `returnFishingCoinsGained` response field and `fishing-wallet.v1` storage shape

- [x] **Step 1: Change pure calculation expectations to the approved 1% rate**

Update the table in `dangerousFishingRewards.test.ts` to these exact cases and add the representative maximum-value assertion:

```ts
it.each([
  [2_700, 5, 135],
  [2_700.99, 5, 135],
  [2_701, 2.5, 67],
  [2_700, 0, 0],
  [2_700, -3, 0],
  [2_700, 99, 135],
  [0, 5, 0],
  [-200, 5, 0],
])(
  "returns exact post-loss value reward for cargo %s at risk %s",
  (retainedCargoValue, risk, expected) => {
    expect(dangerousReturnFishingCoins(retainedCargoValue, risk)).toBe(expected);
  },
);

expect(dangerousReturnFishingCoins(1_500, 5)).toBe(75);
```

- [x] **Step 2: Change route expectations before implementation**

In `dangerousFishingRoute.test.ts`, update normal and incident settlement expectations:

```ts
// retained 630, risk 5
returnFishingCoinsGained: 31
expect(
  (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
).toBe(150_031)

// retained 570, risk 5
returnFishingCoinsGained: 28
expect(
  (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
).toBe(150_028)

// retained 530, risk 5
returnFishingCoinsGained: 26
expect(
  (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
).toBe(150_026)

// Number.MAX_SAFE_INTEGER retained at risk 5
returnFishingCoinsGained: 450_359_962_737_049
```

Keep material quantities such as `danger_catch_razor_sardine: 53` unchanged; they are cargo results, not coin results.

- [x] **Step 3: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/adventure/v2/dangerousFishingRewards.test.ts src/lib/server/dangerousFishingRoute.test.ts
```

Expected: FAIL only on old 2% return-coin values because production still multiplies by `0.02`.

- [x] **Step 4: Implement the named 1% coefficient**

Change `dangerousFishingRewards.ts` to use one named constant without altering normalization or safe-integer handling:

```ts
export const DANGEROUS_RETURN_FISHING_COIN_RATE = 0.01;

export function dangerousReturnFishingCoins(
  retainedCargoValue: number,
  risk: number,
): number {
  const reward = Math.floor(
    nonNegativeInteger(retainedCargoValue) *
      normalizedRisk(risk) *
      DANGEROUS_RETURN_FISHING_COIN_RATE,
  );
  return Math.min(Number.MAX_SAFE_INTEGER, reward);
}
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/adventure/v2/dangerousFishingRewards.test.ts src/lib/server/dangerousFishingRoute.test.ts
```

Expected: both files pass, including normal return, incident return, duplicate settlement, rollback, and safe-integer cases.

- [x] **Step 6: Commit the calculation and settlement change**

```bash
git add src/adventure/v2/dangerousFishingRewards.ts src/adventure/v2/dangerousFishingRewards.test.ts src/lib/server/dangerousFishingRoute.test.ts
git commit -m "balance: reduce dangerous fishing return coins"
```

### Task 2: Align the manual and run reward-boundary regressions

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Verify: `src/lib/server/dangerousFishingBoss.test.ts`
- Verify: `src/lib/server/dangerousFishingBossRoute.test.ts`

**Interfaces:**
- Consumes: the approved 1% return formula
- Produces: player-facing copy `남은 화물 가치 × 위험도 × 1%`
- Preserves: result feedback rendering from the server-provided `returnFishingCoinsGained` value

- [x] **Step 1: Change the manual assertion first**

Update the current-content test to require the new formula and reject the old one:

```ts
expect(html).toContain("남은 화물 가치 × 위험도 × 1%");
expect(html).not.toContain("남은 화물 가치 × 위험도 × 2%");
```

- [x] **Step 2: Run the manual test and verify RED**

Run:

```bash
npx vitest run src/app/manual/current-content.test.tsx
```

Expected: FAIL because the rendered manual still says `2%`.

- [x] **Step 3: Update the player-facing formula**

In `pastimes.tsx`, change only the return formula copy:

```tsx
귀환으로 확정된 화물은 <Em>남은 화물 가치 × 위험도 × 1%</Em>의 낚시
코인을 추가로 줍니다.
```

Keep the explanation about flooring and post-incident retained value unchanged.

- [x] **Step 4: Run focused manual and reward tests**

Run:

```bash
npx vitest run src/app/manual/current-content.test.tsx src/adventure/v2/dangerousFishingRewards.test.ts src/lib/server/dangerousFishingRoute.test.ts
```

Expected: all files pass.

- [x] **Step 5: Run unchanged immediate-catch and giant-fish regressions**

Run:

```bash
npx vitest run src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts
```

Expected: all tests pass, proving giant-fish tier rewards and claims are unchanged. The route suite from Step 4 continues to assert `fishingCoinsGained: caughtFish.fishingCoinReward`, proving immediate catch coins are unchanged.

- [x] **Step 6: Run static verification**

Calculate the approved maximum-risk basic-bait average directly from the catalog and fail if it drifts from approximately 85.5 coins:

```bash
npx tsx -e 'import { DANGEROUS_FISH, DANGEROUS_BAITS } from "./src/adventure/data/v2/dangerousFishing.ts"; import { DANGEROUS_RETURN_FISHING_COIN_RATE } from "./src/adventure/v2/dangerousFishingRewards.ts"; const bait=DANGEROUS_BAITS.basic_bait; const depthIndex={surface:0,midwater:1,deep:2}; const affinity=[1,0.22,0.05]; const entries=Object.values(DANGEROUS_FISH).filter((fish)=>fish.zoneId==="abyssal_rift").map((fish)=>({fish,weight:fish.spawnWeight*affinity[Math.abs(depthIndex[fish.depthId]-depthIndex.deep)]*(bait.targetBehaviors.some((behavior)=>fish.behaviorPattern.includes(behavior))?1.5:1)*(bait.targetRarities.includes(fish.rarity)?1+bait.rarityBonus:1)})); const totalWeight=entries.reduce((sum,entry)=>sum+entry.weight,0); const expected=entries.reduce((sum,entry)=>sum+entry.weight*(entry.fish.fishingCoinReward+entry.fish.cargoValue*5*DANGEROUS_RETURN_FISHING_COIN_RATE),0)/totalWeight; console.log(expected.toFixed(2)); if(Math.abs(expected-85.52)>0.05) process.exit(1);'
```

Expected: prints `85.52` and exits 0.

Then run static checks:

Run:

```bash
npx eslint src/adventure/v2/dangerousFishingRewards.ts src/adventure/v2/dangerousFishingRewards.test.ts src/lib/server/dangerousFishingRoute.test.ts src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 7: Commit the manual and verification update**

```bash
git add src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx docs/superpowers/plans/2026-08-26-dangerous-fishing-return-coin-rebalance.md
git commit -m "docs: update dangerous fishing return rate"
```
