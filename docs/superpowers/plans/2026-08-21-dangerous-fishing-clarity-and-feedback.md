# Dangerous Fishing Clarity and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 해역의 보상 순환과 조작 결과를 즉시 이해하게 하고, 거대어 개인 시도를 중복 이미지 없는 단일 전투 화면으로 바꾼다.

**Architecture:** 서버 API와 저장 형식은 유지한다. 새 순수 피드백 모듈이 조작 전 상태와 mutation 응답을 사용자 표시 모델로 바꾸고, `useDangerousFishing`이 scope별 최신 피드백을 보존한다. 화면 컴포넌트는 표시 모델만 받아 목표·보상, 행동 판정, 종료 결과와 단일 거대어 전투 레이아웃을 렌더한다.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Tailwind CSS, Vitest, React server static markup tests

## Global Constraints

- 어종 확률, 조작 수치, 위험도, 사고 확률, 보상 수량을 변경하지 않는다.
- 새 화폐, 장비 강화, 일일 과제, 성장 트리, 이미지, 사운드를 추가하지 않는다.
- 신규 패널과 카드는 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT` 중 목적에 맞는 불투명 표면을 사용한다.
- 서버 API 응답 형식과 저장 상태는 바꾸지 않는다.
- 배포와 점검 모드 변경은 하지 않는다.
- 기존 마스터리 타워 작업 트리 변경을 수정하거나 커밋하지 않는다.

---

### Task 1: Mutation 응답 피드백 모델

**Files:**
- Create: `src/adventure/v2/dangerousFishingFeedback.ts`
- Create: `src/adventure/v2/dangerousFishingFeedback.test.ts`
- Modify: `src/adventure/v2/useDangerousFishing.ts`

**Interfaces:**
- Consumes: `DangerousEncounterView`, `DangerousFishingAction`, 기존 encounter·boss·voyage API 성공 JSON
- Produces: `DangerousFishingFeedback`, `dangerousFishingActionFeedback`, `dangerousFishingReturnFeedback`, `dangerousFishingBossClaimFeedback`, hook의 `feedback` 상태

- [ ] **Step 1: 일반·거대어 조작과 귀환 결과의 실패 테스트 작성**

```ts
expect(dangerousFishingActionFeedback({
  scope: "voyage",
  action: "give",
  before: chargeEncounter,
  response: { event: "progress", encounter: nextEncounter },
  targetName: "철턱 참치",
})).toMatchObject({
  scope: "voyage",
  tone: "success",
  title: "정확한 대응 · 줄 풀기",
});

expect(dangerousFishingActionFeedback({
  scope: "voyage",
  action: "reel",
  before: finalEncounter,
  response: {
    event: "caught",
    fish: { name: "철턱 참치", sizeCm: 132 },
    fishingXpGained: 34,
    fishingCoinsGained: 8,
  },
  targetName: "철턱 참치",
})).toMatchObject({
  tone: "success",
  title: "철턱 참치 132cm 어획 성공",
  terminal: true,
});
```

실패 이벤트는 `line_broken`, `hook_lost`, `timeout`을 표로 검증하고, 거대어 성공은 `기여 +240`, 귀환은 확정 어획물 개수와 교환·거래소 사용처, 보상 수령은 코인·증표 사용처를 검증한다.

- [ ] **Step 2: 피드백 테스트가 기능 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/dangerousFishingFeedback.test.ts`

Expected: 피드백 모듈 또는 export 부재로 FAIL

- [ ] **Step 3: 순수 피드백 변환 구현**

```ts
export type DangerousFishingFeedback = {
  scope: "voyage" | "boss";
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  detail: string;
  terminal: boolean;
};

export function recommendedDangerousFishingAction(
  behavior: DangerousFishBehavior,
): DangerousFishingAction {
  if (behavior === "charge") return "give";
  if (behavior === "turn") return "reel";
  return "brace";
}
```

숫자 필드를 안전하게 확인한 뒤 이전·다음 장력, 어체력, 거리 차이를 `장력 -22 · 어체력 -6 · 거리 +8` 형식으로 만든다. 알 수 없는 응답은 `null`을 반환한다.

