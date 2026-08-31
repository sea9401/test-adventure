# Unexplored Live Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a deterministic, read-only simulator that compares unexplored difficulty 90, 95, and 100 against the live proficiency top 30 while preserving each character's actual job, equipment, proficiency, and combat loadout.

**Architecture:** Keep combat-profile construction and result analysis in two pure `src/adventure/data/v2` modules with focused Vitest coverage. A thin CLI under `scripts/` loads live snapshots with one SELECT-only PostgreSQL connection, prepares the existing combat derivation, runs the existing battle engine, and prints anonymized aggregate, player, job/build, and pool reports. No hunting API, save data, rewards, or live balance tables consume the candidate values.

**Tech Stack:** TypeScript 5, Vitest 4, node-postgres, the existing V2 combat engine and automatic action picker.

## Global Constraints

- Database access is SELECT-only; the simulator must never call a save writer or gameplay route.
- Rank by total `proficiency.v2.groups[*].cumLevel`, then current level descending, then character save update time ascending.
- Exclude administrator and actively banned accounts before taking the first 30 valid combat snapshots.
- Never print a user ID, email, game name, or raw save value.
- Simulate difficulty 90, 95, and 100 with 30 trials per player and monster using a fixed seed.
- Compare stat-only special monsters against mechanics-enabled special monsters.
- Use the five Star Grave monsters as the base-pool proxies and as the median baseline source.
- Do not modify live hunting, exploration nodes, rewards, drops, or final monster balance data.
- Do not deploy.
- Do not modify unrelated worktree files.

---

## File Structure

- Create `src/adventure/data/v2/unexploredSimulationMonsters.ts`: Star Grave proxy construction, median common baseline, relative-stat application, and conservative semantic-ability adapter.
- Create `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`: deterministic baseline and all-ability conversion regression coverage.
- Create `src/adventure/data/v2/unexploredSimulationAnalysis.ts`: proficiency ordering, build classification, percentiles, rates, grouping, and anonymized labels.
- Create `src/adventure/data/v2/unexploredSimulationAnalysis.test.ts`: ranking, classification, aggregation, and privacy regression coverage.
- Create `scripts/sim-unexplored-live-top.ts`: SELECT-only snapshot loading, actual combat preparation, seeded battle execution, and Korean console report.

---

### Task 1: Build candidate unexplored monsters

**Files:**
- Create: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Test: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

**Interfaces:**
- Consumes: `enemiesForDepth`, `V2_MONSTERS`, `scaleMonsterForHunt`, `UNEXPLORED_MONSTER_POOLS`, and the existing `Monster` type.
- Produces: `UnexploredSimulationMode`, `UnexploredSimulationMonster`, `unexploredBaseProxyMonsters(difficulty)`, `unexploredCommonBaseline(difficulty)`, `unexploredSpecialMonsters(difficulty, mode)`, and `unexploredSimulationMonsters(difficulty, mode)`.

- [ ] **Step 1: Write failing baseline tests**

