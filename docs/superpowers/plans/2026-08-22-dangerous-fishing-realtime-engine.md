# Dangerous Fishing Realtime Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic realtime fishing simulation, v2 encounter persistence, and idempotent normal/boss Route Handler flows while preserving every v1 encounter.

**Architecture:** A dependency-free fixed-tick module owns all gameplay math and is imported by both Client Components and server services. Server services persist the latest approved checkpoint and completion result; the existing POST Route Handlers add `start_realtime`, `checkpoint`, and `finish` actions while retaining the v1 `start` and three-button actions.

**Tech Stack:** TypeScript 5, Vitest 4, Next.js 16.2 Route Handlers using Web `Request`/`Response`, React 19-compatible serializable view models, Drizzle transactions through the existing `savesKv` helpers.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before changing a Route Handler.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before exporting a module to the client graph.
- General fishing routes and rules are out of scope.
- The simulation tick is exactly 50ms and uses integer gameplay values.
- Target durations are 8–15s common, 12–20s rare/epic, 18–25s legendary, and 25–40s boss.
- Combined level, equipment, and bait time reduction is capped at 35%.
- Risk remains `clamp(zone.baseRisk + depth.riskBonus, 0, 5)` and uses the exact table from the design spec.
- Existing level assistance through level 50 cannot decrease; new endgame bonuses scale only from levels 50–100.
- Existing v1 encounters, cargo, bait, codex, equipment, boss contribution, and reward claims must remain readable.
- Do not deploy or change maintenance mode.

---

### Task 1: Realtime balance and modifier catalog

**Files:**
- Create: `src/adventure/v2/dangerousFishingRealtimeModifiers.ts`
- Create: `src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.test.ts`
- Modify: `src/adventure/v2/dangerousFishingHeritage.ts`
- Modify: `src/adventure/v2/dangerousFishingHeritage.test.ts`

**Interfaces:**
- Produces: `DANGEROUS_REALTIME_RISK_RULES`, `dangerousRealtimeLevelBonuses(level)`, `dangerousRealtimeBaitEffect(baitId)`, and `dangerousRealtimeModifiers(args)`.
- `dangerousRealtimeModifiers(args)` returns `{ reelEfficiencyPct, tensionControlPct, safeZoneBonusPct, cargoProtectionPct, staminaDamagePct, distanceRecoveryPct, timeReductionPct, baitEffect }` with `timeReductionPct <= 35`.

- [ ] **Step 1: Write failing risk, level, and bait tests**

```ts
expect(DANGEROUS_REALTIME_RISK_RULES[5]).toEqual({
  safeZonePct: 34,
  minBehaviorTicks: 19,
  maxChain: 3,
  tensionImpulsePermille: 1400,
});
expect(dangerousRealtimeLevelBonuses(50)).toEqual({
  reelEfficiencyPct: 0,
  tensionControlPct: 0,
});
expect(dangerousRealtimeLevelBonuses(100)).toEqual({
  reelEfficiencyPct: 12,
  tensionControlPct: 8,
});
expect(dangerousRealtimeBaitEffect("luminous_bait")).toMatchObject({
  telegraphCount: 1,
  diveSpeedReductionPct: 15,
});
expect(dangerousRealtimeModifiers(maxedFixture()).timeReductionPct).toBe(35);
```

Also assert that the existing level-15 assist stays 0%, level 50 retains its existing 10% assist, and level 100 adds only the new 12% reel-efficiency and 8% tension-control bonuses.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts`

Expected: FAIL because the realtime modifier module and bait effect fields do not exist.

- [ ] **Step 3: Implement the exact modifier tables**

```ts
export const DANGEROUS_REALTIME_RISK_RULES = {
  0: { safeZonePct: 52, minBehaviorTicks: 32, maxChain: 1, tensionImpulsePermille: 800 },
  1: { safeZonePct: 50, minBehaviorTicks: 30, maxChain: 1, tensionImpulsePermille: 900 },
  2: { safeZonePct: 46, minBehaviorTicks: 28, maxChain: 2, tensionImpulsePermille: 1000 },
  3: { safeZonePct: 42, minBehaviorTicks: 25, maxChain: 2, tensionImpulsePermille: 1120 },
  4: { safeZonePct: 38, minBehaviorTicks: 22, maxChain: 3, tensionImpulsePermille: 1250 },
  5: { safeZonePct: 34, minBehaviorTicks: 19, maxChain: 3, tensionImpulsePermille: 1400 },
} as const;

