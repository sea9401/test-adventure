# 검성 계열 7차 직업 밸런스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무영검신과 멸검제의 고유 세트 자립성을 높이고, 계승 검영 기록률과 멸검 자동 충전 조건을 바로잡아 승인된 PvE·PvP 목표 범위에 맞춘다.

**Architecture:** 검영 기록·멸검 충전의 순수 상태 함수는 직업별 전투 모듈에 유지하고, PvE/PvP 엔진 호출부가 스킬 분류와 자동 시전 후보 필터링을 동일하게 적용한다. 별도의 결정적 시뮬레이터가 같은 대표 스펙·고정 시드·스킬 예산으로 검성 기준과 두 7차의 고유/계승 빌드를 비교하며, 카탈로그 계수는 이 보고서가 목표 범위를 만족하는 최소 변경만 반영한다.

**Tech Stack:** TypeScript, Vitest, 현재 ATB PvE/PvP 전투 엔진, React 서버 렌더링 기반 매뉴얼 테스트

## Global Constraints

- 무심검의 힘 직접 계수는 3으로 재조정하고, 그 밖의 검성 고유 스킬 수치는 변경하지 않는다.
- 검성 고유 세트는 33 SP, 무영검신·멸검제 고유 세트는 각각 46 SP, 계승 비교는 총 79 SP를 사용한다.
- 무영검신 계승 공격 검영 기록률의 최초 기준은 25%다.
- 멸검 자동 충전은 검의가 정확히 최대치인 3개일 때만 시작한다.
- 비교는 빌드·전장별 최소 200개 고정 시드, 짧은 일반전과 80행동 이상의 장기전을 모두 포함한다.
- 7차 고유 세트 PvE 평균 피해는 검성 고유 세트보다 10~20% 높아야 한다. 79 SP 계승 조합은 무영검신 70~90%, 멸검제 140~150%를 목표로 한다. 멸검제 범위는 일검필살을 예외 없이 적용하면서 고유 세트 목표를 만족하는 실제 양립 범위다.
- 무영검신과 멸검제의 장기 자동사냥 평균 피해 차이는 10% 이내로 유지한다.
- PvP 첫 행동 처치율과 순간 피해를 별도 상향하지 않는다.
- 배포·원격 통합·SP 정책·외부 성장 요소 변경은 이 계획의 범위가 아니다.

---

### Task 1: 결정적 검성 계열 비교 시뮬레이터