```ts
import { describe, expect, it } from "vitest";
import {
  unexploredBaseProxyMonsters,
  unexploredCommonBaseline,
  unexploredSpecialMonsters,
} from "./unexploredSimulationMonsters";

describe("unexplored simulation monsters", () => {
  it("uses five Star Grave proxies at each requested difficulty", () => {
    const proxies = unexploredBaseProxyMonsters(90);
    expect(proxies).toHaveLength(5);
    expect(proxies.every((entry) => entry.kind === "base")).toBe(true);
    expect(proxies.every((entry) => entry.difficulty === 90)).toBe(true);
  });

  it("applies approved relative stats to one shared median baseline", () => {
    const baseline = unexploredCommonBaseline(90);
    const shieldman = unexploredSpecialMonsters(90, "stats").find(
      (entry) => entry.monsterId === "armored_shieldman",
    );
    expect(shieldman?.monster.hp).toBe(Math.max(1, Math.round(baseline.hp * 1.1)));
    expect(shieldman?.monster.def).toBe(Math.round(baseline.def * 1.55));
    expect(shieldman?.monster.skill).toBeUndefined();
    expect(shieldman?.monster.v2Skills).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new test and verify module-resolution failure**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL because `./unexploredSimulationMonsters` does not exist.

- [ ] **Step 3: Implement Star Grave baselines and stat-only conversion**

Use depth 84 only to identify the five Star Grave entries, but call `scaleMonsterForHunt(base, difficulty)` so 90, 95, and 100 extend the current curve. Preserve each proxy's authored `skill`, `atkType`, `critPct`, `evasionPct`, and entry status/cast skills. Compute a median for `hp`, `atk`, `def`, `magicDef`, `spd`, and `accuracy`; round all final integer stats, clamp HP/ATK to at least 1 and defenses to at least 0, set `exp: 0`, and omit drops and images.

Every returned record must contain:

```ts
type UnexploredSimulationMonster = {
  kind: "base" | "special";
  difficulty: 90 | 95 | 100;
  poolId: UnexploredPoolId | null;
  monsterId: string;
  monster: Monster;
};
```

- [ ] **Step 4: Run the baseline tests and verify they pass**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing mechanics-adapter tests**

Assert that mechanics mode produces exactly 36 special monsters, every approved ability ID is consumed, stat-only mode has no added mechanics, and these edge mappings hold:

```ts
expect(byId.armored_shieldman.monster.skill?.kind).toBe("brace");
expect(byId.rune_executor.monster.atkType).toBe("magic");
expect(byId.proliferating_core.monster.v2Skills?.equipped).toContain("v2_skill_recover");
expect(byId.combo_automaton.monster.bonusAttackChancePct).toBe(100);
expect(byId.phantom_stalker.monster.evasionPct).toBe(42);
expect(byId.venom_sprayer.monster.v2Skills?.equipped).toContain("mob_catastrophe_venom");
expect(byId.corrosive_colony.monster.v2Skills?.equipped).toContain("mob_venom_sunder");
expect(byId.frozen_sentinel.monster.v2Skills?.equipped).toEqual(
  expect.arrayContaining(["mob_glacial_chill", "mob_arcane_nova"]),
);
expect(byId.crust_destroyer.monster.v2MaxMp).toBe(60);
```

- [ ] **Step 6: Run the mechanics test and verify expected assertion failures**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL because mechanics mode has not applied ability fields.

- [ ] **Step 7: Implement the conservative ability adapter**

Use only existing engine vocabulary and these fixed sensitivity values:

- brace: fixed damage reduction 6; pierce: fixed armor pierce 11.
- heavy blow: every 3 enemy phases, multiplier 2.0; enrage: below 40% HP, ATK +12.
- status resistance: exactly 15% or 35%.
- high accuracy: baseline +20; very high accuracy: baseline +30.
- high crit: 38%; ordinary evasive profile: 30%, evasive crit: 35%, very high evasion: 42%.
- guaranteed bonus attack: 100%; mixed bonus/enrage profile: 50% plus the standard enrage.
- poison IDs: `mob_venom_bite`, `mob_catastrophe_venom`, `mob_venom_sunder`.
- bleed ID: `mob_rending_claw`; faster bleed is expressed by the approved SPD profile.
- slow IDs: `mob_chilling_touch`, `mob_deep_chill`, `mob_glacial_chill`.
- magic IDs: `mob_arcane_bolt`, `mob_arcane_burst`, and limited `mob_arcane_nova` with `atkType: "magic"`.
- recovery: `v2_skill_recover` with MP 16 for two uses and MP 32 for the extra-use variant.
- limited nova: MP 70; crushing blow: `mob_crushing_blow` with MP 60.

Where a monster needs both a legacy `skill` and V2 skills, preserve both fields. Deduplicate V2 skill IDs while retaining priority order in both `learned` and `equipped`.

- [ ] **Step 8: Run the monster tests and commit**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: PASS.

Commit:

```bash
git add src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts
git commit -m "feat: build unexplored simulation monsters"
```

---

### Task 2: Add ranking and result analysis helpers

**Files:**
- Create: `src/adventure/data/v2/unexploredSimulationAnalysis.ts`
- Test: `src/adventure/data/v2/unexploredSimulationAnalysis.test.ts`

**Interfaces:**
- Consumes: `PlayerCombat`, `V2SkillsState`, `V2_SKILLS`, `UnexploredPoolId`, and trial rows emitted by the CLI.
- Produces: `rankUnexploredCandidates`, `classifyUnexploredBuild`, `summarizeUnexploredRates`, `groupUnexploredRates`, `anonymousUnexploredRankLabel`, and their input/result types.

- [ ] **Step 1: Write failing ranking and anonymization tests**

Create candidates that prove ordering by total proficiency, current level, and updated time. Assert the returned first 30 contain no projected name, email, or ID fields, and that `anonymousUnexploredRankLabel(0)` is `01위` while rank 29 is `30위`.

- [ ] **Step 2: Run the tests and verify module-resolution failure**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationAnalysis.test.ts`

Expected: FAIL because `./unexploredSimulationAnalysis` does not exist.

- [ ] **Step 3: Implement ranking and anonymized projection**

Accept already eligibility-filtered candidates with `{ opaqueKey, totalCumLevel, level, updatedAtMs }`, return a sorted/sliced array that keeps `opaqueKey` only for in-process joins, and expose no function that formats it. The CLI must use the ordinal label for all output.

- [ ] **Step 4: Add failing build-classification tests**

Cover:

- physical when ATK is at least 1.2 times MATK;
- magic when MATK is at least 1.2 times ATK;
- mixed otherwise;
- evasion defense when `evaRating` is the dominant defensive axis;
- magic defense when `magicDef` exceeds physical DEF by at least 20%;
- physical defense when DEF exceeds magic defense by at least 20%;
- balanced otherwise;
- poison, bleed, slow, multiple-status, or no-status tags by scanning equipped skill effects rather than matching job names.