export function dangerousRealtimeLevelBonuses(level: number) {
  const endgame = Math.max(0, Math.min(50, Math.floor(level) - 50));
  return {
    reelEfficiencyPct: Math.floor((endgame * 12) / 50),
    tensionControlPct: Math.floor((endgame * 8) / 50),
  };
}
```

Replace bait rarity weighting as the active realtime effect while retaining the serialized bait IDs, prices, pack sizes, and counts.

Implement the exact one-bait-per-encounter effects:

- `basic_bait`: no additional effect.
- `reef_bait`: `turn` distance recovery and tension impact reduced by 20%.
- `blood_bait`: stamina damage during `charge` and `thrash` increased by 20%.
- `luminous_bait`: reveal the next one behavior and reduce `dive` speed by 15%.
- `abyss_bait`: starting stamina reduced by 10% and every behavior's tension impulse reduced by 12%.

Apply equipped enhancement levels exactly once when the encounter config is created: rod `+6%` stamina damage per level, reel `+5%` distance recovery per level, and line `+3%p` safe-zone width plus `+2%p` cargo protection per level.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the modifier catalog**

```bash
git add src/adventure/data/v2/dangerousFishing.ts src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingHeritage.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts
git commit -m "feat: define dangerous fishing realtime modifiers"
```

### Task 2: Deterministic fixed-tick simulation

**Files:**
- Create: `src/adventure/v2/dangerousFishingRealtime.ts`
- Create: `src/adventure/v2/dangerousFishingRealtime.test.ts`

**Interfaces:**
- Consumes: `DANGEROUS_REALTIME_RISK_RULES` and the output of `dangerousRealtimeModifiers`.
- Produces: `DangerousRealtimeConfig`, `DangerousRealtimeState`, `DangerousRealtimeInput`, `createDangerousRealtimeState`, `advanceDangerousRealtimeTick`, `replayDangerousRealtimeInputs`, and `dangerousRealtimeView`.

- [ ] **Step 1: Write failing deterministic simulation tests**

```ts
const config = fixtureRealtimeConfig({ seed: 7123, risk: 3 });
const inputs = [
  { tick: 0, mode: "release" as const },
  { tick: 14, mode: "reel" as const },
  { tick: 67, mode: "release" as const },
];
expect(replayDangerousRealtimeInputs(config, inputs, 90)).toEqual(
  replayDangerousRealtimeInputs(config, inputs, 90),
);
expect(advanceDangerousRealtimeTick(
  fixtureRealtimeState({ tension: 1001, maxTension: 1000 }),
  config,
  "reel",
).status).toBe("line_broken");
```

Cover reel/release progress, hook loss, all four behaviors, readable telegraphs, timeout, catch, and the 35% aggregate reduction cap.

- [ ] **Step 2: Run the simulation test and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtime.test.ts`

Expected: FAIL because the realtime simulation exports do not exist.

- [ ] **Step 3: Implement integer state transitions and seeded behavior**

```ts
export const DANGEROUS_REALTIME_TICK_MS = 50;
export type DangerousRealtimeMode = "reel" | "release";
export type DangerousRealtimeInput = { tick: number; mode: DangerousRealtimeMode };
export type DangerousRealtimeStatus =
  | "active"
  | "caught"
  | "line_broken"
  | "hook_lost"
  | "timeout";

export function replayDangerousRealtimeInputs(
  config: DangerousRealtimeConfig,
  inputs: readonly DangerousRealtimeInput[],
  targetTick: number,
  initial?: DangerousRealtimeState,
): DangerousRealtimeState;
```

Use a local integer PRNG whose state is part of `DangerousRealtimeState`; never call `Math.random()` during replay. Reject non-increasing transitions, negative ticks, and ticks after `maxTicks` in a separate validator exported for server use.