**Files:**
- Create: `scripts/sim-v2-tier7-sword-line.ts`
- Create: `src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
- Create: `scripts/fixtures/tier7-sword-line-legacy-baseline.json`

**Interfaces:**
- Produces: `runTier7SwordLineBalance(options?: { seeds?: number; seedBase?: number }): Tier7SwordLineBalanceReport`
- Produces: 빌드별 `pveShort`, `pveLong`, `pvp` 분포와 검성 대비 평균 비율, 두 7차 장기전 격차, 멸검 최대 단일 피해
- Consumes: `resolveBattleAtb`, `resolveBattlePvPAtb`, `derivePlayerCombatV2Pure`, `V2_JOB_CATALOG`, `V2_SKILLS_BY_JOB`

- [x] **Step 1: 결정성·표본 수·보고서 모양을 잠그는 실패 테스트 작성**

```ts
it("같은 200개 시드로 동일한 검성 계열 PvE/PvP 분포를 재현한다", () => {
  const first = runTier7SwordLineBalance({ seeds: 200, seedBase: 20260829 });
  const second = runTier7SwordLineBalance({ seeds: 200, seedBase: 20260829 });
  expect(second).toEqual(first);
  expect(first.seeds).toBe(200);
  expect(first.cases.map((entry) => entry.id)).toEqual([
    "swordsaint-core",
    "shadowblade-core",
    "shadowblade-inherited",
    "ruinblade-core",
    "ruinblade-inherited",
  ]);
  for (const entry of first.cases) {
    expect(entry.pveShort.samples).toHaveLength(200);
    expect(entry.pveLong.samples).toHaveLength(200);
    expect(entry.pvp.samples).toHaveLength(200);
  }
});
```

- [x] **Step 2: 테스트가 export 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
Expected: FAIL because `runTier7SwordLineBalance` does not exist.

- [x] **Step 3: 고정된 대표 스펙과 분포 집계를 구현**

시뮬레이터는 `mulberry32(seedBase + index)`로 각 전투의 `Math.random`을 감싸고 `finally`에서 원본을 복구한다. 검성은 STR, 무영검신은 LUK, 멸검제는 STR 중심으로 같은 총 스탯 예산을 배분하고, 방어·속도·MP·장비 없는 파생 입력은 동일하게 둔다. 스킬 구성은 아래 상수를 그대로 사용한다.

```ts
const BUILDS = {
  "swordsaint-core": V2_SKILLS_BY_JOB.swordsaint,
  "shadowblade-core": V2_SKILLS_BY_JOB.shadowblade,
  "shadowblade-inherited": [
    ...V2_SKILLS_BY_JOB.shadowblade,
    ...V2_SKILLS_BY_JOB.swordsaint,
  ],
  "ruinblade-core": V2_SKILLS_BY_JOB.ruinblade,
  "ruinblade-inherited": [
    ...V2_SKILLS_BY_JOB.ruinblade,
    ...V2_SKILLS_BY_JOB.swordsaint,
  ],
} as const;
```

PvE 짧은 전투는 `resolveBattleAtb`와 `maxTurns: 12`, 장기 전투는 HP가 소진되지 않는 더미와 `maxTurns: 80`으로 측정한다. PvP는 환경 플래그를 거치지 않는 `resolveBattlePvPAtb`를 직접 호출해 같은 방어 표본을 상대로 100턴 상한까지 누적 피해와 첫 공격 묶음 피해를 기록한다. 각 분포는 `mean`, `median`, `p10`, `p90`, `maxSingleHit`을 반환하며 CLI 실행 시 표로 출력한다.

- [x] **Step 4: 결정성 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
Expected: PASS with 200 samples in every requested distribution.

- [x] **Step 5: 변경 전 PvP 기준선 요약을 고정하고 콘솔 보고서 확인**

Run: `NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-v2-tier7-sword-line.ts`
Expected: 현재 계수의 검성 대비 비율, 7차 간 장기전 격차, PvP 첫 행동 피해가 동일한 200개 시드로 출력된다. 출력된 무영검신·멸검제 고유/계승 빌드의 `pvp.mean`과 `pvp.firstActionKoRate`을 숫자 리터럴로 `scripts/fixtures/tier7-sword-line-legacy-baseline.json`에 기록한다. fixture 스키마는 `{ seedBase: 20260829, seeds: 200, cases: Record<buildId, { mean: number; firstActionKoRate: number }> }`로 고정한다.

### Task 2: 무영검신 계승 검영 기록률 25% 분리

**Files:**
- Modify: `src/adventure/data/v2/tier7SkillMechanics.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/shadowBladeCombat.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Extends: `Tier7Mechanic & { kind: "shadowCore" }` with `inheritedRecordPct: number`
- Preserves: `recordSwordShadow(input)`; callers continue to pass the selected record percentage

- [x] **Step 1: 순수 기록 함수와 실제 엔진 호출부의 실패 회귀 테스트 작성**

```ts
it("고유 잔영은 70%, 계승 무심검은 25%로 기록한다", () => {
  expect(recordSwordShadow({
    sourceSkillId: "v2c_shadowblade_afterimage",
    dealtDamage: 1_000,
    recordPct: 70,
  })?.recordPct).toBe(70);
  expect(recordSwordShadow({
    sourceSkillId: "v2c_swordsaint_flash",
    dealtDamage: 1_000,
    recordPct: 25,
  })?.recordPct).toBe(25);
});
```

PvE/PvP 통합 테스트는 잔영과 무심검을 각각 강제 시전한 뒤 `swordShadow.recordPct`가 PvE에서 `70/25`, PvP에서 기존 80% 배율을 적용한 `56/20`인지 확인한다.

