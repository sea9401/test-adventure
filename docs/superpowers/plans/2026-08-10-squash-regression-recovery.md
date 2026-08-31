# August 10 Squash Regression Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the cumulative unique-equipment achievement, the confirmed 6T completion effects, and the post-defense-update cooperative boss balance that were overwritten by squash commit `5c6f55328`, while preserving every intentional August 10 feature.

**Architecture:** Treat `7dddf5a3e` as the known-good source only for the affected contracts. Restore individual functions, catalog entries, route hooks, and tests rather than reverting whole files or commits. Keep current poison, ranch, crafted-equipment enhancement, UI, and operational changes intact.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, Drizzle save transactions.

## Global Constraints

- Do not revert `5c6f55328` or replace current files wholesale.
- Do not deploy or change maintenance mode.
- Write and observe failing regression tests before production changes.
- Preserve current poison, ranch, dining, marketplace, skill, and crafted-equipment behavior.
- Use literal expected boss and set values from `7dddf5a3e`.

---

### Task 1: Restore cooperative boss balance

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`

**Interfaces:**
- Consumes: `coopBossForBattle`, `COOP_BOSSES`
- Produces: the six confirmed derived boss stat snapshots, lake stack damage `17`, and confirmed shared HP values.

- [ ] Add literal regression expectations for all six derived boss stat snapshots, shared HP, attack types, and lake stack damage.
- [ ] Run the focused tests and confirm failures against the regressed values.
- [ ] Restore only the boss base stats, accuracy, attack type, gimmick damage, and shared HP from `7dddf5a3e`.
- [ ] Run both cooperative boss test files and confirm they pass.

### Task 2: Restore 6T completion effects without losing later equipment fixes

**Files:**
- Modify: `src/adventure/data/v2/stormEquipmentRefinement.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`

**Interfaces:**
- Consumes: `V2_EQUIP_TAG_SETS`, `V2_EQUIPMENT`, `aggregateV2Equipment`
- Produces: 6-piece `천공질주`, `무풍연살`, and `만독순환` effects plus the confirmed Sangoon/6T stat distribution.

- [ ] Restore the behavior tests that require `[2,3,4,5,6]` thresholds and literal completion effects.
- [ ] Run the focused test and confirm the current `[2,3,4,5]` catalog fails.
- [ ] Restore the affected set thresholds and catalog stats from `7dddf5a3e`, preserving `on_action_evasion` and `parseInstanceEnhance` changes.
- [ ] Run equipment, signature, crafted-enhancement, and set tests.

### Task 3: Restore cumulative unique-equipment acquisition tracking

**Files:**
- Restore: `src/lib/server/uniqueEquipmentAchievement.ts`
- Restore: `src/lib/server/uniqueEquipmentAchievement.test.ts`
- Modify: `src/adventure/data/v2/v2Quests.ts`
- Modify: `src/adventure/data/v2/v2Quests.test.ts`
- Modify: `src/lib/server/v2QuestContext.ts`
- Modify: `src/lib/server/v2QuestContext.test.ts`
- Modify: `src/app/api/admin/v2-grant/route.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/app/api/v2/guild/workshop/route.ts`
- Modify: `src/app/api/v2/me/quests/route.ts`
- Modify: `src/app/api/v2/storm-expedition/route.ts`

**Interfaces:**
- Produces: `uniqueEquipmentAcquisitionProgress`, `ensureUniqueEquipmentAcquisitionBaseline`, and `recordUniqueEquipmentAcquisitions` backed by `adventure-log.v2.uniqueEquipmentAcquired`.
- Preserves: existing saved count, current owned unique instances, codex distinct unique entries, and already claimed milestone floors.

- [ ] Restore pure-function tests proving sold duplicates do not reduce cumulative progress and the baseline never decreases.
- [ ] Change quest tests to require `uniqueAcquired` and run them to confirm current-owned behavior fails.
- [ ] Restore the tracking module and route hooks selectively from `7dddf5a3e`.
- [ ] Run the unique tracking, quest context, quest catalog, and affected route tests.
- [ ] Document that acquisitions made and fully disposed during the regression window require logs for exact backfill; do not invent counts.

### Task 4: Audit the squash and verify the integrated recovery

**Files:**
- Modify only files shown by evidence to contain stale-base regressions.

**Interfaces:**
- Consumes: `git diff 7dddf5a3e..5c6f55328`
- Produces: an audit separating intended August 10 changes from stale-base overwrites.

- [ ] Review every non-document production-file reversal in the squash diff and classify it by originating feature commit.
- [ ] Run all focused regression suites, `npx tsc --noEmit`, `git diff --check`, and the full test suite if time permits.
- [ ] Confirm no ranch, poison, dining, mastery, marketplace, or crafted-enhancement changes were reverted.
- [ ] Commit the recovery as one local commit without pushing or deploying.
