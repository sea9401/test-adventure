# 폭풍 원정 지도 통합과 일괄 진행 구현 계획

> **Required sub-skill:** 구현 시 `superpowers:executing-plans`를 사용해 각 작업의 RED → GREEN → 검증 → 커밋 순서를 지킨다.

**Goal:** 폭풍 원정의 이동·전투·선택을 항로 지도와 노드 모달 하나로 통합하고, 출발 전에 정한 세 구간 항로와 운영 정책으로 완주 또는 패배까지 기존 API를 순차 호출하는 일괄 진행을 제공한다.

**Architecture:** 서버의 `start`, `move`, `fight`, `choose`, `risk_event` 계약과 저장 방식을 변경하지 않는다. 클라이언트에는 (1) 버전이 붙은 경로 계획/자동 선택 순수 함수, (2) 최신 서버 응답만 입력으로 다음 요청 하나를 결정하는 조정기, (3) 반응형 통합 지도와 접근 가능한 노드·일괄 설정·결과 모달을 둔다. `V2StormExpeditionView`는 이들을 조합하고, 요청이 하나 끝날 때마다 상태를 갱신한다.

**Tech Stack:** Next.js App Router의 기존 Client Component 경계, React 19, TypeScript, Tailwind CSS, Vitest의 서버 렌더링/순수 함수 테스트, Playwright 인증 흐름 테스트

**Design reference:** `docs/superpowers/specs/2026-08-20-storm-expedition-map-autoplay-design.md`

## 구현 원칙

- 배포와 점검 모드 변경은 이 계획의 범위가 아니다.
- 데이터베이스 마이그레이션, 원정 API의 보상·전투 계산 변경, 새 소비 아이템 추가를 하지 않는다.
- `V2StormExpeditionView.tsx`가 이미 `"use client"` 경계이므로 `localStorage`, 이벤트, 모달 상태와 자동 진행은 그 아래 Client Component에만 둔다.
- 지도·모달·보조 카드는 `Card`, `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용하며 배경 이미지가 비치지 않게 한다.
- 자동 진행은 동시에 한 요청만 보낸다. 중단은 현재 요청을 취소하지 않고 응답 후 다음 요청을 막는다.
- 페이지 로드만으로 자동 진행을 시작하거나 모달을 강제로 열지 않는다.
- 기존 작업 트리 변경을 보존하고 각 작업 커밋에는 해당 작업 파일만 담는다.

---

### Task 1: 경로 계획, 저장 형식과 자동 선택 정책을 순수 함수로 고정

**Files:**

- Create: `src/adventure/v2/stormExpeditionAutoplayPolicy.ts`
- Create: `src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts`

**Step 1: 실패하는 정책 테스트 작성**

다음 사례를 테이블 테스트로 먼저 작성한다.

```ts
describe("폭풍 원정 일괄 진행 계획", () => {
  it("외곽·중층·수호자 항로를 각 체크포인트 노드로 변환한다", () => {
    const plan = makePlan({
      outerRouteId: "gale",
      middleRouteId: "thunder",
      guardianRouteId: "wreckage",
    });

    expect(stormExpeditionPlannedNodeId(plan, "outer")).toBe("gale_outer");
    expect(stormExpeditionPlannedNodeId(plan, "middle")).toBe("thunder_middle");
    expect(stormExpeditionPlannedNodeId(plan, "guardian")).toBe("wreckage_guardian");
  });

  it("방문한 항로 노드가 계획과 다르면 재개 계획을 폐기한다", () => {
    const plan = makePlan({ outerRouteId: "gale" });
    expect(isStormExpeditionPlanCompatible(plan, ["thunder_outer", "supply"])).toBe(false);
  });
});
```

축복은 세 전략의 전체 순서, 이미 보유한 축복 건너뛰기, 제시되지 않은 축복 건너뛰기, 선택 가능 축복 없음에서 `null` 반환을 검증한다.

```ts
expect(chooseStormExpeditionBoon("offense", ["storm_guard", "swift_fate"], [])).toBe("swift_fate");
expect(chooseStormExpeditionBoon("resource", ["deep_mana", "storm_guard"], ["deep_mana"])).toBe("storm_guard");
expect(chooseStormExpeditionBoon("survival", [], [])).toBeNull();
```

회복은 설계 경곗값과 동률을 포함한다.

```ts
expect(chooseStormExpeditionCheckpointChoice("supply", ratio(85, 100, 90, 100))).toBe("field_rations");
expect(chooseStormExpeditionCheckpointChoice("supply", ratio(90, 100, 80, 100))).toBe("mana_ampoule");
expect(chooseStormExpeditionCheckpointChoice("supply", ratio(90, 100, 90, 100))).toBe("storm_oil");
expect(chooseStormExpeditionCheckpointChoice("camp", ratio(65, 100, 55, 100))).toBe("meditation");
expect(chooseStormExpeditionCheckpointChoice("final_prep", ratio(90, 100, 90, 100))).toBe("boss_slayer");
```

보급에서 `scavenged_coffer`가 절대 자동 선택되지 않는 사례와 야영지 유효 회복량 동률에서 더 낮은 자원, 다시 동률이면 `balanced_rest`를 택하는 사례도 넣는다.

저장 파서는 잘못된 JSON, 알 수 없는 버전/모드/항로/전략을 거부하고 정상 값만 반환하는지 검증한다.

**Step 2: RED 확인**

Run:

```bash
npx vitest run src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts
```

Expected: 새 모듈을 찾지 못해 실패한다.

**Step 3: 최소 구현**

다음 공개 타입과 상수를 만든다.

```ts
export const STORM_EXPEDITION_AUTOPLAY_PLAN_KEY = "storm-expedition.autoplay-plan.v1";
export const STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY = "storm-expedition.autoplay-defaults.v1";