- [x] **Step 2: 기존 50% 계승 기록 때문에 통합 테스트가 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`
Expected: FAIL with inherited record `50` or PvP `40` instead of `25/20`.

- [x] **Step 3: 카탈로그와 양쪽 엔진 호출부를 최소 수정**

`shadowCore`에 `inheritedRecordPct: 25`를 넣는다. 양 엔진은 `tier7CombatJobIdForSkillId`로 원본 스킬의 직업을 분류한다. `shadowStrike`는 그 스킬의 `recordPct`, 그 밖의 무영검신 단일 물리 공격은 검영 코어의 `recordPct`, 선행·타 직업 공격은 `inheritedRecordPct`를 넘긴다. PvP는 선택된 기록률에 기존 `pvpScalePct`를 한 번만 적용한다. `recordSwordShadow` 내부는 스킬 ID를 판별하지 않는다.

- [x] **Step 4: 검영 회귀 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`
Expected: PASS; stronger-shadow replacement, one-time refinement, PvP 80% scale remain green.

### Task 3: 검의 3개 멸검 자동 충전 게이트

**Files:**
- Modify: `src/adventure/data/v2/tier7SkillMechanics.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/ruinBladeCombat.ts`
- Modify: `src/adventure/v2/combat/ruinBladeCombat.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Extends: `Tier7Mechanic & { kind: "chargedFinisher" }` with `requiredIntentStacks: number`
- Produces: `canStartRuinCharge(intent: number, requiredStacks?: number): boolean`
- Consumes: current `tier7.swordIntent` before `resolveV2SkillCast`

- [x] **Step 1: 0·1·2개 거부와 3개 허용 실패 테스트 작성**

```ts
it.each([
  [0, false],
  [1, false],
  [2, false],
  [3, true],
])("검의 %i개에서 멸검 충전 가능 여부는 %s다", (intent, expected) => {
  expect(canStartRuinCharge(intent)).toBe(expected);
});
```

PvE/PvP 엔진 테스트는 준비된 상태의 검의를 0~3으로 바꾸어 한 행동을 진행하고, 0~2에서는 `ruinCharge`와 충전 로그가 없고 3에서는 충전 후 다음 행동에 해방되며 검의 1개를 되찾는지 확인한다. 저체력 극한일격은 기존대로 한 적중에 검의 2개를 얻는다.

- [x] **Step 2: 현재 엔진이 검의 0개에서도 충전해 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`
Expected: FAIL because 멸검 remains an eligible auto-cast candidate below 3 stacks.

- [x] **Step 3: 공용 판정과 양쪽 후보 필터를 구현**

```ts
export function canStartRuinCharge(
  intent: number,
  requiredStacks = 3,
): boolean {
  return Math.max(0, Math.floor(intent)) === Math.max(1, Math.floor(requiredStacks));
}
```

멸검의 `chargedFinisher` 데이터에 `requiredIntentStacks: 3`을 넣는다. 기존 충전 상태가 있으면 강제 해방 경로를 그대로 우선한다. 충전 상태가 없고 `canStartRuinCharge`가 거짓이면 `castInput.skills.learned/equipped`에서 `v2c_ruinblade_ruinsword`만 제외한 뒤 일반 선택을 수행한다. 수동 패턴도 같은 후보 필터를 거치므로 3개 미만에서 우회할 수 없다. 충전 로그는 `[멸검] 검의 3개를 소모해 충전을 시작했다. 다음 행동 기회에 자동 해방한다.`로 통일한다.

