# Evasion Reaction for On-Dodge Gear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** 일반 회피도가 직접 피해를 실제로 줄였을 때, 그 경감률과 같은 확률로 기존 `on_dodge` 장비 효과를 공격 행동당 한 번 발동시킨다.

**Architecture:** `signatureEffects.ts`에 장착 효과 존재 여부, 실제 정수 피해 감소 여부, 경감률 확률 판정을 한곳에서 처리하는 순수 헬퍼를 추가한다. PvE/PvP의 기본 공격 및 방어자가 플레이어인 직접 피해 스킬 경로는 이 헬퍼의 결과만 받아 HP·속도 버프·로그·회복 연계 보호막을 적용한다. PvE 플레이어 회피 경감률 계산은 기본 공격과 몬스터 스킬이 같은 계산을 공유하도록 추출한다.

**Tech Stack:** TypeScript, Vitest, Next.js 프로젝트 기존 전투 엔진

## Global Constraints

- 배포하지 않는다.
- 보장 회피는 기존처럼 공격 전체를 무효화하고 `on_dodge`를 정확히 한 번 발동시키며, 일반 회피 확률 판정을 추가로 하지 않는다.
- 일반 회피 반응은 직접 피해의 경감 전/후 정수 합계가 실제로 감소했을 때만 판정한다.
- 판정식은 `roll * 100 < reductionPct`이며 공격 행동 또는 스킬 시전당 한 번만 굴린다.
- `on_dodge` 장비가 없으면 난수를 추가로 소비하지 않아 기존 전투 난수열을 보존한다.
- 발동 후 방어자가 생존한 경우에만 회복/속도 효과를 적용한다. 회복은 최대 HP를 넘지 않는다.
- DoT, 상태이상 피해, 반사, 가드 및 별도 피해 무효화는 일반 회피 반응을 발동시키지 않는다.

---

### Task 1: Add the shared evasion-reaction decision helper

**Files:**
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.ts`

- [ ] Add unit tests for a new `rollEvasionReaction` helper covering a successful 30% boundary roll (`0.299`), failed boundary roll (`0.3`), no integer damage reduction, no `on_dodge` effect, invalid percentages/rolls, and a combined heal plus strongest speed result with preserved labels.
- [ ] Run `npm test -- src/adventure/v2/combat/signatureEffects.test.ts` and confirm the new tests fail because the helper does not exist.
- [ ] Implement `rollEvasionReaction(signatures, maxHp, reductionPct, damageBefore, damageAfter, roll = Math.random)` in `signatureEffects.ts`. Return `null` before calling `roll` unless damage decreased, percentage is finite and positive, and at least one supported `on_dodge` effect exists. On success return the aggregated heal amount/labels and strongest speed buff.
- [ ] Keep `onDodgeHealAmount` and `onDodgeSpeedBuff` as the existing guaranteed-evade APIs; reuse them where helpful without changing their behavior.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `test: define evasion reaction trigger semantics`

### Task 2: Update all on-dodge tooltip wording

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`

- [ ] Change the tooltip expectations to `회피 경감률과 같은 확률로 피격 후 HP +N% 회복` and `회피 경감률과 같은 확률로 피격 후 속도 +N% (M행동)`.
- [ ] Run `npm test -- src/adventure/data/v2/v2Equipment.test.ts` and confirm the old wording causes the new assertions to fail.
- [ ] Update only the `signatureLabel` `on_dodge` branch to produce the approved wording.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `fix: clarify on-dodge evasion reaction tooltips`

### Task 3: Activate reactions for PvE basic attacks

**Files:**
- Modify: `src/adventure/battle/engine.test.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`