export type StormExpeditionBoonStrategy = "offense" | "survival" | "resource";
export type StormExpeditionRouteStage = "outer" | "middle" | "guardian";

export type StormExpeditionAutoplayPlan = {
  version: 1;
  mode: StormExpeditionMode;
  outerRouteId: StormExpeditionRouteId;
  middleRouteId: StormExpeditionRouteId;
  guardianRouteId: StormExpeditionRouteId;
  boonStrategy: StormExpeditionBoonStrategy;
};
```

다음 함수는 DOM이나 React에 의존하지 않는 순수 함수로 구현한다.

```ts
export function stormExpeditionPlannedNodeId(
  plan: StormExpeditionAutoplayPlan,
  stage: StormExpeditionRouteStage,
): StormExpeditionMapNodeId;

export function isStormExpeditionPlanCompatible(
  plan: StormExpeditionAutoplayPlan,
  visitedNodeIds: readonly StormExpeditionMapNodeId[],
): boolean;

export function chooseStormExpeditionBoon(
  strategy: StormExpeditionBoonStrategy,
  offered: readonly StormExpeditionBoonId[],
  owned: readonly StormExpeditionBoonId[],
): StormExpeditionBoonId | null;

export function chooseStormExpeditionCheckpointChoice(
  kind: Exclude<StormExpeditionChoiceKind, "altar">,
  resources: { hp: number; maxHp: number; mp: number; maxMp: number },
): string;

export function parseStoredStormExpeditionPlan(raw: string | null): StormExpeditionAutoplayPlan | null;
export function serializeStormExpeditionPlan(plan: StormExpeditionAutoplayPlan): string;
```

축복 순서는 설계 문서의 ID 순서를 그대로 상수화한다. HP/MP 최대치가 0인 방어적 입력은 해당 비율을 `1`로 취급한다. 야영지 점수는 결손 비율과 회복 비율의 `min` 합으로 계산하고 부동소수 비교에는 작은 epsilon을 사용한다.

**Step 4: GREEN 확인**

Run:

```bash
npx vitest run src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts
```

Expected: 모두 통과한다.

**Step 5: 커밋**

```bash
git add src/adventure/v2/stormExpeditionAutoplayPolicy.ts src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts
git commit -m "feat: add storm expedition autoplay policy"
```

---

### Task 2: 최신 서버 상태에서 다음 요청 하나만 결정하는 조정기 구현

**Files:**

- Create: `src/adventure/v2/stormExpeditionAutoplay.ts`
- Create: `src/adventure/v2/stormExpeditionAutoplay.test.ts`
- Modify: `src/adventure/v2/stormExpeditionViewModel.ts`
- Modify: `src/adventure/v2/stormExpeditionViewModel.test.ts`

**Step 1: 요청 생성기 회귀 테스트 보강**

기존 `start`/`move`와 같은 방식으로 다음 요청 생성기를 테스트한다.

```ts
expect(stormExpeditionFightRequest("gale_outer", 1)).toEqual({
  action: "fight",
  expectedCurrentNodeId: "gale_outer",
  expectedEncounterIndex: 1,
});
expect(stormExpeditionChooseRequest("storm_oil", "supply", 0)).toEqual({
  action: "choose",
  choiceId: "storm_oil",
  expectedCurrentNodeId: "supply",
  expectedEncounterIndex: 0,
});
expect(stormExpeditionRiskRequest("decline", "supply", 0)).toEqual({
  action: "risk_event",
  decision: "decline",
  expectedCurrentNodeId: "supply",
  expectedEncounterIndex: 0,
});
```

Run `npx vitest run src/adventure/v2/stormExpeditionViewModel.test.ts` and confirm RED, then add the three typed helpers and confirm GREEN.

**Step 2: 자동 진행 상태 전이 테스트 작성**

`nextStormExpeditionAutoplayStep(status, plan)`이 네트워크를 직접 호출하지 않고 다음 의도를 하나만 반환하게 한다.

```ts
export type StormExpeditionAutoplayStep =
  | { kind: "request"; request: StormExpeditionActionRequest; label: string }
  | { kind: "complete" }
  | { kind: "defeated" }
  | { kind: "conflict"; message: string };
