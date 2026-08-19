# Storm Expedition Quick Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폭풍 원정에서 경로 선택만 직접 남기고 전투 리플레이 생략, 전투 노드 이동 직후 전투 시작, 동일 노드 연속전을 한 번의 입력으로 처리한다.

**Architecture:** 기존 `start`, `move`, `fight` API와 서버 저장 규칙은 유지한다. 새 순수 비동기 조정 함수가 최신 응답의 활성 노드와 완료 상태를 읽어 필요한 `fight` 요청만 순차적으로 이어 보내며, `V2StormExpeditionView`는 응답마다 화면 상태를 갱신한다. 간편 진행 설정과 다음 경로 버튼은 작은 독립 컴포넌트로 분리해 로컬 저장과 UI를 직접 테스트한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind CSS 4

## Global Constraints

- 경로·야영·보급·제단·최종 정비·위험 이벤트 선택은 자동화하지 않는다.
- 전투 계산, 드롭 확률, 입장 횟수, 귀환 및 패배 규칙을 변경하지 않는다.
- 기존 `start`, `move`, `fight` API를 사용하고 데이터베이스 마이그레이션을 추가하지 않는다.
- 간편 진행 기본값은 켜짐이며 브라우저 로컬 저장소에 보존한다.
- 일반 진행에서는 기존 리플레이, 이동 확인, 전투 시작 흐름을 유지한다.
- 새 UI 표면은 `Card`, `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT` 중 목적에 맞는 불투명 표면을 사용한다.
- 배포하지 않는다.
- 사용자가 서브에이전트를 요청하지 않았으므로 모든 작업을 현재 세션에서 수행한다.

---

### Task 1: 간편 진행 순차 요청 조정기

**Files:**
- Create: `src/adventure/v2/stormExpeditionQuickProgress.ts`
- Create: `src/adventure/v2/stormExpeditionQuickProgress.test.ts`

**Interfaces:**
- Consumes: 기존 원정 응답의 `ok`, `error`, `state.active`, `nodes`, `success`, `failed`, `claimedRewards` 필드와 기존 `start | move | fight` 요청 형태.
- Produces: `STORM_EXPEDITION_QUICK_PROGRESS_STORAGE_KEY`, `parseStormExpeditionQuickProgressPreference(raw)`, `runStormExpeditionQuickProgress(options)`.

- [ ] **Step 1: 로컬 설정과 단일 전투 노드의 실패 테스트 작성**

```ts
expect(parseStormExpeditionQuickProgressPreference(null)).toBe(true);
expect(parseStormExpeditionQuickProgressPreference("false")).toBe(false);

const requests: StormExpeditionQuickRequest[] = [];
const final = await runStormExpeditionQuickProgress({
  initialRequest: {
    action: "move",
    targetNodeId: "gale_outer",
    expectedCurrentNodeId: "entrance",
    expectedEncounterIndex: 0,
  },
  request: async (request) => {
    requests.push(request);
    return requests.length === 1 ? movedBattle : completedBattle;
  },
});
expect(requests.map((request) => request.action)).toEqual(["move", "fight"]);
expect(final).toBe(completedBattle);
```

- [ ] **Step 2: 테스트를 실행해 모듈 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/stormExpeditionQuickProgress.test.ts`

Expected: FAIL because `stormExpeditionQuickProgress.ts` does not exist.

- [ ] **Step 3: 최소 타입과 설정 파서 구현**

```ts
export const STORM_EXPEDITION_QUICK_PROGRESS_STORAGE_KEY =
  "adventure.storm-expedition.quick-progress.v1";

