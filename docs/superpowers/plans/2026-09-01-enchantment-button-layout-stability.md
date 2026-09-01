# Enchantment Button Layout Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재마법부여 요청 중 직전 결과 영역을 유지해 버튼의 수직 이동을 없앤다.

**Architecture:** `EquipmentLiberationPanel`의 기존 상태와 렌더링 구조를 유지한다. 요청 시작 시 결과 상태를 제거하지 않고, 응답 처리 시에만 새 결과나 오류 안내로 교체한다.

**Tech Stack:** Next.js 16 Client Component, React 19, TypeScript, Vitest, React Testing Library

## Global Constraints

- 배포하지 않는다.
- API 계약과 골드 처리 로직은 변경하지 않는다.
- 장비 선택 변경 시에는 결과를 계속 초기화한다.

---

### Task 1: 재마법부여 요청 중 결과 영역 유지

**Files:**
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- Test: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

**Interfaces:**
- Consumes: 기존 `submit(): Promise<void>` 상태 전환과 `/api/v2/me/equipment/liberate` 응답
- Produces: 요청 대기 중에도 직전 `result`와 `message`가 유지되는 UI 동작

- [x] **Step 1: 실패하는 회귀 테스트 작성**

첫 번째 요청을 성공시킨 뒤 두 번째 `fetch`를 대기 상태로 두고, 두 번째 요청 중 `재마법부여가 완료되었습니다.`와 결과 `role=status`가 유지되는지 검증한다.

- [x] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: 두 번째 요청 직후 직전 완료 안내 또는 결과가 사라져 실패한다.

- [x] **Step 3: 최소 구현**

`submit()` 시작부에서 `setMessage(null)`과 `setResult(null)`을 제거한다. 성공·오류 응답 처리와 장비 선택 시 초기화는 유지한다.

- [x] **Step 4: 관련 검증 실행**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/liberation/EquipmentLiberationPanel.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

- [x] **Step 5: 변경 검토 및 커밋**

`git diff --check`와 `git status --short`로 범위를 확인한 뒤 테스트와 구현을 함께 커밋한다.