```

테스트 픽스처를 상태별로 만들고 다음을 검증한다.

- 활성 원정 없음: 계획의 외곽 노드로 `start`
- 위험 제안 대기: 다른 행동보다 먼저 `decline`
- 미완료 전투: 최신 `currentNodeId`와 `encounterIndex`로 `fight`
- 보급·야영·제단·최종 정비: 정책 함수 결과로 `choose`
- 완료 체크포인트: `supply` 다음에는 계획의 중층, `altar` 다음에는 계획의 수호자, 그 외에는 유일한 다음 노드로 `move`
- 계획한 노드가 `availableNodeIds`에 없으면 `conflict`
- 서버 상태가 `complete`/`defeated`이면 추가 요청 없이 종료

예시:

```ts
expect(nextStormExpeditionAutoplayStep(atAltar, mixedRoutePlan)).toEqual({
  kind: "request",
  request: {
    action: "choose",
    choiceId: "swift_fate",
    expectedCurrentNodeId: "altar",
    expectedEncounterIndex: 0,
  },
  label: "폭풍 제단 선택 중",
});
```

**Step 3: RED 확인**

```bash
npx vitest run src/adventure/v2/stormExpeditionAutoplay.test.ts
```

Expected: 조정기 모듈이 없어 실패한다.

**Step 4: 순수 조정기 최소 구현**

`V2StormExpeditionView` 내부의 로컬 상태 타입을 복사하지 말고 조정기에 필요한 최소 구조 타입을 export한다. 서버 응답의 추가 필드는 구조적 타이핑으로 허용한다.

```ts
export function nextStormExpeditionAutoplayStep(
  status: StormExpeditionAutoplayStatus,
  plan: StormExpeditionAutoplayPlan,
): StormExpeditionAutoplayStep;
```

우선순위는 `terminal → plan compatibility → pending risk → current action → move`로 고정한다. 선택 카탈로그에서 정책이 반환한 ID를 찾을 수 없으면 임의의 첫 선택을 쓰지 말고 `conflict`를 반환한다.

**Step 5: 순차 실행기 테스트와 구현**

다음 얇은 실행기는 `request`가 resolve될 때마다 `onStatus`를 호출하고, 다음 반복 전에 `shouldStop()`을 확인한다.

```ts
export async function runStormExpeditionAutoplay({
  initialStatus,
  plan,
  request,
  onStatus,
  shouldStop,
}: StormExpeditionAutoplayRunnerOptions): Promise<StormExpeditionAutoplayRunResult>;
```

테스트에서는 `request` mock이 `start → fight → choose → move` 상태를 차례로 반환하게 한다. 다음을 검증한다.

- 동시에 요청이 두 개 열리지 않고 호출 순서가 정확함
- 각 응답이 즉시 `onStatus`에 전달됨
- `shouldStop`이 true가 된 뒤 다음 요청이 없음
- request reject, `{ error: "stale_state" }`, 계획 충돌에서 즉시 종료
- 완료와 패배가 정상 결과로 반환됨

네트워크 오류를 삼키지 말고 `{ kind: "error", error }`로 반환한다. `AbortController`로 이미 전송한 요청을 끊는 기능은 넣지 않는다.

**Step 6: 집중 검증과 커밋**

```bash
npx vitest run src/adventure/v2/stormExpeditionViewModel.test.ts src/adventure/v2/stormExpeditionAutoplay.test.ts
git add src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts src/adventure/v2/stormExpeditionAutoplay.ts src/adventure/v2/stormExpeditionAutoplay.test.ts
git commit -m "feat: orchestrate storm expedition autoplay"
```

---

### Task 3: 모든 노드를 열 수 있는 반응형 통합 지도 구현

**Files:**

- Create: `src/adventure/v2/StormExpeditionCommandMap.tsx`
- Create: `src/adventure/v2/StormExpeditionCommandMap.test.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.test.tsx`
- Modify: `src/adventure/v2/stormExpeditionMobileMap.ts`
- Modify: `src/adventure/v2/stormExpeditionMobileMap.test.ts`

**Step 1: 지도 노드 상호작용 회귀 테스트 변경**

현재의 “잠긴 노드는 disabled” 기대를 다음 계약으로 바꾼다.

```ts
it("현재·완료·이동 가능·잠긴 노드 모두 정보 모달을 열 수 있다", () => {
  const html = renderMap();
  expect(html).not.toMatch(/aria-label="뇌운 중층, 잠김"[^>]*disabled/);
  expect(html).toContain("뇌운 중층, 잠김, 정보 보기");
});
```

`selectedNodeId` 토글 계약을 제거하고 `onNodeOpen(nodeId)` 단일 이벤트로 바꾼다. 모든 노드는 `button`, 최소 `h-11 w-11` 이상, 이름+상태+행동을 포함한 `aria-label`을 가져야 한다.

**Step 2: 모바일 레이아웃 실패 테스트 작성**

기존 현재+다음 창에 다음 두 모드를 추가한다.

```ts
type StormExpeditionMobileMapModel =
  | { kind: "planning"; stages: readonly PlanningStage[] }
  | { kind: "active"; current: NodeLayout; candidates: readonly NodeLayout[]; completedSummary: string; futurePlan: string };