export function parseStormExpeditionQuickProgressPreference(
  raw: string | null | undefined,
): boolean {
  return raw !== "false";
}
```

응답 타입은 조정기가 읽는 필드만 갖는 구조적 타입으로 정의한다. `active.currentNodeId`, `active.encounterIndex`, `active.completedNodeIds`와 `nodes[].kind`는 필수로 두고 그 외 UI 필드는 제네릭 응답에 보존한다.

- [ ] **Step 4: 순차 요청 루프 구현**

```ts
export async function runStormExpeditionQuickProgress<T extends StormExpeditionQuickStatus>({
  initialRequest,
  request,
  onResponse,
}: StormExpeditionQuickProgressOptions<T>): Promise<T> {
  let latest = await request(initialRequest);
  onResponse?.(latest);

  while (shouldFightCurrentNode(latest)) {
    const active = latest.state?.active;
    if (!active) break;
    latest = await request({
      action: "fight",
      expectedCurrentNodeId: active.currentNodeId,
      expectedEncounterIndex: active.encounterIndex,
    });
    onResponse?.(latest);
  }
  return latest;
}
```

`shouldFightCurrentNode`는 다음 조건을 모두 만족할 때만 참이다.

- `ok !== false`이고 `error`가 없다.
- 활성 원정이 존재한다.
- 현재 노드가 `kind === "battle"`이다.
- 현재 노드가 `completedNodeIds`에 없다.
- 직전 결과가 패배 또는 확정 보상 완료가 아니다.

- [ ] **Step 5: 선택 노드·연속전·패배·오류 중단 테스트 추가**

```ts
expect(choiceRequests).toEqual([expect.objectContaining({ action: "move" })]);
expect(multiRequests.map((request) => request.action)).toEqual([
  "move",
  "fight",
  "fight",
]);
expect(errorRequests).toHaveLength(1);
expect(failedRequests).toHaveLength(2);
```

각 전투 응답의 `encounterIndex`가 다음 요청의 `expectedEncounterIndex`로 전달되는지도 단언한다.

- [ ] **Step 6: 모듈 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/stormExpeditionQuickProgress.test.ts`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/adventure/v2/stormExpeditionQuickProgress.ts src/adventure/v2/stormExpeditionQuickProgress.test.ts
git commit -m "feat: orchestrate storm expedition quick progress"
```

### Task 2: 간편 진행 설정과 다음 경로 UI

**Files:**
- Create: `src/adventure/v2/StormExpeditionQuickControls.tsx`
- Create: `src/adventure/v2/StormExpeditionQuickControls.test.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`

**Interfaces:**
- Consumes: Task 1의 저장 키와 설정 파서, `StormExpeditionMapNode`, 현재 이동 가능 노드 ID 목록, `busy`, `onAdvance(nodeId)`.
- Produces: `StormExpeditionQuickProgressToggle`, `StormExpeditionQuickNextRoutes`.

- [ ] **Step 1: 불투명 표면과 접근 가능한 문구를 검증하는 실패 테스트 작성**

```tsx
const toggle = renderToStaticMarkup(
  <StormExpeditionQuickProgressToggle
    checked
    busy={false}
    onChange={vi.fn()}
  />,
);
expect(toggle).toContain("간편 진행");
expect(toggle).toContain("이동 후 전투 자동 시작");
expect(toggle).toContain('checked=""');

const routes = renderToStaticMarkup(
  <StormExpeditionQuickNextRoutes
    nodes={nodes}
    availableNodeIds={["gale_outer", "supply"]}
    busy={false}
    onAdvance={vi.fn()}
  />,
);
expect(routes).toContain("다음 경로");
expect(routes).toContain("질풍 외곽");
expect(routes).toContain("보급 지점");
expect(routes).toContain("선택 즉시 전투 시작");
```

- [ ] **Step 2: 테스트를 실행해 컴포넌트 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/StormExpeditionQuickControls.test.tsx`

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: 설정 토글 구현**

`StormExpeditionQuickProgressToggle`은 `label` 전체를 클릭 대상으로 만들고 체크박스, 제목, `전투 기록을 생략하고 경로 이동 후 전투를 자동으로 시작합니다.` 설명을 표시한다. `busy`일 때 체크박스를 비활성화한다.

- [ ] **Step 4: 다음 경로 카드 구현**