- [ ] **Step 4: hook이 mutation 성공 JSON을 보존하도록 연결**

`mutate`에 선택적 `onSuccess(json)` 콜백을 추가한다. `act`, `returnVoyage`, `startEncounter`, `actOnBoss`, `claimBossReward`에서 피드백 변환기를 호출한다. 새 투척·새 개인 시도 시작 시 직전 피드백을 지우고, 진행·종료 응답 뒤 새 피드백을 저장한다. 기존 public callback 반환형 `Promise<boolean>`은 유지한다.

- [ ] **Step 5: 피드백 단위 테스트와 타입 검사 실행**

Run: `npx vitest run src/adventure/v2/dangerousFishingFeedback.test.ts && npx tsc --noEmit`

Expected: PASS, exit 0

- [ ] **Step 6: 피드백 모델 커밋**

```bash
git add src/adventure/v2/dangerousFishingFeedback.ts src/adventure/v2/dangerousFishingFeedback.test.ts src/adventure/v2/useDangerousFishing.ts
git commit -m "feat: preserve dangerous fishing action results"
```

### Task 2: 목표·보상과 개인 조우 손맛

**Files:**
- Create: `src/adventure/v2/DangerousFishingFeedbackCard.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`
- Modify: `src/adventure/v2/DangerousFishingEncounterPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingCargoPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/app/(game)/town/fishing/dangerous/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `DangerousFishingFeedback`, `recommendedDangerousFishingAction`, hook의 `feedback`
- Produces: 목표·보상 흐름, 추천 조작, 상태 경고, 결과 카드가 렌더되는 위험 해역 화면

- [ ] **Step 1: 목표·보상 및 결과 카드 렌더 실패 테스트 작성**

`DangerousFishingView.test.tsx`에서 다음 문구와 결과 카드 상태를 검증한다.

```ts
expect(html).toContain("위험 해역에서 얻는 것");
expect(html).toContain("경험치·코인·도감");
expect(html).toContain("상점 교환·거래소");
expect(html).toContain("거대어 증표");
expect(resultHtml).toContain("철턱 참치 132cm 어획 성공");
expect(resultHtml).toContain('aria-live="polite"');
```

개인 조우 fixture에서는 현재 행동의 정답 버튼에 `추천`이 표시되고 `줄이 끊어질 위험`, `바늘이 빠질 위험`, `어체력 소진 · 인양에 집중` 중 조건에 맞는 상태 안내가 나타나는지 검증한다.

- [ ] **Step 2: UI 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/DangerousFishingView.test.tsx`

Expected: 목표·보상과 피드백 UI 부재로 FAIL

- [ ] **Step 3: 불투명 결과 카드와 목표·보상 흐름 구현**

`DangerousFishingFeedbackCard`는 `SURFACE_INSET`, tone별 border/text, `aria-live="polite"`를 사용한다. `DangerousFishingView`는 개인 조우가 없을 때 세 단계 보상 흐름과 `위험 해역 교환 보기` 버튼을 표시하고 active tab과 feedback scope가 일치할 때만 결과를 보여 준다.

- [ ] **Step 4: 추천 조작과 국면 안내 구현**

`DangerousFishingEncounterPanel`에 `feedback?: DangerousFishingFeedback | null`, `embedded?: boolean`을 추가한다. 행동에 맞는 버튼에 `추천` 배지를 붙이고, 장력 85% 이상·장력 5 이하·어체력 또는 거리 0의 상태를 우선순위에 따라 안내한다. 막대에는 `transition-[width] duration-300`을 적용한다.

- [ ] **Step 5: 화물 의미를 실제 획득 단위로 변경**

`DangerousFishingCargoPanel`의 상단 수치를 내부 `totalValue` 합계가 아닌 화물 수량 합계로 바꾸고, 귀환 후 상점 교환·거래소에서 사용한다는 설명을 표시한다.

- [ ] **Step 6: 페이지에서 hook 피드백 전달**