```

테스트는 출발 전 `외곽 항로 → 보급 → 중층 항로 → 야영/정예/제단 → 수호자 항로 → 최종 정비/심장` 요약이 세 선택 행과 고정 체크포인트로 만들어지는지, 진행 중에는 완료 구간을 문자열로 접고 현재와 다음 후보를 유지하는지 검증한다.

Run:

```bash
npx vitest run src/adventure/v2/stormExpeditionRouteMap.test.tsx src/adventure/v2/stormExpeditionMobileMap.test.ts
```

Expected: 새 props/모델이 없어 실패한다.

**Step 3: 지도와 모바일 모델 최소 구현**

`StormExpeditionRouteMap`의 props를 다음처럼 단순화한다.

```ts
type Props = {
  nodes: readonly StormExpeditionMapNode[];
  currentNodeId: StormExpeditionMapNodeId | null;
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  availableNodeIds: readonly StormExpeditionMapNodeId[];
  previewableNodeIds?: readonly StormExpeditionMapNodeId[];
  plan: StormExpeditionAutoplayPlan | null;
  onNodeOpen: (nodeId: StormExpeditionMapNodeId) => void;
};
```

PC의 전체 연결 그래프는 유지한다. 모바일은 CSS 축소판이 아니라 새 모바일 모델의 세 행/현재 창을 렌더한다. 계획한 경로에는 `예약` 문구를 붙이고 색상만으로 표현하지 않는다. 잠긴 노드는 클릭 가능하지만 이동 가능한 스타일과 구분한다.

**Step 4: 통합 지도 카드 테스트 작성**

`StormExpeditionCommandMap`이 다음을 같은 불투명 카드 안에 렌더하는지 정적 마크업으로 검증한다.

- 제목과 HP/MP
- `완료 6/9` 같은 진행률
- 직접/자동 진행 상태와 `aria-live`
- 출발 전 직접 진행 및 `일괄 진행 설정` 버튼
- 자동 진행 중 `현재 요청 후 중단` 버튼
- `StormExpeditionRouteMap`
- 지도 밖 별도 이동 버튼이 없음

```tsx
<StormExpeditionCommandMap
  status={fixtureStatus}
  plan={mixedRoutePlan}
  autoplay={{ state: "running", label: "뇌운 정예 전투 중" }}
  onNodeOpen={vi.fn()}
  onOpenAutoplayPlan={vi.fn()}
  onStopAutoplay={vi.fn()}
/>
```

**Step 5: 통합 지도 카드 구현 및 검증**

불투명 표면 상수를 사용하고 모바일 헤더는 줄바꿈되되 가로 overflow를 만들지 않는다. 상태 문구 영역은 `aria-live="polite"`로 둔다.

```bash
npx vitest run src/adventure/v2/StormExpeditionCommandMap.test.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/stormExpeditionMobileMap.test.ts
git add src/adventure/v2/StormExpeditionCommandMap.tsx src/adventure/v2/StormExpeditionCommandMap.test.tsx src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/stormExpeditionMobileMap.ts src/adventure/v2/stormExpeditionMobileMap.test.ts
git commit -m "feat: unify storm expedition controls on map"
```

---

### Task 4: 노드와 일괄 진행 설정을 접근 가능한 모달로 구현

**Files:**

- Create: `src/adventure/v2/StormExpeditionNodeDialog.tsx`
- Create: `src/adventure/v2/StormExpeditionNodeDialog.test.tsx`
- Create: `src/adventure/v2/StormExpeditionAutoPlanDialog.tsx`
- Create: `src/adventure/v2/StormExpeditionAutoPlanDialog.test.tsx`

**Step 1: 노드 모달 실패 테스트 작성**

`FishSpecimenExtractModal.tsx`의 `useEscapeKey`, `useModalA11y`, `role="dialog"`, `aria-modal="true"` 패턴을 그대로 따른다. 다음 discriminated union을 기준으로 각 모달을 테스트한다.

```ts
export type StormExpeditionNodeDialogModel =
  | { kind: "battle"; node: StormExpeditionMapNode; encounterIndex: number; encounterCount: number; /* 표시 데이터 */ }
  | { kind: "choice"; node: StormExpeditionMapNode; choiceKind: StormExpeditionChoiceKind; choices: readonly StormExpeditionChoice[]; /* 자원 */ }
  | { kind: "risk"; node: StormExpeditionMapNode; /* 이익/대가 */ }
  | { kind: "move"; node: StormExpeditionMapNode; disabledReason: string | null }
  | { kind: "completed"; node: StormExpeditionMapNode; summary: readonly string[] }
  | { kind: "locked"; node: StormExpeditionMapNode; reason: string };