- [ ] **Step 4: Run the simulation test and confirm GREEN**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts`

Expected: all tests pass with byte-for-byte equal replay states.

- [ ] **Step 5: Commit the simulation**

```bash
git add src/adventure/v2/dangerousFishingRealtime.ts src/adventure/v2/dangerousFishingRealtime.test.ts
git commit -m "feat: add deterministic dangerous fishing simulation"
```

### Task 3: Versioned encounter persistence and completion records

**Files:**
- Modify: `src/adventure/v2/dangerousFishingState.ts`
- Modify: `src/adventure/v2/dangerousFishingState.test.ts`
- Modify: `src/adventure/v2/dangerousFishingEncounter.ts`
- Modify: `src/adventure/v2/dangerousFishingEncounter.test.ts`

**Interfaces:**
- Produces: `DangerousRealtimeEncounter`, `DangerousRealtimeCompletion`, `isDangerousRealtimeEncounter`, and parsers for v1/v2 encounter unions.
- A v2 encounter stores `{ simulationVersion: 2, id, targetKind, targetId, config, checkpoint, approvedTick, revision, startedAt, expiresAt }`.
- `DangerousFishingState.realtimeCompletions` stores at most 32 completion results for duplicate finish responses.

- [ ] **Step 1: Write failing parser and migration tests**

```ts
const parsedV1 = parseDangerousFishingState(v1EncounterFixture());
expect(parsedV1.voyage?.encounter).toMatchObject({ simulationVersion: 1 });

const parsedV2 = parseDangerousFishingState(v2EncounterFixture());
expect(isDangerousRealtimeEncounter(parsedV2.voyage?.encounter)).toBe(true);
expect(parseDangerousFishingState({
  ...v2StateFixture(),
  gearEnhancements: undefined,
}).gearEnhancements).toEqual({ rods: {}, reels: {}, lines: {} });
```

Also cover malformed configs, capped completion history, and preservation of cargo, codex, bait, loadout, boss contribution fields, and `resolvedEncounterIds`.

- [ ] **Step 2: Run state tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingEncounter.test.ts`

Expected: FAIL because v2 encounter and enhancement fields are absent.

- [ ] **Step 3: Implement the versioned union without rewriting v1 values**

```ts
export type DangerousStoredEncounter =
  | (DangerousEncounter & { simulationVersion: 1 })
  | DangerousRealtimeEncounter;

export function isDangerousRealtimeEncounter(
  value: DangerousStoredEncounter | null | undefined,
): value is DangerousRealtimeEncounter {
  return value?.simulationVersion === 2;
}
```

Treat a missing `simulationVersion` as v1 during parsing. Do not change the save key `dangerous-fishing.v1`; only increment the internal state version.

- [ ] **Step 4: Run state tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingEncounter.test.ts`

Expected: all v1 and v2 parser tests pass.

- [ ] **Step 5: Commit persistence compatibility**

```bash
git add src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingEncounter.ts src/adventure/v2/dangerousFishingEncounter.test.ts
git commit -m "feat: persist versioned dangerous fishing encounters"
```

### Task 4: Normal encounter realtime service and Route Handler

**Files:**
- Create: `src/lib/server/dangerousFishingRealtimeService.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`
- Modify: `src/app/api/v2/dangerous-fishing/encounter/route.ts`
- Modify: `src/lib/server/dangerousFishingService.ts`

**Interfaces:**
- Produces: `startRealtimeEncounterInTx`, `checkpointRealtimeEncounterInTx`, and `finishRealtimeEncounterInTx`.
- POST actions are `start_realtime`, `checkpoint`, and `finish`; existing `start`, `reel`, `give`, and `brace` remain v1-only.

- [ ] **Step 1: Add failing Route Handler tests**

```ts
const started = await ENCOUNTER(request("encounter", {
  action: "start_realtime",
  baitId: "basic_bait",
}));
expect(await started.json()).toMatchObject({
  ok: true,
  encounter: { simulationVersion: 2, approvedTick: 0, revision: 0 },
});

