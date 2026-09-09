# Wind Mage Advancement Implementation Plan

Use superpowers:executing-plans inline; no subagents or repeated approval prompts per AGENTS.md.

Goal: Add aeromancer/stormbringer and an equipped-passive wind current loop.
Architecture: New windMageSkills catalog and pure windCurrent helper; minimal hooks in shared skill calculation/engine cast boundaries; reuse job advancement and passive derivation.

- [x] Catalog: failing windMageAdvancement tests for prerequisite boundaries, legacy/class mapping, growth, six skills and additive equipped passive bonuses. Implement separate catalog, registries, normalization tier/tempo and SP pricing.
- [x] Mechanic: failing windCurrent tests for cap3, pre-cast damage, gather/release/miss/disabled. Implement pure preview and finish transitions. Engine current lives only in BattleStacks/PvPSideStacks, never in saves.
- [x] Integration: failing windMageCombat tests for actual PvE/PvP casts, failed proc/MP/miss, generic spell isolation, scaling, ATB acceleration and FromSaves fields. Apply bonus before per-hit resolution and commit state/haste after hit confirmation. Preserve all old mechanics.
- [x] Presentation: register windCurrent in pattern union/parser/editor/labels/evaluator, supply snapshot and smart default condition. Add relevant behavior tests. Update catalog counts/SP totals.
- [x] Verification: focused and related combat suites, npx tsc --noEmit --incremental false with6GB Node heap, changed-file eslint, git diff --check and module budgets. Self-review and local commit only.

Files: src/adventure/data/v2/{windMageSkills,windMageAdvancement.test,windCurrent,windCurrent.test,v2Skills,v2JobCatalog,v2SkillsByJob,v2SkillsCommonCatalog}; src/adventure/v2/combat/{engine,engine-pvp,engineState,combatShared,combatPattern,playerResourceSnapshot,windMageCombat.test}; src/lib/server/derivePlayerCombatV2.ts; pattern UI/labels and relevant tests. Add small helpers if engine budgets require extraction, without increasing limits.

Verification (2026-09-09):
- Baseline: 162 tests/3 files passed before implementation.
- Red: missing catalogs/helper and unconnected engine resources failed as expected before implementation.
- Focused final: 183 tests/5 files passed.
- Related combat/catalog/presentation/editor regressions: 1,043 tests/93 files passed.
- TypeScript: NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental false passed.
- Changed-file ESLint, git diff --check, and all 12 module budgets passed.
- Self-review: shared helper reads pre-cast current; only landed direct hits finalize generation/consumption. PvP shield absorption still counts as a hit. Ordinary spells and unequipped passives do not receive bonuses. Optional aggregate fields preserve old snapshots. Removed a redundant physical-defense wrapper to keep engine within its existing budget.
- No deployment, push, or integration performed. Dreadnought worktree remains separate.