- [x] **Step 4: 멸검 상태 전이 회귀 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`
Expected: PASS for 0–3 gate, low-HP double gain, charge/release, one-stack return, PvP caps.

### Task 4: 200시드 목표 범위와 최소 계수 조정

**Files:**
- Modify: `src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`

**Interfaces:**
- Consumes: `Tier7SwordLineBalanceReport`
- Produces: 목표 범위를 자동 검증하는 `assertTier7SwordLineTargets(report)`

- [x] **Step 1: 승인된 목표 범위를 실패 테스트로 추가**

```ts
it("200시드 PvE 목표 범위와 PvP 비상향 조건을 만족한다", () => {
  const report = runTier7SwordLineBalance({ seeds: 200, seedBase: 20260829 });
  expect(report.ratios.shadowCoreToSwordsaint).toBeGreaterThanOrEqual(1.10);
  expect(report.ratios.shadowCoreToSwordsaint).toBeLessThanOrEqual(1.20);
  expect(report.ratios.ruinCoreToSwordsaint).toBeGreaterThanOrEqual(1.10);
  expect(report.ratios.ruinCoreToSwordsaint).toBeLessThanOrEqual(1.20);
  expect(report.ratios.shadowInheritedToSwordsaint).toBeGreaterThanOrEqual(1.70);
  expect(report.ratios.shadowInheritedToSwordsaint).toBeLessThanOrEqual(1.90);
  expect(report.ratios.ruinInheritedToSwordsaint).toBeGreaterThanOrEqual(2.40);
  expect(report.ratios.ruinInheritedToSwordsaint).toBeLessThanOrEqual(2.50);
  expect(report.ratios.longTier7Gap).toBeLessThanOrEqual(0.10);
  expect(report.identity.ruinMaxSingleHit).toBeGreaterThan(
    report.identity.shadowMaxSingleHit,
  );
});
```

같은 테스트에서 Task 1의 legacy fixture를 읽어 각 7차 빌드의 PvP 평균 피해가 기존보다 5% 넘게 증가하지 않고, 첫 행동 처치율은 기존보다 2%p 넘게 증가하지 않는지 검증한다.

```ts
expect(current.pvp.mean).toBeLessThanOrEqual(legacy.mean * 1.05);
expect(current.pvp.firstActionKoRate).toBeLessThanOrEqual(
  legacy.firstActionKoRate + 0.02,
);
```

- [x] **Step 2: 기믹 수정만 적용한 기준선에서 목표 테스트 실행**

Run: `npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
Expected: FAIL only on ratios outside the approved ranges; determinism and sample counts remain PASS.

- [x] **Step 3: 허용 계수군을 한 번에 하나씩 2.5% 단위로 탐색**

조정 순서는 `잔영 → 무흔 → 극한일격 → 멸검`이다. 각 스킬의 모든 직접 피해 effect에 같은 배율을 적용해 다단 타격 비율을 보존하고, `statCoef`와 `flat`을 함께 반올림한다. 각 후보마다 같은 200시드를 다시 실행하며, 모든 목표를 만족하는 후보 중 기존 수치와의 절대 변화 합이 가장 작은 조합을 선택한다. 검성 수치, 검영 후속 보너스, 검의 스택 보너스, 멸검 HP 보너스·PvP 상한은 변경하지 않는다.

- [x] **Step 4: 선택된 최종 직접 피해 수치를 카탈로그 회귀 테스트에 고정**

`v2SkillsByJob.test.ts`에서 잔영·무흔·극한일격·멸검의 최종 `statCoef`와 `flat` 합계를 리터럴로 검증한다. 기존 0.90/1.00/0.85/1.80 비율 테스트는 새 수치의 의도를 설명하는 최종 비율로 교체한다.