```

검증 항목:

- 전투 모달에 적, 남은 연전, 예상 보상, `전투 시작`
- 선택 모달에는 서버가 실제 제시한 선택지만 표시
- 위험 모달의 이익/대가와 `수락`/`지나치기`
- 이동 모달의 `이 경로로 이동`
- 완료/잠김에는 진행 버튼 없음
- 요청 중 닫기와 행동 버튼 disabled
- 모든 주요 버튼 `min-h-11`, 제목 연결, 불투명 표면

**Step 2: 설정 모달 실패 테스트 작성**

설정 모달은 mode와 세 route, boon strategy를 모두 controlled value로 받고 `onChange`, `onSubmit`, `onClose`만 전달한다.

```tsx
<StormExpeditionAutoPlanDialog
  open
  value={mixedRoutePlan}
  attemptsLeft={2}
  onChange={vi.fn()}
  onSubmit={vi.fn()}
  onClose={vi.fn()}
/>
```

실전/연습, 외곽/중층/수호자 각각 칼바람·뇌운·잔해, 공격/생존/자원 전략이 모두 보이는지 검증한다. `attemptsLeft === 0`이면 실전은 비활성이고 연습은 가능해야 한다. 제출 버튼 바로 위에 다음 경고가 항상 있어야 한다.

```text
패배하면 임시 전리품을 모두 잃으며 자동 귀환하지 않습니다.
```

**Step 3: RED 확인**

```bash
npx vitest run src/adventure/v2/StormExpeditionNodeDialog.test.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.test.tsx
```

Expected: 새 모달 모듈이 없어 실패한다.

**Step 4: 모달 최소 구현**

기존 `BattleControls`, `ChoiceControls`, `RiskEventControls`, `RoutePreview`의 표시 로직은 복제하지 말고 노드 모달로 이동한다. 상세 리플레이 건너뛰기 선택은 전투 모델과 콜백에 유지한다. overlay 클릭/ESC/닫기 버튼은 `busy`가 아닐 때만 닫고, 최초 포커스와 이전 포커스 복귀를 `useModalA11y`에 맡긴다.

설정 모달의 선택 UI는 모바일에서 세로 한 열, 넓은 화면에서 필요한 경우 세 열로 배치한다. route 버튼은 최소 44px이며 선택 상태를 `aria-pressed`와 문구로 표시한다.

**Step 5: 검증과 커밋**

```bash
npx vitest run src/adventure/v2/StormExpeditionNodeDialog.test.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.test.tsx
git add src/adventure/v2/StormExpeditionNodeDialog.tsx src/adventure/v2/StormExpeditionNodeDialog.test.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.test.tsx
git commit -m "feat: add storm expedition map dialogs"
```

---

### Task 5: 직접 진행을 통합 지도와 노드 모달로 교체

**Files:**

- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.test.tsx`
- Modify: `src/adventure/v2/stormExpeditionViewModel.ts`
- Modify: `src/adventure/v2/stormExpeditionViewModel.test.ts`
- Delete: `src/adventure/v2/StormExpeditionActiveLayout.tsx`
- Delete: `src/adventure/v2/StormExpeditionActiveLayout.test.tsx`

**Step 1: 노드 의도 분류 실패 테스트 작성**

UI 조건문을 `V2StormExpeditionView`에 흩뜨리지 않고 순수 분류기로 고정한다.

```ts
expect(stormExpeditionNodeIntent("supply", activeAtGale)).toEqual({ kind: "move", targetNodeId: "supply" });
expect(stormExpeditionNodeIntent("gale_outer", activeAtGale)).toMatchObject({ kind: "battle" });
expect(stormExpeditionNodeIntent("gale_outer", activePastSupply)).toMatchObject({ kind: "completed" });
expect(stormExpeditionNodeIntent("thunder_guardian", activeAtGale)).toMatchObject({ kind: "locked" });
```

현재 노드에 위험 이벤트가 대기하면 전투/선택보다 `risk`가 먼저여야 한다. 미완료 체크포인트의 종류와 서버 `choices`를 조합해 모델을 만들되, 보상 텍스트 같은 화면 전용 데이터는 view에서 보강한다.

**Step 2: RED 확인 후 분류기 구현**

```bash
npx vitest run src/adventure/v2/stormExpeditionViewModel.test.ts
```

Expected: `stormExpeditionNodeIntent`가 없어 실패한다.

최소 구현 후 같은 명령으로 GREEN을 확인한다.

**Step 3: View의 요청 함수를 응답 반환형으로 정리**

기존 `act`가 상태만 바꾸고 끝나는 구조를 다음처럼 바꾼다.

```ts
const requestAction = useCallback(async (request: StormExpeditionActionRequest) => {
  setBusy(true);
  try {
    const response = await fetch("/api/v2/storm-expedition", { /* existing JSON contract */ });
    const json = await response.json();
    if (!response.ok) throw toStormExpeditionRequestError(json);
    setStatus(json.status);
    if (json.result) setResult(json.result);
    return json;
  } finally {
    setBusy(false);
  }
}, []);
```

직접 진행 콜백도 이 함수 하나를 사용한다. `stale_state`는 기존 새로고침 경로를 유지한다.

**Step 4: 통합 지도와 모달 연결**

다음 상태를 둔다.