- [ ] Add regression tests that equip healing and speed `on_dodge` signatures, force a successful roll, and verify one post-hit heal/speed activation and item-labelled logs when normal evasion reduces a basic attack.
- [ ] Add negative coverage that verifies no reaction when rounding produces no actual damage reduction and no extra random call when no `on_dodge` signature is equipped.
- [ ] Run `npm test -- src/adventure/battle/engine.test.ts` and confirm the new positive tests fail.
- [ ] Apply `rollEvasionReaction` once after the attack damage is resolved and only when the defender survives. Cap HP, merge the strongest speed buff without weakening an active buff, emit item-labelled logs, and pass actual healing through the existing `healToShield` interaction.
- [ ] Extract/export the existing PvE player-versus-monster evasion reduction calculation from `engine.enemyPhase.ts` so monster skills can reuse exactly the same combat modifiers.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `fix: trigger on-dodge gear from pve evasion reduction`

### Task 4: Activate reactions for PvE monster direct-damage skills

**Files:**
- Modify: `src/adventure/v2/combat/engine.monsterMpSkillCap.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`

- [ ] Add a direct `applyEnemyV2SkillCast` test proving normal evasion reduces monster skill damage and a successful reaction roll heals once after the cast.
- [ ] Add legacy-loop coverage proving the inline monster-skill path has the same reduction and one-roll reaction semantics.
- [ ] Preserve the existing guaranteed-evade test and assert it does not also add the normal reaction roll.
- [ ] Run `npm test -- src/adventure/v2/combat/engine.monsterMpSkillCap.test.ts` and confirm the new normal-evasion tests fail.
- [ ] In both ATB helper and legacy inline paths, compute the shared PvE evasion reduction, apply it only to direct skill damage before later mitigation/shields, log the actual reduction, and invoke `rollEvasionReaction` once after damage if the player survives.
- [ ] Apply reaction healing, speed, item-labelled logs, and heal-to-shield consistently in both paths. Do not alter DoT/debuff application on normal evasion.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `fix: react to evasion-reduced monster skills`

### Task 5: Activate reactions for PvP basic attacks

**Files:**
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`

- [ ] Add tests proving normal PvP evasion reduction can trigger defender healing and speed exactly once, uses PvP healing scaling, and does not fire when the defender dies.
- [ ] Add no-signature/random-stream coverage for the basic-attack path.
- [ ] Run `npm test -- src/adventure/battle/engine-pvp.test.ts` and confirm the new positive tests fail.
- [ ] Invoke `rollEvasionReaction` once per PvP basic attack after damage. Apply PvP-scaled healing capped at max HP, merge the speed buff, add item-labelled logs, and route actual healing through `healToShield`.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `fix: trigger on-dodge gear from pvp basic attacks`

### Task 6: Activate reactions for PvP direct-damage skills

**Files:**
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

- [ ] Add a multi-hit direct-skill regression test showing that normal evasion reduction rolls once per cast, triggers defender effects once, and still applies the skill's DoT/debuff payload.
- [ ] Add a guaranteed-evade regression assertion showing the existing one trigger is preserved without a second normal-reaction roll.
- [ ] Run `npm test -- src/adventure/battle/engine-pvp.test.ts` and confirm the new positive test fails.
- [ ] Track total skill damage before/after evasion, call `rollEvasionReaction` once after all hits and only for a surviving defender, then apply PvP-scaled healing, speed, logs, and heal-to-shield to the defender state.
- [ ] Ensure the general reaction branch is skipped when `skillGuaranteedEvaded` is true.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit: `fix: trigger on-dodge gear from pvp skills`

### Task 7: Verify the complete change

**Files:**
- Verify only

- [ ] Run the targeted suite:
  `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/v2/combat/engine.monsterMpSkillCap.test.ts src/adventure/battle/engine.test.ts src/adventure/battle/engine-pvp.test.ts`
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test` if the targeted suite and typecheck pass.
- [ ] Inspect `git diff --check`, `git status --short`, and the final diff to verify no unrelated files or deployment changes are included.
- [ ] Commit any verification-only corrections separately, then prepare the branch for review without deploying.