```tsx
export function StormExpeditionQuickNextRoutes({
  nodes,
  availableNodeIds,
  busy,
  onAdvance,
}: Props) {
  const available = availableNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is StormExpeditionMapNode => node != null);
  if (available.length === 0) return null;
  return (
    <Card padding="md" className="space-y-3">
      <h3 className="font-bold">다음 경로</h3>
      {available.map((node) => (
        <button
          key={node.id}
          type="button"
          disabled={busy}
          aria-label={`${node.name} 경로로 진행`}
          onClick={() => onAdvance(node.id)}
          className={`${SURFACE_INSET} w-full p-3 text-left`}
        >
          <strong>{node.name}</strong>
          <span>{node.description}</span>
          <span>{node.kind === "battle" ? "선택 즉시 전투 시작" : "이동 후 선택 진행"}</span>
        </button>
      ))}
    </Card>
  );
}
```

- [ ] **Step 5: busy 비활성화와 선택 노드 문구 테스트 추가**

```tsx
expect(busyHtml).toContain("disabled");
expect(choiceHtml).toContain("이동 후 선택 진행");
```

- [ ] **Step 6: 컴포넌트 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/StormExpeditionQuickControls.test.tsx`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/adventure/v2/StormExpeditionQuickControls.tsx src/adventure/v2/StormExpeditionQuickControls.test.tsx
git commit -m "feat: add storm expedition quick controls"
```

### Task 3: 원정 화면에 간편 진행 연결