- [ ] **Step 5: Run the tests and verify classification failures**

Run: `npm test -- src/adventure/data/v2/unexploredSimulationAnalysis.test.ts`

Expected: FAIL because classification is not implemented.

- [ ] **Step 6: Implement classification and aggregate summaries**

Use explicit `wins` and `total` counters. Summaries must include rate percent, minimum, p25, median, p75, maximum, and counts at or above 20%, 40%, and 70%. Group rows by difficulty, mode, pool, job, and combined build label without treating a one-person group as a population average; every grouped result includes `samplePlayers`.

- [ ] **Step 7: Add and pass aggregation edge tests**

Test empty input, all-loss, all-win, percentile ordering, uneven trial totals, and a one-player group. Verify rates are weighted by trials while player percentiles use individual player rates.

Run: `npm test -- src/adventure/data/v2/unexploredSimulationAnalysis.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the analysis helpers**

```bash
git add src/adventure/data/v2/unexploredSimulationAnalysis.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
git commit -m "feat: analyze unexplored simulation results"
```

---

### Task 3: Add the read-only live simulation CLI

**Files:**
- Create: `scripts/sim-unexplored-live-top.ts`

**Interfaces:**
- Consumes: the two pure modules from Tasks 1 and 2, existing save-derived combat helpers, `resolveBattle`, `pickAutoAction`, `totalCumLevel`, and `createDatabaseConnectionOptions`.
- Produces: a standalone command whose standard output contains no account identifiers.

- [ ] **Step 1: Implement snapshot loading and candidate preparation**

Issue one SQL statement that selects users, `banned_until`, relevant `saves_kv` values, and the `character.v2` update time. Load these save keys exactly:

```ts
const SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "proficiency.v2",
  "skills.v2",
  "fishing-codex.v1",
  "equipment-codex.v1",
  "farm.v2",
  "cooking.v2",
  "woodcutting-log.v1",
  "mining-log.v1",
  "guide-quests.v2",
] as const;
```

Filter active bans and administrator emails before sorting. Parse proficiency with the existing parser and `totalCumLevel`. Prepare skills through `sanitizeCombatLoadout`, then derive combat through `derivePlayerCombatV2FromSaves`. Keep loading and output read-only.

- [ ] **Step 2: Implement deterministic battle execution**

For each of 30 players, three difficulties, and both `stats` and `mechanics` modes, run 30 trials against all 36 special monsters. Run the five base proxies once per difficulty because they are identical across special modes. Reset the player to full HP and MP for each battle, use the existing automatic action picker with no potions, and pass the difficulty as the battle depth.

Wrap the global seeded RNG replacement in `try/finally`. If a battle throws, rethrow with only anonymous rank, difficulty, mode, and monster ID.

- [ ] **Step 3: Print the anonymized Korean report**

Print in this order:

1. snapshot time, eligible/invalid counts, seed, and trial count;
2. anonymous top-30 build table with total proficiency, job, build tags, HP, ATK, MATK, DEF, MDEF, SPD, and evasion rating;
3. difficulty summary for base, stat-only special, and mechanics special results;
4. per-player difficulty rows with easiest/hardest mechanics pool;
5. per-pool rows with stat-only/mechanics rates and delta;
6. job and build groups with sample size;
7. automatic flags for stable farmers at 70%+, pools that block at least 80% of players below 5%, and wins concentrated at least 70% in one job or build group.

- [ ] **Step 4: Verify static checks and commit**

Run:

```bash
npx eslint scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredSimulationAnalysis.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
npx tsc --noEmit
npm test -- src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
```

Expected: all commands exit 0.

Commit:

```bash
git add scripts/sim-unexplored-live-top.ts
git commit -m "feat: simulate unexplored live top players"
```

---

### Task 4: Run and interpret the live snapshot

**Files:**
- No repository file changes required.

**Interfaces:**
- Consumes: production `DATABASE_URL` and the completed CLI.
- Produces: an anonymized evidence-backed recommendation for difficulty 90, 95, and 100.

- [ ] **Step 1: Run the simulator against the production snapshot**

Run:

```bash
node --env-file=/run/adventure-rpg/production.env --env-file=.env.production --import tsx scripts/sim-unexplored-live-top.ts
```

If the host-only environment file is unavailable locally, retry with `.env.production` only. If sandbox networking blocks the database, request narrowly scoped approval for this read-only command.

- [ ] **Step 2: Interpret the output using the approved criteria**

Report whether difficulty 90 produces intermittent wins across multiple jobs/builds without any 70% stable farmer, whether 95 leaves only exceptional matchup wins, and whether 100 preserves future headroom. Identify pool hard counters and separate stat-shape effects from mechanics effects.

- [ ] **Step 3: Recommend a baseline without changing gameplay data**

If the raw curve is too easy or too hard, calculate a candidate unexplored-only common HP/ATK multiplier and state which axis needs adjustment. Do not edit dungeon scaling, monster catalogs, or live content in this task.