```ts
const [openNodeId, setOpenNodeId] = useState<StormExpeditionMapNodeId | null>(null);
const [autoPlanOpen, setAutoPlanOpen] = useState(false);
```

- 노드 클릭: 분류 모델에 맞는 `StormExpeditionNodeDialog`를 연다.
- 수동 `start` 또는 `move` 성공: 응답의 새 `currentNodeId`를 `openNodeId`로 지정해 도착 모달을 자동으로 연다.
- 새로고침/초기 GET: `openNodeId`를 자동 설정하지 않는다.
- fight/choose/risk 응답 뒤 현재 모달 모델을 최신 상태로 갱신한다.
- 요청 중에는 모달 닫기와 지도 행동을 잠근다.

활성 화면은 다음 순서 하나로 만든다.

```tsx
<div className="space-y-4">
  <StormExpeditionCommandMap
    status={status}
    plan={autoplayPlan}
    autoplay={autoplayUi}
    onNodeOpen={setOpenNodeId}
    onOpenAutoplayPlan={() => setAutoPlanOpen(true)}
    onStopAutoplay={stopAutoplay}
  />
  <StormExpeditionSupportPanel
    active={active}
    result={result}
    onWithdraw={withdraw}
  />
  <StormExpeditionNodeDialog
    open={openNodeId !== null}
    model={openNodeDialogModel}
    busy={busy}
    onAction={handleNodeAction}
    onClose={() => setOpenNodeId(null)}
  />
</div>
```

`StormExpeditionActiveLayout`, 별도 `currentAction`, `RoutePreview`, 지도 밖 이동 버튼을 제거한다. 축복·위험·임시 전리품·귀환/연습 종료는 지도 아래 보조 패널에 유지하고 모바일에서는 `<details>` 또는 기존 Accordion 패턴으로 접는다. 요약 행에는 전리품 총량과 위험 유무가 항상 보인다.

**Step 5: View 회귀 테스트 보강**

순수/정적 렌더 가능한 경계를 이용해 다음을 검증한다.

- `StormExpeditionActiveLayout` 테스트 ID가 더 이상 없음
- 통합 지도 뒤에 support panel이 위치
- 외부 이동 확정 버튼이 없음
- 직접 이동 성공 모델이 새 현재 노드 모달을 열도록 만드는 helper 결과
- 위험/축복 표시 기존 테스트 유지

**Step 6: 집중 검증과 커밋**

```bash
npx vitest run src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts src/adventure/v2/StormExpeditionCommandMap.test.tsx src/adventure/v2/StormExpeditionNodeDialog.test.tsx
npx tsc --noEmit
git add src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts src/adventure/v2/StormExpeditionActiveLayout.tsx src/adventure/v2/StormExpeditionActiveLayout.test.tsx
git commit -m "refactor: drive storm expedition from route map"
```

---

### Task 6: 일괄 진행, 중단, 로컬 계획 재개와 결과 모달 연결

**Files:**

- Create: `src/adventure/v2/StormExpeditionAutoplayResultDialog.tsx`
- Create: `src/adventure/v2/StormExpeditionAutoplayResultDialog.test.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.test.tsx`

**Step 1: 결과/재개 UI 실패 테스트 작성**

결과 모달은 `complete`와 `defeated` 모델을 받는다.

```ts
type StormExpeditionAutoplayResultModel =
  | { kind: "complete"; rewards: readonly string[]; reachedNodeName: string }
  | { kind: "defeated"; lostLoot: readonly string[]; reachedNodeName: string };
```

완주에는 확정 보상, 패배에는 잃은 임시 전리품과 도달 지점을 표시한다. 재개 가능 상태용 UI helper는 `일괄 진행 재개`와 `직접 진행`을 둘 다 제공하고, 자동 시작 버튼은 렌더하지 않는지 테스트한다.

**Step 2: View에 버전 저장과 상태 추가**

```ts
type AutoplayUiState =
  | { kind: "idle" }
  | { kind: "resume_available"; plan: StormExpeditionAutoplayPlan }
  | { kind: "running"; label: string }
  | { kind: "stopping"; label: string }
  | { kind: "error"; message: string };

const stopAutoplayRef = useRef(false);
const autoplayRunIdRef = useRef(0);
```

초기 mount에서 `localStorage`의 실행 계획과 기본값을 각각 파싱한다. SSR 첫 렌더에서는 저장소를 읽지 않는다. 활성 원정 방문 이력과 실행 계획이 호환될 때만 `resume_available`, 충돌하면 실행 계획 키만 삭제한다.

설정 제출 시:

1. 계획과 기본값을 각각 저장
2. 설정 모달 닫기
3. `stopAutoplayRef.current = false`
4. 실행기를 시작

직접 진행 선택 시 실행 계획만 제거하고 기본값은 보존한다.

**Step 3: 자동 실행기 연결**

`runStormExpeditionAutoplay`의 `request`에는 Task 5의 `requestAction`을 전달한다. 자동 진행 동안 `busy`와 별도로 실행 상태를 표시하고 지도/수동 모달 입력을 막는다. 각 응답의 최신 status를 지도에 즉시 반영하되 노드 모달은 열지 않는다.

