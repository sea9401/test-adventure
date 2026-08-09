# Coop Boss Defense Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalibrate all six cooperative bosses against the new defense, evasion-reduction, and magic-barrier rules with deterministic synthetic gates and an anonymized read-only live audit.

**Architecture:** Reuse the level-design progression builder as the single source for seven representative player archetypes, then run the real `coopBossForBattle → resolveBattle` 20-turn path in a deterministic simulator. Keep boss anchor depths and mechanics stable; tune authored boss stats directly, and change shared HP only when contribution ratios require it.

**Tech Stack:** TypeScript, Node.js with `tsx`, Vitest, the existing v2 combat engine and PostgreSQL read-only live snapshot script.

## Global Constraints

- Do not deploy to any environment.
- Do not modify or discard the user's existing changes in `src/adventure/data/v2/monsterScale.ts`, `src/adventure/data/v2/dungeon.test.ts`, `src/adventure/v2/V2LoadoutPanel.tsx`, or `src/adventure/v2/V2LoadoutPanel.test.tsx`.
- Keep `anchorDepth`, enrage stages, boss skills, summon costs, attack costs, cooldowns, and reward thresholds unchanged.
- Do not add cooperative-boss-specific multiplier fields.
- Use the actual cooperative battle options: `isBoss: true`, `maxTurns: 20`, no potions, and `pickAutoAction` with empty rules.
- Use seven deterministic archetypes: `STR`, `DEX`, `VIT`, `INT`, `SPI`, `LUK`, and `BAL`.
- Run 200 fixed-seed trials per boss/archetype combination for balance gates.
- Never print or persist live user IDs, email addresses, names, or individual equipment.
- Production access is read-only; no deployment and no database writes.

---

### Task 1: Export representative progression snapshots

**Files:**
- Modify: `scripts/sim-v2-level-design.ts`
- Test: `src/adventure/data/v2/levelDesignSim.test.ts`

**Interfaces:**
- Consumes: existing private `snapshotFor`, `minimumProgressionFor`, `ProgressionSnapshot`, and `V2SkillsState`.
- Produces:

```ts
export type LevelDesignProgressionSnapshot = {
  arch: LevelDesignArchetype;
  depth: number;
  power: number;
  currentJobId: string;
  player: PlayerCombat;
  v2Skills: V2SkillsState;
};

export function buildLevelDesignProgressionSnapshot(options: {
  arch: LevelDesignArchetype;
  depth: number;
  seed?: number;
  enhanceLevel?: number;
  careerWins?: number;
  cultivate?: boolean;
}): LevelDesignProgressionSnapshot;
```

When `careerWins` is absent, build the existing minimum progression snapshot for the depth. When present, build the fixed-career snapshot with `snapshotFor`. Return `v2Skills.learned` and `v2Skills.equipped` as copies of `snapshot.equippedSkills`.

- [ ] **Step 1: Add a failing public-snapshot test**

Add to `levelDesignSim.test.ts`:

```ts
import {
  buildLevelDesignProgressionSnapshot,
  LEVEL_DESIGN_ARCHETYPES,
} from "../../../../scripts/sim-v2-level-design";

it("협동 보스 시뮬레이션용 대표 성장 표본은 7계보의 전투 스탯과 장착 스킬을 공개한다", () => {
  const snapshots = LEVEL_DESIGN_ARCHETYPES.map((arch) =>
    buildLevelDesignProgressionSnapshot({ arch, depth: 24, seed: 20260809 }),
  );
  expect(snapshots).toHaveLength(7);
  expect(snapshots.every((snapshot) => snapshot.player.maxHp > 0)).toBe(true);
  expect(snapshots.every((snapshot) => snapshot.v2Skills.equipped.length > 0)).toBe(true);
  expect(snapshots.map((snapshot) => snapshot.arch)).toEqual(LEVEL_DESIGN_ARCHETYPES);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/adventure/data/v2/levelDesignSim.test.ts`

Expected: FAIL because `buildLevelDesignProgressionSnapshot` is not exported.

- [ ] **Step 3: Implement the minimal snapshot interface**

Export `ProgressionSnapshot` as the narrower public type above and add the wrapper immediately after `minimumProgressionFor`. Clamp the optional numeric inputs with the same defaults already used by `auditFixedProgressionCombat`: seed `20260809`, enhancement `0`, and `cultivate: true`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/adventure/data/v2/levelDesignSim.test.ts`

Expected: all tests in the file pass.

- [ ] **Step 5: Commit the snapshot API**

```bash
git add scripts/sim-v2-level-design.ts src/adventure/data/v2/levelDesignSim.test.ts
git commit -m "test: expose coop balance progression snapshots"
```

### Task 2: Build the deterministic cooperative-boss simulator

**Files:**
- Create: `scripts/sim-v2-coop-boss.ts`
- Create: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildLevelDesignProgressionSnapshot`, `LEVEL_DESIGN_ARCHETYPES`, `COOP_BOSSES`, `coopBossForBattle`, `COOP_ATTACK_TURNS`, `resolveBattle`, and `pickAutoAction`.
- Produces:

