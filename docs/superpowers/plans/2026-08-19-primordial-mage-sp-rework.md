# 태초술사 공명 SP 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 태초술사의 최종 공명 구성을 기본 40 SP 안에 맞추고 모든 서버·프리셋·UI 표기를 같은 유효 비용으로 통일한다.

**Architecture:** 공명 로드아웃 순수 해석기가 회로별 흡수 비용의 단일 권위값을 제공한다. 기존 서버 및 프리셋 경로는 그 결과를 계속 사용하고, 클라이언트의 하드코딩된 2 SP 표기만 해석 결과 기반으로 바꾼다.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest.

## Global Constraints

- 태초술사 회로의 흡수 재료와 근원 촉매만 1 SP로 낮추고 원소군주 회로는 2 SP를 유지한다.
- 전투 효과, 스킬 ID, 저장 형식과 기본 SP 가격은 바꾸지 않는다.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`를 따른다.
- 배포하지 않는다.

---

### Task 1: 공명 유효 SP 계약

**Files:**
- Modify: `src/adventure/data/v2/elementalResonance.test.ts`
- Modify: `src/adventure/data/v2/v2Loadout.test.ts`
- Modify: `src/adventure/data/v2/elementalResonance.ts`

**Interfaces:**
- Consumes: `resolveElementalResonanceLoadout({ learned, equipped })`
- Produces: 태초술사 흡수 스킬당 1 SP, 원소군주 흡수 스킬당 2 SP와 최종 40 SP 합계

- [ ] **Step 1: 실패하는 비용 경계 테스트 작성**

태초술사의 5원소, 촉매, 촉매·증폭 합계를 각각 `30`, `31`, `40`으로 바꾸고 태초술사
재료·촉매의 `effectiveSpCosts`를 `1`로 단언한다. 원소군주 재료의 `2` 단언은 유지한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Loadout.test.ts`

Expected: 기존 해석기가 태초술사 재료와 촉매를 2 SP로 계산해 예상 합계와 불일치한다.

- [ ] **Step 3: 회로별 최소 구현**

`resolveElementalResonanceLoadout`에서 흡수 비용을 `circuit === "primordial" ? 1 : 2`로
결정하고, 흡수된 모든 ID의 비용에 적용한다.

- [ ] **Step 4: 순수 계산 테스트 통과 확인**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Loadout.test.ts`

Expected: 두 파일의 모든 테스트가 통과한다.

### Task 2: 소비 경로와 UI 표기 동기화

**Files:**
- Modify: `src/adventure/v2/loadoutPresetDiagnostics.test.ts`
- Modify: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`

**Interfaces:**
- Consumes: `ElementalResonanceLoadout.effectiveSpCosts`
- Produces: 프리셋·상태 응답·스킬 카드에 동일한 1 SP 비용과 합계

- [ ] **Step 1: 실패하는 소비자 테스트 작성**

촉매 구성 합계를 `31`, 재료와 촉매의 유효 비용을 `1`, UI 문구를
`공명 재료 · 1 SP`와 `근원 촉매 · 1 SP · 태초회귀 강화`로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: 서버·프리셋은 구현 전 2 SP 합계를 반환하거나 UI가 2 SP를 하드코딩해 실패한다.

- [ ] **Step 3: UI를 해석 결과에 연결**

장착 카드의 `effectiveSpCost`를 `localResolution.resonance.effectiveSpCosts.get(skillId)`에서
읽고, 재료·촉매 안내에도 같은 값을 삽입한다. 값이 없으면 라이브러리의 기본 SP를 사용한다.

- [ ] **Step 4: 소비자 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: 세 파일의 모든 테스트가 통과한다.

### Task 3: 동일 40 SP 전투 비교와 전체 검증

**Files:**
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: 대표 태초술사·천궁·흑월 장착 목록과 공명 유효 SP 계산
- Produces: 세 대표 구성 모두 40 SP라는 비교 가드

- [ ] **Step 1: 비교 기준을 40 SP로 갱신**

천궁 구성에서 `민첩 II`와 `매의 눈`을 빼 40 SP로 만들고, 흑월 구성에서는 10 SP
`은신 II` 대신 4 SP `필살`을 사용한다. 테스트 이름과 공통 SP 기대값을 `40`으로 바꾼다.

- [ ] **Step 2: 집중 테스트 실행**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts`

Expected: 세 구성 모두 40 SP이며 기존 태초술사 직격 피해 프리미엄 범위가 통과한다.

- [ ] **Step 3: 전체 검증 실행**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Expected: 모든 명령이 종료 코드 0으로 끝난다.

- [ ] **Step 4: 변경 커밋**

```bash
git add src/adventure/data/v2/elementalResonance.ts src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Loadout.test.ts src/adventure/v2/loadoutPresetDiagnostics.test.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/combat/combatPatternCast.test.ts
git commit -m "balance: fit primordial mage build within base SP"
```
