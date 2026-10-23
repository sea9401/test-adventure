# 미개척지 보스 고유 장비 고유 효과 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미개척지 보스 고유 장비 18종에 단독 채용 가능한 보스 컨셉 효과를 PvE·PvP 공통으로 부여한다.

**Architecture:** 장비 id → 효과 kind 표(데이터)에서 `PlayerCombat.unexploredBossEffects`를 만들고, 순수 상태 기계(`unexploredBossUniqueEffects.ts`)가 숫자·명령만 계산한다. PvE·PvP 어댑터는 미개척지 세트 어댑터가 이미 쓰는 연결 지점(공격 시작·종료, 피격, 적 행동 종료, 받는 피해, 방어 보정)에서 호출되고, 연결 지점이 없는 치명 확률·속도·ATB 앞당김·빙결·전투 시작 보호막만 엔진을 직접 고친다.

**Tech Stack:** TypeScript, vitest, Next.js(표시만)

**Spec:** `docs/superpowers/specs/2026-10-24-unexplored-boss-unique-effects-design.md`

## Global Constraints

- 모든 효과는 장비 하나만으로 발동한다. 다른 장비 보유를 조건으로 두지 않는다.
- 기존 옵션 수치와 기존 signature(독혈 발톱 on_hit 중독 35%, 무한초점 every_n_hits 5)는 그대로 둔다.
- 어떤 효과도 회피 판정을 건너뛰지 않고, 보스 방벽 같은 보스 기믹 보호막을 무시하지 않는다.
- 효과가 없는 전투는 기존과 바이트 단위로 같아야 한다(런타임 필드는 효과가 있을 때만 생성).
- PvP 보호막·회복은 `scalePvPShield`·`scalePvPHealing`을 거친다. 영겁은 PvE 2회, PvP 1회.
- 유저 노출 문구에 마크다운·대시·"v2" 금지. 로그 형식은 `[효과 이름] …`.

## Review Focus

- 다단 공격 한 번이 피격 계열 중첩(응고·독혈·영구빙)을 여러 번 쌓지 않는다 → Task 2 `counts once per enemy action`.
- 영겁이 HP 1 버티기 후 같은 적 행동의 남은 타격에 죽지 않는다 → Task 3 `eternal life survives remaining hits`.
- 불괴 방벽 잔량이 다른 보호막보다 나중에 깎인다(다른 보호막이 남아 있는데 방벽 반격이 터지지 않는다) → Task 2 `bulwark breaks only after own pool is gone`.
- 빙결이 감전 대기·면역 중에는 행동 취소를 겹치지 않는다 → Task 3 `freeze respects shock immunity`.
- 효과 미장착 전투의 로그·HP가 기존과 같다 → Task 3·4 `no boss effects leaves battle unchanged`.

---

### Task 1: 효과 데이터와 전투 입력·표시