중단 버튼은 다음만 수행한다.

```ts
stopAutoplayRef.current = true;
setAutoplayUi((current) => ({ kind: "stopping", label: current.label }));
```

현재 요청이 끝나고 실행기가 `stopped`를 반환하면 `idle`로 바꾸며 서버 상태는 그대로 둔다. 재실행 방지를 위해 run id가 오래된 비동기 결과는 무시한다.

종료 처리:

- `complete`/`defeated`: 실행 계획 삭제, 기본값 보존, 결과 모달 열기
- `error`: 실행 계획 보존, 오류 안내와 직접 진행/재개 제공
- `stale_state`: 실행 중단, GET 새로고침, 호환성 재검사
- `conflict`: 실행 계획 삭제, 충돌 안내, 직접 진행 유지
- 귀환/연습 종료: 실행 계획 삭제

자동 진행은 결과와 관계없이 `withdraw`를 보내지 않는다.

**Step 4: 로컬 저장 및 모달 억제 회귀 테스트**

브라우저 저장 호출은 작은 함수로 분리해 mock storage로 검증한다.

```ts
expect(loadStormExpeditionResumePlan(storage, compatibleStatus)).toEqual(plan);
expect(loadStormExpeditionResumePlan(storage, conflictingStatus)).toBeNull();
expect(storage.removeItem).toHaveBeenCalledWith(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
```

또한 다음을 검증한다.

- 로드만으로 runner를 호출하지 않음
- 명시적 재개에서만 runner 호출
- 자동 응답에서 `openNodeId`를 설정하지 않음
- 수동 이동에서는 설정함
- 종료/귀환 시 실행 계획만 지우고 defaults는 보존

**Step 5: 집중 검증과 커밋**

```bash
npx vitest run src/adventure/v2/StormExpeditionAutoplayResultDialog.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts src/adventure/v2/stormExpeditionAutoplay.test.ts
npx tsc --noEmit
git add src/adventure/v2/StormExpeditionAutoplayResultDialog.tsx src/adventure/v2/StormExpeditionAutoplayResultDialog.test.tsx src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx
git commit -m "feat: enable storm expedition autoplay resume"
```

---

### Task 7: 모바일 실제 화면 흐름과 전체 회귀 검증

**Files:**

- Create: `e2e/support/stormExpeditionFixture.ts`
- Modify: `e2e/authenticated-flow.spec.ts`

**Step 1: 인증 화면용 결정론적 원정 API 픽스처 작성**

별도 dev route나 서버 우회 코드를 만들지 않는다. Playwright의 `page.route("**/api/v2/storm-expedition", handler)`로 이 API만 가로채고, GET에는 해금된 초기 status를 반환한다. POST body의 실제 action을 기록하고 다음 상태를 반환하는 작은 상태 기계를 test support에 둔다.

```ts
export async function installStormExpeditionApiFixture(page: Page) {
  const actions: Array<Record<string, unknown>> = [];
  let fixtureState = initialUnlockedStatus;

  await page.route("**/api/v2/storm-expedition", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: fixtureState });
      return;
    }
    const action = request.postDataJSON();
    actions.push(action);
    fixtureState = transitionFixture(fixtureState, action);
    await route.fulfill({ status: 200, json: fixtureState });
  });

  return { actions };
}
```

픽스처 전이는 실제 응답 형태를 따른다. 핵심 경로는 다음으로 짧게 구성하되 UI에는 실제 9개 지도 노드를 제공한다.

```text
start(gale_outer) → fight → move(supply) → choose(storm_oil)
→ move(thunder_middle) → fight → move(camp) → choose(balanced_rest)
→ move(thunder_elite) → fight → move(altar) → choose(swift_fate)
→ move(wreckage_guardian) → fight → move(final_prep) → choose(boss_slayer)
→ move(storm_heart) → fight → complete
```

각 POST에서 `expectedCurrentNodeId`, `expectedEncounterIndex`, 계획한 세 route ID, 위험 이벤트가 끼어든 경우 `decision: "decline"`도 assert할 수 있게 기록한다.

**Step 2: 모바일 직접 진행 테스트 작성**

기존 인증 setup으로 로그인/캐릭터 생성을 마친 뒤 fixture를 설치하고 원정 화면으로 이동한다.

```ts
test("폭풍 원정을 모바일 지도와 노드 모달에서 직접 진행한다", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  // fixture 설치 후 원정 화면 진입
  await page.getByRole("button", { name: /칼바람 외곽.*이동 가능/ }).click();
  await expect(page.getByRole("dialog")).toContainText("칼바람 외곽");
  await page.getByRole("button", { name: "이 경로로 이동" }).click();
  await expect(page.getByRole("dialog")).toContainText("전투 시작");
});
```

뷰포트 너비보다 `document.documentElement.scrollWidth`가 크지 않고, 별도 현재 행동 카드와 지도 밖 이동 버튼이 없으며 전리품 가방이 지도 뒤에 있는지도 확인한다.

