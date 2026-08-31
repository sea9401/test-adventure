# Always-Active Lifestyle Passives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배운 생활 패시브를 SP 로드아웃 선택과 무관하게 항상 장착·적용하고, 사용자 화면에서 해제할 수 없도록 한다.

**Architecture:** `parseV2SkillsState`가 유효한 학습 목록을 만든 뒤 모든 생활 패시브를 `equipped`에 합쳐, 농사·낚시·요리·벌목·채광 등 기존 효과 계산기가 변경 없이 항상 보너스를 받게 한다. 수동 로드아웃 저장 API도 같은 정규화 함수를 거쳐 응답과 저장값을 일치시키며, UI는 생활 패시브를 선택 가능한 장착 항목이 아닌 읽기 전용 `적용 중` 항목으로 표시한다.

**Tech Stack:** Next.js 16 App Router, React 19 Client Components, TypeScript, Vitest

## Global Constraints

- 배포하지 않는다.
- 사용자의 기존 전투 스킬 장착 순서와 SP 예산 규칙은 변경하지 않는다.
- 생활 패시브는 SP 0이며, 배타 그룹이 없는 현재 카탈로그 정의를 사용한다.
- 기존 로드아웃·프리셋·세이브의 다른 필드는 보존한다.

---

### Task 1: 생활 패시브 장착 불변식

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2Loadout.test.ts`

**Interfaces:**
- Consumes: `V2_SKILLS`, `isLifestyleSkill`, 정규화된 `learned`/`equipped` 배열
- Produces: 학습한 생활 패시브를 중복 없이 뒤에 추가하는 `includeLearnedLifestyleSkills(equipped, learned): V2SkillId[]`

- [ ] **Step 1: Write the failing tests**

```ts
it("배운 생활 패시브가 저장된 장착 목록에서 빠져도 자동 장착한다", () => {
  const parsed = parseV2SkillsState({
    learned: ["v2_skill_strike", "v2c_farmer_seedselection"],
    equipped: ["v2_skill_strike"],
  });
  expect(parsed.equipped).toEqual([
    "v2_skill_strike",
    "v2c_farmer_seedselection",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.test.ts`

Expected: 생활 패시브가 `equipped`에 없어서 FAIL.

- [ ] **Step 3: Write minimal implementation**

`includeLearnedLifestyleSkills`가 기존 순서를 보존하고, 학습 순서대로 누락된 생활 패시브만 추가하게 한다. `parseV2SkillsState`와 `sanitizeLoadout`이 이 함수를 사용하도록 한다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.test.ts`

Expected: PASS.

### Task 2: 수동 로드아웃 저장 정규화

**Files:**
- Modify: `src/app/api/v2/me/loadout/route.ts`
- Create: `src/lib/server/loadoutRoute.test.ts`

**Interfaces:**
- Consumes: `includeLearnedLifestyleSkills`, 요청의 전투 스킬 목록, 저장된 학습 목록
- Produces: 생활 패시브가 포함된 `equipped` 저장값과 API 응답

- [ ] **Step 1: Write the failing route test**

생활 패시브를 요청에서 빼고 POST해도 응답과 `skills.v2` 저장값에 해당 패시브가 포함되는지 검증한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/loadoutRoute.test.ts`

Expected: 응답 또는 저장값에서 생활 패시브가 누락되어 FAIL.

- [ ] **Step 3: Write minimal implementation**

요청을 학습한 생활 패시브와 합친 뒤 검증·저장·응답에 동일한 배열을 사용한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/loadoutRoute.test.ts`

Expected: PASS.

### Task 3: 생활 패시브 읽기 전용 UI

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Test: `src/adventure/v2/V2LoadoutPanel.test.tsx`

**Interfaces:**
- Consumes: 서버가 항상 장착 상태로 제공하는 생활 패시브 목록
- Produces: `생활 패시브 적용`, `적용 중` 표시와 해제 컨트롤이 없는 UI

- [ ] **Step 1: Write the failing component test**

생활 패시브가 `적용 중`으로 표시되고, 생활 영역의 `전부 해제` 및 개별 `해제` 버튼이 렌더되지 않는지 검증한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: 기존 해제 버튼과 안내 문구 때문에 FAIL.

- [ ] **Step 3: Write minimal implementation**

생활 장착 목록을 읽기 전용 배지로 바꾸고, 생활 라이브러리 카드의 동작 버튼을 `적용 중` 상태로 교체한다. 전투 스킬의 장착·해제 동작은 유지한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: PASS.

### Task 4: 회귀 검증과 커밋

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes: Tasks 1–3의 완료된 변경
- Produces: 검증된 로컬 커밋

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.test.ts src/lib/server/v2Skills.test.ts src/lib/server/loadoutRoute.test.ts src/adventure/v2/V2LoadoutPanel.test.tsx`

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.ts src/adventure/data/v2/v2Loadout.test.ts src/app/api/v2/me/loadout/route.ts src/lib/server/loadoutRoute.test.ts src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

- [ ] **Step 3: Run full test suite**

Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-11-always-active-lifestyle-passives.md src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.ts src/adventure/data/v2/v2Loadout.test.ts src/app/api/v2/me/loadout/route.ts src/lib/server/loadoutRoute.test.ts src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx
git commit -m "feat: always apply learned lifestyle passives"
```