**Files:**
- Create: `src/adventure/data/v2/unexploredBossUniqueEffects.ts`
- Create: `src/adventure/data/v2/unexploredBossUniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts` (`PlayerCombat`에 `unexploredBossEffects?: readonly UnexploredBossEffectKind[]`)
- Modify: `src/lib/server/derivePlayerCombatV2Pure.ts` (collect 결과를 비었을 때 생략하고 넘김)
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx`, `V2ItemCompareCard.tsx`, `V2ItemMultiCompareCard.tsx` (`◆ 이름: 설명` 한 줄)

**Interfaces:**
- Produces: `type UnexploredBossEffectKind` (18개: tracking_edge, phantom_haste, infinite_orbit, toxic_claw, coagulated_venom, uncorrupted_heart, glacial_crush, frozen_bulwark, absolute_zero, magisteel_guard, sealing_barrier, invincible_bulwark, prismatic_correction, starpath_aim, infinite_focus, immortal_frenzy, pulsing_regen, eternal_life)
- Produces: `UNEXPLORED_BOSS_UNIQUE_EFFECTS: Record<string, { kind; label; description }>` (장비 id 키), `unexploredBossUniqueEffectOf(id): {kind,label,description} | undefined`, `collectUnexploredBossUniqueEffects(equipped): UnexploredBossEffectKind[]`

- [ ] Step 1: 테스트 — 18개 보스 고유 id 모두 효과가 있고 kind가 서로 다르다. `UNEXPLORED_BOSSES`의 uniqueDrops id 집합과 표 키 집합이 같다. 같은 id를 두 슬롯에 넣어도 kind는 1번. 빈 장착이면 `[]`.
- [ ] Step 2: 실패 확인 `npx vitest run src/adventure/data/v2/unexploredBossUniqueEffects.test.ts`
- [ ] Step 3: 표·함수 구현(라벨·설명은 명세 표 문구 그대로), PlayerCombat 필드, derive 연결, 카드 표시.
- [ ] Step 4: 통과 확인 + `npx tsc --noEmit -p .`
- [ ] Step 5: 커밋

### Task 2: 순수 상태 기계

**Files:**
- Create: `src/adventure/v2/combat/unexploredBossUniqueEffects.ts`
- Create: `src/adventure/v2/combat/unexploredBossUniqueEffects.test.ts`

**Interfaces:**
- Produces:
  - `type BossUniqueRuntime` (orbitCalc, pursuit, coagulation, toxicBlood, targetChill, freezeBonusPending, correctionPending, starpathCritPct, focus, bulwarkShield, bulwarkSize, bulwarkRebuildIn, sealCharges, eternalCharges, eternalPendingHealPct, eternalFrenzy, pendingHastePct, actionDamaged, actionDodged)
  - `type BossUniqueCommand = {kind:"damage_fixed";label;amount} | {kind:"apply_poison";label;stacks} | {kind:"def_debuff"|"mdef_debuff";label;pct;actions} | {kind:"shield";label;amount} | {kind:"heal";label;amount} | {kind:"cleanse_dots";label} | {kind:"freeze";label}`
  - `initialBossUniqueRuntime(effects, {maxHp, pvp}): {runtime; startShield}`
  - `beginBossUniqueAttack(runtime, effects, {direct, targetPoisonStacks, hp, maxHp}): {runtime; damageMult; defenseMult}`
  - `bossUniqueCritBonusPct(runtime, effects): number`
  - `finishBossUniqueAttack(runtime, effects, {direct, hit, crit, atk, magicAtk}): {runtime; commands}`
  - `recordBossUniqueHit(runtime, {fullyEvaded, hpDamage, shieldAbsorbed, shieldAfter}): runtime`
  - `finishBossUniqueEnemyAction(runtime, effects, {hp, maxHp, hasDots}): {runtime; commands}`
  - `bossUniqueDamageTaken(runtime, effects, {damage, hpBefore, shield}): number`
  - `startBossUniquePlayerAction(runtime, effects, {hp, maxHp, healMult}): {runtime; commands}`
  - `bossUniqueSelfSpeedMult(runtime)`, `bossUniqueTargetSpeedMult(runtime)`, `bossUniqueResourceSnapshot(runtime, effects)`

수치(명세 그대로): 궤도 +3%/중첩 최대 5 · 잔상 가속 15% · 추적 10 → 방어 ×0.5·피해 ×1.8 · 독혈 침투 중독 5+ ×1.08 · 응고 3 → 중독 2 · 독혈 10 → 정화+회복 12%+고정 피해 최대 HP 8%+중독 3 · 혹한 최대 10, 중첩당 속도 −1.5%, 망치 +1, 거갑 +1, 핵 +2, 10 → 빙결+다음 직접 ×1.3 · 장갑판 시작 5%, 보호막 중 ×0.92 · 결계 4% 3회 · 방벽 15%, 중 ×0.85, 파괴 시 크기 40% 고정 피해, 행동 6회 후 재생 · 보정 사격 ×1.25 · 별궤 +4%p 최대 20 · 조준 +1(치명 +2) 20 → max(atk,matk)×1.5 고정 피해 + 방어·마방 −20% 3행동 · 광란 잃은 HP 10%당 +2% 최대 14% · 재생 고동 잃은 HP 2% · 영겁 PvE 2/PvP 1, 35%→20%, 이후 ×1.2 피해·×1.15 속도.

- [ ] Step 1: 효과별 테스트(발동·초기화·상한). 포함 필수: `counts once per enemy action`(두 번 recordHit 후 finish → 응고 1), `bulwark breaks only after own pool is gone`(shieldAfter가 방벽 잔량 이상이면 반격 없음), `eternal caps lethal damage at hp-1 while charges remain`, `no effects returns identity`(배율 1, 명령 없음).
- [ ] Step 2: 실패 확인
- [ ] Step 3: 구현
- [ ] Step 4: 통과 확인
- [ ] Step 5: 커밋

### Task 3: PvE 연결

**Files:**
- Create: `src/adventure/v2/combat/unexploredBossUniquePveAdapter.ts`, `unexploredBossUniquePve.test.ts`
- Modify: `engineState.ts`(BattleState `unexploredBossRuntime?`), `engine.pveOperations.ts`(초기화·시작 보호막), `unexploredSetPveAdapter.ts`(begin/finish attack, record hit, finish enemy action, defense, damage taken에서 보스 함수 호출), `engine.playerPhase.ts`·`engine.playerSkills.ts`(치명 확률 보너스), `engine.atbSpeed.ts`(속도), `engine.atb.ts`(잔상 가속 앞당김, 행동 시작 훅), `engine.skillHealing.ts` 또는 행동 시작 지점(재생·방벽 재생·영겁)

**Interfaces:**
- Consumes: Task 2 전체
- Produces: `applyBossUniqueCommandsPve(state, player, commands): BattleState`

- [ ] Step 1: 테스트 — 효과 하나만 가진 플레이어로 각 0.5% 효과 로그 발생(궤도 절단, 독혈 역류, 절대영도, 불괴 방벽, 천공 포격, 영겁), `eternal life survives remaining hits`, `freeze respects shock immunity`, `no boss effects leaves battle unchanged`(같은 시드 resolveBattleAtb 결과 동일).
- [ ] Step 2: 실패 확인
- [ ] Step 3: 구현
- [ ] Step 4: 통과 + 기존 `unexploredSetPve.test.ts` 통과
- [ ] Step 5: 커밋

### Task 4: PvP 연결

**Files:**
- Create: `src/adventure/v2/combat/unexploredBossUniquePvpAdapter.ts`, `unexploredBossUniquePvp.test.ts`
- Modify: `engine.pvpState.ts`(`stacks.unexploredBoss?`), `engine.pvpInitialState.ts`, `unexploredSetPvpAdapter.ts`, `engine.pvpPhase.ts`·`engine.pvpSkills.ts`(치명), `engine.pvp-atb.ts`(속도·앞당김)

- [ ] Step 1: 테스트 — p1/p2 대칭으로 대표 효과 발동, 영겁 PvP 1회, 보호막 스케일 적용, `no boss effects leaves battle unchanged`.
- [ ] Step 2~4: 실패 확인 → 구현 → 통과 + 기존 `unexploredSetPvp.test.ts`
- [ ] Step 5: 커밋

### Task 5: 밸런스 비교와 매뉴얼

**Files:**
- Create: `src/adventure/v2/combat/unexploredBossUniqueBalance.test.ts`
- Modify: 매뉴얼의 미개척지 보스 고유 장비 항목

- [ ] Step 1: 고정 시드로 0.5% 6종 각각 같은 슬롯 6T 고유·특화 세트 대비 DPS 또는 생존 틱 우위, 30%·10%는 지배하지 않음(대표 빌드 하나에서만 우위) 검증. 필요하면 명세 범위 안에서 수치 조정하고 명세 갱신.
- [ ] Step 2: 매뉴얼 갱신.
- [ ] Step 3: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`.
- [ ] Step 4: 커밋
