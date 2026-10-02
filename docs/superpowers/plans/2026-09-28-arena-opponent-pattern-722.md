# Arena Opponent Pattern Conditions Implementation Plan

> **For agentic workers:** Execute inline in this session. The project AGENTS.md prohibits subagents unless explicitly requested.

**Goal:** Let arena players choose a skill using the opponent's weapon type and maximum MP.

**Architecture:** Add two condition variants to the shared pattern contract and parser. Carry actual equipped weapon type from combat derivation through PvP target state into pattern evaluation. Expose editor controls, arena summary, and manual guidance.

**Tech Stack:** TypeScript, React client component, Next.js 16, Vitest.

## Global Constraints

- Preserve existing patterns and defaults.
- Unknown target metadata makes the corresponding condition false.
- Compare maximum MP, never current MP.
- Preserve the user's unrelated dungeon edits in the original checkout.
- No deployment or external feedback write.

---

### Task 1: Pattern data and evaluation

**Files:** `src/adventure/v2/combat/combatPattern.ts`, `src/adventure/v2/combat/combatPattern.test.ts`

**Interfaces:** Produce `enemy_weapon` with `weaponType: V2WeaponType` and `enemy_max_mp` with `op: "atLeast" | "atMost"`, `value: number`; extend `V2PatternCtx` with optional `enemyWeaponType` and `enemyMaxMp`.

- [x] Add failing tests for valid and malformed parser input, condition boundaries, unknown metadata, and AND/OR use.
- [x] Run `npm test -- src/adventure/v2/combat/combatPattern.test.ts` and confirm expected failures.
- [x] Add condition types, evaluator cases and defensive parsing using the four `V2WeaponType` values and nonnegative integer MP threshold.
- [x] Rerun the same test file until green.

### Task 2: PvP combat data

**Files:** `src/adventure/v2/combat/engineState.ts`, `src/lib/server/derivePlayerCombatV2.ts`, `src/lib/server/derivePlayerCombatV2.test.ts`, `src/adventure/v2/combat/combatShared.ts`, `src/adventure/v2/combat/engine-pvp.ts`, `src/adventure/v2/combat/opponentPatternCondition.test.ts`

**Interfaces:** `PlayerCombat.weaponType?: V2WeaponType`; `V2SkillCastInput.target` gains optional `maxMp` and `weaponType`; `buildPatternCtx` maps these to `enemyMaxMp` and `enemyWeaponType`.

- [x] Add failing tests that a derived staff preserves its type and both PvP sides select a different skill using opponent weapon/max MP, including spent current MP and unknown weapon.
- [x] Run `npm test -- src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/opponentPatternCondition.test.ts` and confirm expected failures.
- [x] Fill the typed fields at derivation, PvP cast input, and shared pattern context. Do not populate target metadata on PvE cast inputs.
- [x] Rerun those tests until green.

### Task 3: Controls and communication

**Files:** `src/adventure/v2/V2CombatPatternView.tsx`, `src/adventure/v2/V2CombatPatternView.test.tsx`, `src/adventure/data/v2/arenaLoadout.ts`, `src/adventure/data/v2/arenaLoadout.test.ts`, `src/app/manual/content/skills.tsx`

**Interfaces:** Existing condition picker exposes both conditions; arena summary renders the selected weapon and MP threshold.

- [x] Add failing render and summary tests for both conditions and the arena combination example.
- [x] Run `npm test -- src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts` and confirm expected failures.
- [x] Add editor defaults, selectors and number input, summary labels, and manual guidance.
- [x] Rerun those tests until green.

### Task 4: Verification and commit

- [x] Run the focused test files plus `src/adventure/v2/combat/formulaCondition.test.tsx`.
- [x] Run `npx tsc --noEmit`, lint changed TypeScript files, and `git diff --check`.
- [x] Review diff against the design and commit on `feat/arena-opponent-pattern-722`.
- [x] Draft the reply for feedback #722 in the final response without sending it to the feedback system.

Verification: 9 related test files passed (469 tests). The relevant manual test passed. The full manual test file has an unrelated pre-existing job count assertion failure, reproduced on the original checkout.