- [x] **Step 5: 200시드 목표 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts`
Expected: PASS; core 1.10–1.20, shadow inherited 1.70–1.90, ruin inherited 2.40–2.50, long gap ≤0.10, ruin burst identity preserved.

### Task 5: 스킬 설명과 매뉴얼 동기화

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/app/manual/content/skills.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Extends: `describeTier7Mechanic` output for `shadowCore.inheritedRecordPct`
- Extends: `chargedFinisher` description with `검의 3개 필요`

- [x] **Step 1: 실제 규칙이 사용자 설명에 보이는지 실패 테스트 작성**

```ts
expect(describeV2Skill(V2_SKILLS.v2c_shadowblade_swordshadow)).toEqual(
  expect.arrayContaining([
    "고유 공격 50% 기록 · 계승 공격 25% 기록 · 정련 시 +15%p",
    "PvP 검영·후속 보너스 80% 적용",
  ]),
);
expect(describeV2Skill(V2_SKILLS.v2c_ruinblade_ruinsword)).toContain(
  "검의 3개일 때만 충전",
);
```

매뉴얼 정적 렌더 테스트는 `무영검신`, `계승 공격 25%`, `멸검제`, `검의 3개`, `다음 행동 기회에 자동 해방`을 확인한다.

- [x] **Step 2: 기존 일반 설명 때문에 실패하는지 확인**

Run: `npx vitest run src/adventure/data/v2/v2Skills.test.ts src/app/manual/current-content.test.tsx`
Expected: FAIL because inherited 25% and three-intent gate are not rendered.

- [x] **Step 3: 카탈로그 설명·수치 칩·매뉴얼을 같은 데이터 의미로 갱신**

검영 설명은 고유 공격과 계승 공격 기록률이 다름을 명시하고, 정련은 기존처럼 한 번 `+15%p`임을 표시한다. 멸검 설명과 수치 칩은 `검의 3개 필요`, 한 행동 충전, 다음 행동 강제 해방, 해방 뒤 1개 반환을 표시한다. 매뉴얼 `복합 스킬 효과 읽는 법`에 두 직업의 자동전투 흐름을 각각 한 항목으로 추가한다.

- [x] **Step 4: 설명·매뉴얼 테스트 통과 확인**

Run: `npx vitest run src/adventure/data/v2/v2Skills.test.ts src/app/manual/current-content.test.tsx`
Expected: PASS with descriptions matching live PvE/PvP rules.

### Task 6: 전체 회귀 검증과 단일 구현 커밋

**Files:**
- Verify all files changed by Tasks 1–5

- [x] **Step 1: 집중 테스트 전체 실행**

Run: `npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/app/manual/current-content.test.tsx`
Expected: PASS with zero failures.

- [x] **Step 2: 전체 정적·회귀 검증 실행**

Run: `npm test`
Expected: PASS with zero failures.

Run: `npm run lint`
Expected: exit 0.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0; image optimization/check hooks complete without missing references.

- [x] **Step 3: 최종 200시드 보고서 보관용 출력 확인**

Run: `NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-v2-tier7-sword-line.ts`
Expected: 모든 목표 범위와 PvP 비상향 판정이 `PASS`로 표시된다.

- [x] **Step 4: 변경 범위와 원격 비통합 상태 확인**

Run: `git diff --check && git status --short --branch && git rev-list --left-right --count @{upstream}...HEAD`
Expected: 계획·검성 계열 구현 파일만 변경되고, 원격 1개 커밋은 병합하지 않은 상태다.

- [x] **Step 5: 구현을 커밋**

```bash
git add docs/superpowers/plans/2026-08-29-tier7-sword-line-balance.md \
  scripts/sim-v2-tier7-sword-line.ts \
  src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts \
  scripts/fixtures/tier7-sword-line-legacy-baseline.json \
  src/adventure/data/v2/tier7SkillMechanics.ts \
  src/adventure/data/v2/v2SkillsCommonCatalog.ts \
  src/adventure/data/v2/v2Skills.ts \
  src/adventure/data/v2/v2Skills.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts \
  src/adventure/v2/combat/shadowBladeCombat.test.ts \
  src/adventure/v2/combat/ruinBladeCombat.ts \
  src/adventure/v2/combat/ruinBladeCombat.test.ts \
  src/adventure/v2/combat/engine.ts \
  src/adventure/v2/combat/engine-pvp.ts \
  src/adventure/v2/combat/atbSkillCast.test.ts \
  src/adventure/v2/combat/atbSkillCastPvp.test.ts \
  src/app/manual/content/skills.tsx \
  src/app/manual/current-content.test.tsx
git commit -m "balance: strengthen tier 7 sword jobs"
```