**Step 3: 모바일 일괄 진행 테스트 작성**

설정 모달에서 외곽 칼바람, 중층 뇌운, 수호자 잔해, 공격 우선을 선택한다. 시작 후 추가 체크포인트 모달이 뜨지 않고 결과 요약 모달까지 진행되는지 기다린다.

```ts
await page.getByRole("button", { name: "일괄 진행 설정" }).click();
await page.getByRole("button", { name: /중층 항로.*뇌운/ }).click();
await page.getByRole("button", { name: /수호자 항로.*잔해/ }).click();
await page.getByRole("button", { name: "일괄 진행 시작" }).click();
await expect(page.getByRole("dialog", { name: /원정 완료/ })).toBeVisible();
```

기록된 actions에서 다음을 최종 assert한다.

```ts
expect(actions.filter(isMove).map((action) => action.targetNodeId)).toEqual(
  expect.arrayContaining(["thunder_middle", "wreckage_guardian"]),
);
expect(actions).toContainEqual(expect.objectContaining({ action: "choose", choiceId: "swift_fate" }));
expect(actions.some((action) => action.action === "withdraw")).toBe(false);
```

**Step 4: Playwright 집중 실행**

Run:

```bash
npx playwright test e2e/authenticated-flow.spec.ts --project=authenticated-mobile-webkit --grep "폭풍 원정"
```

Expected: 직접 진행과 일괄 진행 테스트가 통과한다. 로컬 인증 DB가 준비되지 않아 실행할 수 없다면 환경 오류 로그를 남기고 Vitest/타입/빌드 검증은 계속한다. 테스트 자체를 skip 처리해 숨기지 않는다.

**Step 5: 전체 정적·단위 검증**

```bash
npx eslint src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/StormExpeditionCommandMap.tsx src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionNodeDialog.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.tsx src/adventure/v2/StormExpeditionAutoplayResultDialog.tsx src/adventure/v2/stormExpeditionAutoplay.ts src/adventure/v2/stormExpeditionAutoplayPolicy.ts e2e/authenticated-flow.spec.ts e2e/support/stormExpeditionFixture.ts
npx tsc --noEmit
npm test -- --run
npm run build
```

Expected:

- ESLint 오류 없음
- TypeScript 오류 없음
- 전체 Vitest 통과
- 이미지 최적화/참조 검사와 production build 통과

**Step 6: 수동 코드 점검**

```bash
rg -n "StormExpeditionActiveLayout|storm-expedition-current-action|RoutePreview" src/adventure/v2
rg -n "withdraw" src/adventure/v2/stormExpeditionAutoplay.ts src/adventure/v2/V2StormExpeditionView.tsx
rg -n "bg-.*\/(20|40|70)|opacity-" src/adventure/v2/StormExpeditionCommandMap.tsx src/adventure/v2/StormExpeditionNodeDialog.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.tsx src/adventure/v2/StormExpeditionAutoplayResultDialog.tsx
git status --short
```

Expected:

- 제거 대상 레이아웃/미리보기 참조 없음
- 자동 조정기에는 `withdraw` 요청 없음
- 새 패널/카드에 임의 반투명 배경이나 컨테이너 전체 opacity 없음
- 작업 파일 외 사용자 변경이 커밋되지 않음

**Step 7: 최종 커밋**

```bash
git add e2e/support/stormExpeditionFixture.ts e2e/authenticated-flow.spec.ts
git commit -m "test: cover storm expedition mobile autoplay"
```

## 완료 전 확인표

- [ ] 수동 시작/이동 성공 뒤에만 도착 노드 모달이 자동으로 열린다.
- [ ] 초기 로드와 자동 진행에서는 체크포인트 모달이 자동으로 열리지 않는다.
- [ ] 현재, 완료, 이동 가능, 잠긴 노드를 모두 지도에서 열 수 있다.
- [ ] 진행 행동은 지도 노드 모달 안에만 있고 지도 밖 이동 버튼은 없다.
- [ ] 모바일 출발 전 세 구간을 한 번에 고를 수 있고 진행 중 현재/다음이 한 화면에 있다.
- [ ] 자동 진행은 각 응답 뒤 최신 expected node/index를 사용한다.
- [ ] 위험 이벤트는 항상 거절하고 금고와 귀환은 자동 선택하지 않는다.
- [ ] 패배 리스크 경고가 설정 제출 전에 보인다.
- [ ] 중단은 현재 요청 완료 뒤 적용되고 중복 요청이 없다.
- [ ] 새로고침 뒤 자동 재개하지 않고 명시적 재개만 제공한다.
- [ ] 완주·패배·귀환 때 실행 계획만 정리하고 다음 원정 기본값은 남긴다.
- [ ] 라이트·다크 모드에서 지도/모달/보조 카드가 불투명하다.
- [ ] Vitest, TypeScript, ESLint, build와 가능한 Playwright 모바일 검증이 통과한다.
- [ ] 배포와 점검 모드 변경을 실행하지 않았다.