```ts
export type CoopBossTrialAudit = {
  survived: boolean;
  playerHpRatio: number;
  damageDealt: number;
  contributionRatio: number;
};

export type CoopBossBuildAudit = {
  arch: LevelDesignArchetype;
  survivalRatePct: number;
  medianPlayerHpRatio: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
};

export type CoopBossAudit = {
  bossId: CoopBossKindId;
  builds: CoopBossBuildAudit[];
  medianSurvivalRatePct: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
};

export function withSeededRandom<T>(seed: number, run: () => T): T;
export function auditCoopBossForPlayer(args: {
  bossId: CoopBossKindId;
  player: PlayerCombat;
  skills: V2SkillsState;
  trials: number;
  seed: number;
}): CoopBossTrialAudit[];
export function buildCoopBossBalanceReport(options?: {
  trials?: number;
  seed?: number;
  bossIds?: readonly CoopBossKindId[];
}): CoopBossAudit[];
```

Normal bosses use minimum progression at their current anchor depth. Both hard bosses use fixed career wins `500_000`, depth `78`, cultivation enabled, and enhancement level `12`. Each trial gets a seed hashed from the root seed, boss ID, archetype, and trial index so report order cannot change the result.

- [ ] **Step 1: Write failing simulator behavior tests**

Create `coopBossBalance.test.ts` with three tests:

```ts
it("협동 보스 보고서는 6종과 7계보를 실제 20턴 전투로 집계한다", () => {
  const report = buildCoopBossBalanceReport({ trials: 2, seed: 20260809 });
  expect(report).toHaveLength(6);
  expect(report.every((boss) => boss.builds.length === 7)).toBe(true);
  expect(report.every((boss) => boss.builds.every((build) =>
    build.medianContributionRatio >= 0 && build.medianContributionRatio <= 1,
  ))).toBe(true);
});

it("같은 시드의 보고서는 보스 실행 순서와 무관하다", () => {
  const ids = ["mountain_chief", "void_priest"] as const;
  const forward = buildCoopBossBalanceReport({ trials: 2, seed: 77, bossIds: ids });
  const reverse = buildCoopBossBalanceReport({ trials: 2, seed: 77, bossIds: [...ids].reverse() });
  expect(reverse.reverse()).toEqual(forward);
});

it("시뮬레이션 콜백이 실패해도 전역 난수 함수는 복원한다", () => {
  const original = Math.random;
  expect(() => withSeededRandom(1, () => { throw new Error("boom"); })).toThrow("boom");
  expect(Math.random).toBe(original);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL because `scripts/sim-v2-coop-boss.ts` does not exist.

- [ ] **Step 3: Implement the simulator and CLI**

Implement the interfaces above. Use the full shared HP as both `monster.hp` and `initialEnemyHp`, calculate damage as `sharedMaxHp - finalState.enemyHp`, and calculate survival as `finalState.playerHp > 0`. Disable combat log collection while running and restore both the log setting and `Math.random` in `finally` blocks. Reject trial counts outside `1..200`, unknown boss IDs, empty builds, and non-finite aggregate values with explicit errors.

Add the script:

```json
"sim:coop-boss": "node --import tsx scripts/sim-v2-coop-boss.ts"
```

The CLI supports `--trials=N`, `--seed=N`, and `--json`; the default is 200 trials and seed `20260809`.

- [ ] **Step 4: Run simulator tests and a smoke report**

Run:

```bash
npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts
npm run sim:coop-boss -- --trials=2 --json
```

Expected: tests pass; JSON contains six bosses and seven builds per boss with finite metrics.

- [ ] **Step 5: Commit simulator infrastructure**

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/data/v2/coopBossBalance.test.ts package.json
git commit -m "test: add deterministic coop boss simulator"
```

### Task 3: Add RED balance gates and recalibrate six bosses

**Files:**
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Consumes: `buildCoopBossBalanceReport({ trials: 200, seed: 20260809 })`.
- Produces: authored boss stats that satisfy the approved survival and contribution bands without changing anchors or mechanics.

- [ ] **Step 1: Add the failing approved-bands test**

Add a single cached report at module scope and assertions with these exact targets:

```ts
const BALANCE_TARGETS = {
  mountain_chief: { survival: [90, 100], contribution: [0.03, 0.08] },
  canyon_predator: { survival: [85, 100], contribution: [0.03, 0.08] },
  lake_sovereign: { survival: [75, 95], contribution: [0.03, 0.08] },
  void_priest: { survival: [65, 90], contribution: [0.03, 0.08] },
  mountain_chief_hard: { survival: [35, 70], contribution: [0.02, 0.05] },
  abyssal_tyrant: { survival: [35, 70], contribution: [0.02, 0.05] },
} as const;
```