const duplicate = await finishRealtime({ requestId: FINISH_ID });
expect(await finishRealtime({ requestId: FINISH_ID })).toEqual(duplicate);
expect(savedDangerousState().voyage?.cargo).toHaveLength(1);
```

Cover checkpoint revision conflicts, input validation, actual elapsed tick bounds, 30-second late-submit grace, finish idempotency, caught reward atomicity, failure preserving existing cargo, and checkpoint requests after completion returning the stored authoritative result.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `npx vitest run src/lib/server/dangerousFishingRoute.test.ts`

Expected: FAIL because `start_realtime`, `checkpoint`, and `finish` are rejected.

- [ ] **Step 3: Implement transactional realtime operations**

```ts
export async function checkpointRealtimeEncounterInTx(
  tx: DbExecutor,
  userId: string,
  request: {
    encounterId: unknown;
    revision: unknown;
    inputs: unknown;
    clientTick: unknown;
    now: number;
  },
): Promise<RealtimeServiceResult>;
```

Lock the dangerous save before replay, validate every transition, store only the approved state/tick and incremented revision, and return the authoritative view. On finish, reuse the existing catch settlement sequence for XP, job mastery, wallet coins, activity guard, codex, cargo, and boss discovery. Store the first serializable result in `realtimeCompletions` before returning.

- [ ] **Step 4: Run normal route regression tests and confirm GREEN**

Run: `npx vitest run src/lib/server/dangerousFishingRoute.test.ts src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingRealtime.test.ts`

Expected: all v1 and v2 normal encounter tests pass.

- [ ] **Step 5: Commit the normal realtime API**

```bash
git add src/lib/server/dangerousFishingRealtimeService.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingRoute.test.ts src/app/api/v2/dangerous-fishing/encounter/route.ts
git commit -m "feat: add dangerous fishing realtime encounter API"
```

### Task 5: Boss realtime service and contribution settlement

**Files:**
- Create: `src/lib/server/dangerousFishingRealtimeBoss.ts`
- Modify: `src/lib/server/dangerousFishingBoss.ts`
- Modify: `src/lib/server/dangerousFishingBossRoute.test.ts`
- Modify: `src/app/api/v2/dangerous-fishing/boss/route.ts`

**Interfaces:**
- Produces: `startRealtimeBossAttemptInTx`, `checkpointRealtimeBossAttemptInTx`, and `finishRealtimeBossAttemptInTx`.
- Reuses `DangerousRealtimeInput` and the completion history from Tasks 2–3.

- [ ] **Step 1: Add failing boss start/checkpoint/finish tests**

```ts
const start = await BOSS(request("boss", {
  action: "start_realtime",
  eventId: EVENT_ID,
}));
expect(await start.json()).toMatchObject({
  ok: true,
  encounter: { simulationVersion: 2, targetKind: "boss" },
});

await finishBossRealtime({ requestId: FINISH_ID, caught: true });
expect(savedContribution().successfulAttempts).toBe(1);
await finishBossRealtime({ requestId: FINISH_ID, caught: true });
expect(savedContribution().successfulAttempts).toBe(1);
```

Cover active/expired/defeated events, invalid inputs, line failure, concurrent last haul, and preservation of prior contribution.

- [ ] **Step 2: Run boss route tests and confirm RED**

Run: `npx vitest run src/lib/server/dangerousFishingBossRoute.test.ts`

Expected: FAIL because boss realtime actions are unsupported.

- [ ] **Step 3: Implement boss replay before contribution mutation**

```ts
export async function finishRealtimeBossAttemptInTx(
  store: DangerousFishingBossStore,
  args: RealtimeBossFinishRequest,
): Promise<RealtimeBossResult>;
```

Replay and validate first. Only `caught` may decrement public stamina and increment contribution. Store the completion result in the player dangerous state within the same transaction so a retry cannot apply contribution twice.

- [ ] **Step 4: Run boss and normal route tests and confirm GREEN**

Run: `npx vitest run src/lib/server/dangerousFishingBossRoute.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBoss.test.ts`

Expected: all boss reward/claim tests and both encounter versions pass.

- [ ] **Step 5: Commit the boss realtime API**

```bash
git add src/lib/server/dangerousFishingRealtimeBoss.ts src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingBossRoute.test.ts src/app/api/v2/dangerous-fishing/boss/route.ts
git commit -m "feat: validate realtime dangerous fishing boss attempts"
```

### Task 6: Engine verification gate

**Files:**
- Modify only files required to fix failures found by this gate.

**Interfaces:**
- Produces a tested server foundation consumed by `2026-08-22-dangerous-fishing-realtime-client.md`.

- [ ] **Step 1: Run the complete engine and server regression set**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingEncounter.test.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts`

Expected: all tests pass with zero unhandled errors.

- [ ] **Step 2: Run static verification**

Run: `npx eslint src/adventure/data/v2/dangerousFishing.ts src/adventure/v2/dangerousFishingRealtimeModifiers.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/v2/dangerousFishingRealtime.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRealtimeService.ts src/lib/server/dangerousFishingRealtimeBoss.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingBoss.ts src/app/api/v2/dangerous-fishing/encounter/route.ts src/app/api/v2/dangerous-fishing/boss/route.ts`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 3: Confirm v1 remains the currently rendered client path**

Run: `rg -n 'start_realtime|DangerousFishingRealtime' src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingBossPanel.tsx`

Expected: no client integration yet; the new server actions are not the default UI path.

- [ ] **Step 4: Check whitespace and repository scope**

Run: `git diff --check && git status --short`

Expected: only intentional engine-plan changes remain; `.superpowers/` stays untracked and unstaged.