**Files:**
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.test.tsx`
- Modify: `src/adventure/v2/stormExpeditionViewModel.test.ts`

**Interfaces:**
- Consumes: Task 1의 `runStormExpeditionQuickProgress`, 저장 키·파서와 Task 2의 두 컴포넌트.
- Produces: 일반 진행용 `act`, 간편 진행용 `quickAct`, 저장되는 `quickProgress` UI 상태.

- [ ] **Step 1: 초기값과 저장 동작을 순수 헬퍼 테스트로 고정**

`V2StormExpeditionView.test.tsx` 또는 Task 1 테스트에서 다음을 단언한다.

```ts
expect(parseStormExpeditionQuickProgressPreference(undefined)).toBe(true);
expect(parseStormExpeditionQuickProgressPreference("true")).toBe(true);
expect(parseStormExpeditionQuickProgressPreference("false")).toBe(false);
```

기존 `stormExpeditionStartRequest`와 `stormExpeditionMoveRequest`의 요청 필드가 바뀌지 않았는지도 기존 테스트를 유지한다.

- [ ] **Step 2: 서버 요청 공통 함수 분리**

`V2StormExpeditionView` 안에 `requestAction(request)` 콜백을 만들고 다음만 수행한다.

```ts
const response = await fetch("/api/v2/storm-expedition", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
const json = await response.json().catch(() => null) as ExpeditionStatus | null;
if (!json) return { ok: false, error: "network" } as ExpeditionStatus;
setStatus(json);
if (json.claimedRewards) await refreshGameState();
return json;
```

기존 `act`는 `busy`를 관리하면서 `requestAction`을 한 번 호출하고, 일반 진행에서는 종전과 동일하게 리플레이를 포함한 `result`를 설정한다.

- [ ] **Step 3: 간편 진행 콜백 연결**

```ts
const quickAct = useCallback(async (initialRequest: StormExpeditionQuickRequest) => {
  setBusy(true);
  try {
    const final = await runStormExpeditionQuickProgress({
      initialRequest,
      request: requestAction,
      onResponse: setStatus,
    });
    setResult({ ...final, replay: undefined });
    setSelectedNodeId(null);
  } catch {
    setResult({ ok: false, error: "network" });
  } finally {
    setBusy(false);
  }
}, [requestAction]);
```

`requestAction` 자체에서 네트워크 오류를 구조화해 반환하면 `quickAct`의 catch는 예상하지 못한 예외만 처리한다.

- [ ] **Step 4: 로컬 저장 설정 연결**

```ts
const [quickProgress, setQuickProgress] = useState(true);

useEffect(() => {
  try {
    setQuickProgress(parseStormExpeditionQuickProgressPreference(
      window.localStorage.getItem(STORM_EXPEDITION_QUICK_PROGRESS_STORAGE_KEY),
    ));
  } catch {
    setQuickProgress(true);
  }
}, []);

const changeQuickProgress = (next: boolean) => {
  setQuickProgress(next);
  try {
    window.localStorage.setItem(
      STORM_EXPEDITION_QUICK_PROGRESS_STORAGE_KEY,
      String(next),
    );
  } catch {
    // 저장소를 쓸 수 없어도 현재 화면 설정은 유지한다.
  }
};
```

입구 모드 선택 영역과 활성 원정의 현재 행동 카드에 `StormExpeditionQuickProgressToggle`을 표시한다.

- [ ] **Step 5: 시작·이동·재시도 분기 연결**

- 첫 항로 시작: `quickProgress ? quickAct(startRequest) : act("start", startRequest)`.
- 다음 경로 카드: 항상 `quickAct(moveRequest)`이며 이 카드는 간편 진행일 때만 표시한다.
- 일반 진행: 기존 지도 선택과 `RoutePreview`의 `move` 요청을 유지한다.
- 현재 전투 시작: 간편 진행이면 `quickAct(fightRequest)`, 일반 진행이면 기존 `act("fight", payload)`.
- 간편 진행에서는 완료된 체크포인트의 기존 `RoutePreview` 확인 카드를 숨기고 `StormExpeditionQuickNextRoutes`를 표시한다.

- [ ] **Step 6: BattleControls의 기존 옵션 정리**

`BattleControls`에서 `skipReplay`, `onSkipReplay` props와 `전투 결과 바로 보기` 체크박스를 제거한다. 상위의 `간편 진행` 토글이 리플레이 생략과 자동 전투를 함께 제어한다. 전투 시작 버튼의 busy 문구는 간편 진행 중 `다음 전투 진행 중...`, 일반 진행 중 `전투 중...`으로 구분한다.

- [ ] **Step 7: 화면 및 모델 테스트 실행**

Run: `npx vitest run src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts src/adventure/v2/StormExpeditionQuickControls.test.tsx src/adventure/v2/stormExpeditionQuickProgress.test.ts`

Expected: PASS.

- [ ] **Step 8: 타입 검사 실행**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 9: 커밋**

```bash
git add src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts
git commit -m "feat: streamline storm expedition progression"
```

### Task 4: 원정 회귀 및 완료 검증

**Files:**
- Verify: `src/app/api/v2/storm-expedition/route.test.ts`
- Verify: `src/lib/server/stormExpeditionRoute.test.ts`
- Verify: `src/adventure/data/v2/stormExpedition.test.ts`
- Verify: `src/adventure/data/v2/stormExpeditionMap.test.ts`
- Verify: all changed source and test files

**Interfaces:**
- Consumes: Tasks 1–3의 최종 동작.
- Produces: 검증된 기능 브랜치와 깨끗한 작업 트리.

- [ ] **Step 1: 원정 집중 회귀 테스트 실행**

Run: `npx vitest run src/adventure/v2/stormExpeditionQuickProgress.test.ts src/adventure/v2/StormExpeditionQuickControls.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts src/app/api/v2/storm-expedition/route.test.ts src/lib/server/stormExpeditionRoute.test.ts src/adventure/data/v2/stormExpedition.test.ts src/adventure/data/v2/stormExpeditionMap.test.ts`

Expected: all listed test files pass.

- [ ] **Step 2: 전체 테스트 실행**

Run: `env CI=1 npx vitest run --testTimeout=30000 --reporter=dot`

Expected: exit code 0 with no failed tests.

- [ ] **Step 3: 정적 검사 실행**

Run: `npm run lint`

Expected: exit code 0.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 4: 프로덕션 빌드 실행**

Run: `npm run build`

Expected: image checks and Next.js production build exit code 0.

- [ ] **Step 5: 변경 범위와 작업 트리 확인**

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: no uncommitted files after the final commit.

- [ ] **Step 6: 검증 중 필요한 수정이 있으면 별도 커밋**

```bash
git add src/adventure/v2/stormExpeditionQuickProgress.ts src/adventure/v2/stormExpeditionQuickProgress.test.ts src/adventure/v2/StormExpeditionQuickControls.tsx src/adventure/v2/StormExpeditionQuickControls.test.tsx src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts
git commit -m "fix: stabilize storm expedition quick progress"
```

수정이 없다면 새 커밋을 만들지 않는다. 배포, 푸시, PR 생성 또는 다른 브랜치 통합은 수행하지 않는다.
