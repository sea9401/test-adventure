# Floating Chat Toggle Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱을 포함한 모든 화면에서 플로팅 채팅 패널이 열리면 우측 하단 열기 토글을 제거하고, 패널을 닫으면 다시 표시한다.

**Architecture:** `ChatButton`이 이미 소유한 `open` 상태와 `variant`를 렌더 조건에 직접 사용한다. CSS 반응형 가시성 대신 플로팅 버튼을 조건부 렌더링하되, 인라인 토글과 지연 로드되는 `ChatPanel` 수명은 유지한다.

**Tech Stack:** Next.js 16.2 Client Components, React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- `node_modules/next/dist/docs/`의 Client Component와 lazy-loading 가이드를 따른다.
- 사용자 작업 중인 `src/adventure/v2/CompactBattlePlayerStatus.tsx`와 테스트 파일은 수정하거나 커밋하지 않는다.
- 배포하지 않는다.

---

### Task 1: 플로팅 채팅 토글 표시 수명

**Files:**
- Modify: `src/components/ChatButton.layout.test.ts`
- Modify: `src/components/ChatButton.tsx`

**Interfaces:**
- Consumes: `ChatButton`의 기존 `variant: "inline" | "floating"`, 내부 `open: boolean`, `ChatPanel`의 `onClose(): void`
- Produces: 닫힘 상태에만 존재하는 `data-testid="floating-chat-toggle"`; 기존 인라인 열기/닫기 토글 동작

- [x] **Step 1: 실제 사용자 동작을 재현하는 실패 테스트 작성**

`ChatButton.layout.test.ts`를 jsdom 테스트로 전환하고 외부 채팅 조회와 동적 패널만 경계에서 대체한다. 플로팅 버튼을 클릭한 뒤 버튼이 사라지고, 패널을 닫은 뒤 다시 나타나는지 검증한다. 인라인 버튼은 열린 상태에도 `채팅 닫기`로 남는지 별도 검증한다.

```tsx
it("채팅이 열려 있는 동안 플로팅 토글을 제거하고 닫히면 복원한다", () => {
  render(<ChatButton {...props} variant="floating" />);

  fireEvent.click(screen.getByTestId("floating-chat-toggle"));
  expect(screen.queryByTestId("floating-chat-toggle")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
  expect(screen.getByTestId("floating-chat-toggle")).toBeTruthy();
});
```

- [x] **Step 2: 회귀 테스트가 현재 구현에서 올바르게 실패하는지 확인**

Run: `npx vitest run src/components/ChatButton.layout.test.ts`

Expected: 플로팅 버튼을 연 뒤에도 `floating-chat-toggle`이 남아 있어 첫 테스트가 실패한다.

- [x] **Step 3: 최소 조건부 렌더링 구현**

`ChatButton.tsx`에서 열린 플로팅 버튼만 렌더링하지 않는다. 모바일/데스크톱별 열린 레이어 상수와 분기는 제거하고 닫힌 플로팅 버튼의 기존 레이어는 유지한다.

```tsx
const floating = variant === "floating";
const showToggle = !floating || !open;
```

기존 버튼의 여는 태그 직전에 다음 조건을 추가한다.

```tsx
{showToggle && (
  <button
```

기존 버튼의 닫는 태그 직후에 조건을 닫는다.

```tsx
  </button>
)}
```

- [x] **Step 4: 단위 테스트를 통과시키고 회귀 범위를 확인**

Run: `npx vitest run src/components/ChatButton.layout.test.ts src/components/ChatButton.lazy.test.ts src/components/ChatPanel.layout.test.ts`

Expected: 세 테스트 파일의 모든 테스트가 통과한다.

- [x] **Step 5: 정적 검사와 프로덕션 빌드로 검증**

Run: `npx eslint src/components/ChatButton.tsx src/components/ChatButton.layout.test.ts src/components/ChatButton.lazy.test.ts src/components/ChatPanel.layout.test.ts`

Run: `npm run build`

Expected: 두 명령 모두 exit code 0으로 끝난다.

- [x] **Step 6: 관련 파일만 커밋**

```bash
git add docs/superpowers/plans/2026-08-25-floating-chat-toggle-visibility.md src/components/ChatButton.tsx src/components/ChatButton.layout.test.ts
git commit -m "fix: hide floating chat toggle while open"
```