Assert each median against its range, every boss's contribution p95 `<= 0.15`, hard Sangoon `VIT` and `DEX` survival `>= 75`, abyssal tyrant `INT` and `SPI` survival `>= 75`, and at least two non-counter archetypes per hard boss with survival `>= 50`.

- [ ] **Step 2: Run the 200-trial test and verify RED**

Run: `npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL on one or more survival/contribution assertions with the current authored boss stats. Record the baseline report from `npm run sim:coop-boss -- --json` in the work log; do not alter targets to match the baseline.

- [ ] **Step 3: Tune one boss axis at a time**

Use this order for each boss:

1. Adjust base `atk` until survival is in range.
2. Adjust base `accuracy` only when counter ordering is wrong after ATK tuning.
3. Adjust base `def` or `magicDef` only when damage contribution differs by damage archetype rather than globally.
4. Adjust `sharedMaxHp` only when contribution median remains outside the target for all archetypes.

After every single-axis change, run:

```bash
npm run sim:coop-boss -- --trials=50 --json
```

Do not change `anchorDepth`, enrage stages, skills, summon costs, attack costs, cooldowns, or tier thresholds.

- [ ] **Step 4: Update exact catalog expectations**

Update the fixed derived-stat assertions in `coopBosses.test.ts` to the final full-HP values emitted by `coopBossForBattle`. Add exact expectations for all six bosses' `atk`, `def`, `magicDef`, and `accuracy`, using `toBeCloseTo` for fractional accuracy.

- [ ] **Step 5: Verify all balance and catalog tests GREEN**

Run:

```bash
npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts src/adventure/data/v2/coopBosses.test.ts
```

Expected: both files pass with all approved bands and exact catalog values.

- [ ] **Step 6: Commit the calibrated data**

```bash
git add src/adventure/data/v2/coopBossBalance.test.ts src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "balance: recalibrate coop bosses for defense update"
```

### Task 4: Add anonymized live cross-check and document operations

**Files:**
- Modify: `scripts/sim-live-top-combat.ts`
- Modify: `docs/v2-coop-boss-plan.md`

**Interfaces:**
- Consumes: existing `loadTopPlayers`, `auditCoopBossForPlayer`, `COOP_BOSSES`, and the six calibrated boss definitions.
- Produces: `--coop-only` output with aggregate boss-level survival and contribution percentiles only.

- [ ] **Step 1: Add a failing anonymous-summary test**

Export a pure helper from `sim-live-top-combat.ts`:

```ts
export function summarizeLiveCoopAudits(
  rows: readonly { bossId: CoopBossKindId; survived: boolean; contributionRatio: number }[],
): readonly {
  bossId: CoopBossKindId;
  survivalRatePct: number;
  minContributionRatio: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
}[];
```

Add to `coopBossBalance.test.ts` a test with two boss IDs and several anonymous rows. Assert exact aggregate values and assert that `JSON.stringify(summary)` contains none of the sentinel identity strings placed on the input objects.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL because `summarizeLiveCoopAudits` is not exported.

- [ ] **Step 3: Implement `--coop-only`**

Add `COOP_ONLY = process.argv.includes("--coop-only")`. After loading the top players, run each player against each full-HP boss with `auditCoopBossForPlayer`, aggregate only the interface above, print boss ID/name plus survival and min/median/p95 contribution percentages, and return before normal-hunt or storm output. Do not include rank, job, power, name, email, user ID, or equipment in this branch.

Because the test imports this script, replace the unconditional `void main()` call with a
`pathToFileURL(process.argv[1]).href === import.meta.url` main-module guard. Direct CLI execution must
still route errors to `console.error` and set `process.exitCode = 1`; importing the summary helper must
not open a database connection.

- [ ] **Step 4: Document commands and invariants**

Append a 2026-08-09 defense-rebalance section to `docs/v2-coop-boss-plan.md` with:

```bash
npm run sim:coop-boss
node --env-file=.env.production --import tsx scripts/sim-live-top-combat.ts --coop-only
```

Document the six survival/contribution bands, the 15% p95 cap, read-only production access, and the rule that `anchorDepth` remains the content-stage anchor while authored base stats are cooperative balance dials.

- [ ] **Step 5: Run live read-only cross-check**

Run: `node --env-file=.env.production --import tsx scripts/sim-live-top-combat.ts --coop-only`

Expected: six aggregate rows, no identities, no SQL writes, and no empty-player error. If sandboxed network access fails, rerun the exact command with approval for read-only production access.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test -- --run src/adventure/data/v2/coopBossBalance.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/levelDesignSim.test.ts
npx tsc --noEmit
npm run sim:coop-boss -- --json
git diff --check
```

Expected: all tests pass, TypeScript exits 0, the 200-trial report satisfies every approved band, and `git diff --check` exits 0.

- [ ] **Step 7: Commit live audit and docs**

```bash
git add scripts/sim-live-top-combat.ts docs/v2-coop-boss-plan.md
git commit -m "chore: add coop boss live balance audit"
```