```tsx
<DangerousFishingView
  feedback={fishing.feedback}
  {...existingProps}
/>
```

- [ ] **Step 7: 위험 해역 화면 테스트와 린트 실행**

Run: `npx vitest run src/adventure/v2/DangerousFishingView.test.tsx && npx eslint src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingEncounterPanel.tsx src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingFeedbackCard.tsx 'src/app/(game)/town/fishing/dangerous/page.tsx'`

Expected: PASS, exit 0

- [ ] **Step 8: 목표·피드백 UI 커밋**

```bash
git add src/adventure/v2/DangerousFishingFeedbackCard.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingEncounterPanel.tsx src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingView.test.tsx 'src/app/(game)/town/fishing/dangerous/page.tsx'
git commit -m "feat: clarify dangerous fishing goals and feedback"
```

### Task 3: 거대어 단일 전투 화면과 보상 목적

**Files:**
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1의 boss scope 피드백, Task 2의 embedded `DangerousFishingEncounterPanel`
- Produces: 중복 이미지 없는 개인 시도 화면과 거대어 보상 목적 안내

- [ ] **Step 1: 중복 이미지와 보상 목적 회귀 테스트 작성**

개인 시도 fixture에서 `tidal_colossus.webp`와 `dangerous-fishing-storm-trench.webp`가 각각 정확히 한 번 렌더되는지 검증한다. `공용 제압 현황`, `내 누적 기여`, `이번 성공 시 기여`, `개인 장력 시도`가 함께 보여야 한다. 일반 이벤트 화면은 `개인 시도 1회 성공`, `낚시 코인·거대어 증표`, `전용 장비·미끼·칭호·꾸미기`를 안내해야 한다.

- [ ] **Step 2: 거대어 UI 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: 이미지가 각각 2회 렌더되거나 목적 문구 부재로 FAIL

- [ ] **Step 3: 개인 시도 조건부 단일 레이아웃 구현**

active event와 attempt가 함께 있으면 기존 공용 대형 장면을 렌더하지 않는다. `SURFACE_CARD` 압축 헤더에 공용 체력 막대, 남은 시간, 누적 기여, `Math.min(event.stamina, boss.attemptStamina)` 예상 기여를 표시하고 embedded encounter를 한 번만 렌더한다.

- [ ] **Step 4: 참여 전·처치 후 보상 설명 개선**

참여 전에는 보상 자격과 증표 사용처를 표시한다. `rewardPreview.tier`는 `기본/은/금/전설`로 변환한다. 처치 후에는 코인·증표 예상 수량과 상점 사용처를 보상 수령 버튼 가까이에 둔다. event가 없을 때도 발견 조건과 보상 목적을 함께 안내한다.

- [ ] **Step 5: 거대어 UI 테스트 실행**

Run: `npx vitest run src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx`

Expected: PASS

- [ ] **Step 6: 거대어 화면 커밋**

```bash
git add src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx
git commit -m "refactor: unify dangerous boss attempt screen"
```

### Task 4: 통합 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1-3 전체 변경
- Produces: 커밋된 검증 결과

- [ ] **Step 1: 관련 테스트 실행**

Run: `npx vitest run src/adventure/v2/dangerousFishingFeedback.test.ts src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/dangerousFishingEncounter.test.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts 'src/app/(game)/town/fishing/dangerous/page.test.tsx'`

Expected: all PASS

- [ ] **Step 2: 정적 검사 실행**

Run: `npx eslint src/adventure/v2/dangerousFishingFeedback.ts src/adventure/v2/dangerousFishingFeedback.test.ts src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishingFeedbackCard.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingEncounterPanel.tsx src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx 'src/app/(game)/town/fishing/dangerous/page.tsx' && npx tsc --noEmit && git diff --check`

Expected: exit 0

- [ ] **Step 3: 커밋과 작업 트리 분리 확인**

Run: `git status --short && git log -5 --oneline`

Expected: 위험 해역 변경은 전용 커밋에만 포함되고 기존 마스터리 타워 변경은 작업 트리에 보존됨
