# 가능한 만큼 수행 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수행 초기화 후 보유 숙달 포인트로 가능한 수행을 안전하게 한 번에 처리하는 버튼을 추가한다.

**Architecture:** 도메인 계층에 기존 `applyCultivation` 1회 동작을 순차 반복하는 일괄 함수를 추가한다. 기존 POST 라우트는 본문 없는 1회 호출을 유지하고 `{ mode: "max" }`에서만 일괄 모드를 사용한다. UI는 현재 카드의 불투명 표면을 유지하며 기존 버튼 옆에 일괄 버튼과 요약 메시지를 추가한다.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19 Client Components, TypeScript, Vitest, React DOM server rendering tests.

## Global Constraints

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `05-server-and-client-components.md`를 전체 읽고 현재 Next.js API를 따른다.
- 기존 본문 없는 `POST /api/v2/me/cultivate`는 수행 1회 호환성을 유지한다.
- 수행 비용, RNG 확률, 스탯 프로필, 초기화 비용을 바꾸지 않는다.
- 요청당 일괄 수행은 10,000회로 제한하고 남은 수행 가능 여부를 `hasMore`로 반환한다.
- 기존 UI 표면 클래스를 유지하고 반투명 카드를 추가하지 않는다.
- 배포하지 않고 점검 모드를 변경하지 않는다.

---

### Task 1: 순차 일괄 수행 도메인 함수

**Files:**
- Modify: `src/adventure/data/v2/proficiency.ts:717-802`
- Test: `src/adventure/data/v2/proficiency.test.ts`

**Interfaces:**
- Consumes: 기존 `applyCultivation(p, group, rng, targetStat, jobId)`와 `cultivationCost(totalCapGains(p))`.
- Produces: `V2_CULTIVATION_BATCH_LIMIT`, `CultivationBatchResult`, `applyCultivationBatch(p, group, rng, jobId?, maxIterations?)`.

- [ ] **Step 1: 일괄 결과와 RNG 순차 적용을 재현하는 실패 테스트 작성**

```ts
it("가능한 만큼 수행하며 특별 수행을 다음 비용에 반영한다", () => {
  const rolls = [0.02, 0.5]; // 대성공 ×3, 일반 ×1
  const result = applyCultivationBatch(
    { ...emptyProficiency(), points: 88 },
    "warrior",
    () => rolls.shift() ?? 0.5,
  );

  expect(result).toMatchObject({
    performed: 2,
    spent: 88,
    greatSuccesses: 1,
    awakenings: 0,
    hasMore: false,
  });
  expect(usablePoints(result!.next)).toBe(0);
  expect(totalCapGains(result!.next)).toBe(16);
});

it("요청 상한에 도달하면 남은 수행 가능 여부를 알린다", () => {
  const result = applyCultivationBatch(
    { ...emptyProficiency(), points: 1_000 },
    "warrior",
    () => 0.5,
    undefined,
    2,
  );
  expect(result).toMatchObject({ performed: 2, spent: 40, hasMore: true });
});
```

- [ ] **Step 2: 도메인 테스트를 실행해 필요한 export가 없어 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts`

Expected: FAIL because `applyCultivationBatch` and `V2_CULTIVATION_BATCH_LIMIT` do not exist.

- [ ] **Step 3: 기존 1회 함수를 반복하는 최소 구현 추가**

```ts
export const V2_CULTIVATION_BATCH_LIMIT = 10_000;

export type CultivationBatchResult = {
  next: V2ProficiencyState;
  performed: number;
  spent: number;
  greatSuccesses: number;
  awakenings: number;
  redistributedGrowthPoints: number;
  lastMult: number;
  hasMore: boolean;
};

export function applyCultivationBatch(
  p: V2ProficiencyState,
  group: string,
  rng: () => number,
  jobId?: string | null,
  maxIterations = V2_CULTIVATION_BATCH_LIMIT,
): CultivationBatchResult | null {
  const limit = Math.max(1, Math.min(V2_CULTIVATION_BATCH_LIMIT, Math.floor(maxIterations)));
  let next = p;
  let performed = 0;
  let spent = 0;
  let greatSuccesses = 0;
  let awakenings = 0;
  let redistributedGrowthPoints = 0;
  let lastMult = 1;

  while (performed < limit) {
    const applied = applyCultivation(next, group, rng, undefined, jobId);
    if (!applied) break;
    next = applied.next;
    performed += 1;
    spent += applied.cost;
    redistributedGrowthPoints += applied.redistributedGrowthPoints;
    lastMult = applied.mult;
    if (applied.mult === 3) greatSuccesses += 1;
    if (applied.mult === 5) awakenings += 1;
  }
  if (performed === 0) return null;

  return {
    next,
    performed,
    spent,
    greatSuccesses,
    awakenings,
    redistributedGrowthPoints,
    lastMult,
    hasMore: usablePoints(next) >= cultivationCost(totalCapGains(next)),
  };
}
```

- [ ] **Step 4: 도메인 테스트 통과 확인**

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts`

Expected: PASS.

- [ ] **Step 5: 도메인 변경 커밋**

```bash
git add src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts
git commit -m "feat: add max cultivation domain operation"
```

### Task 2: POST 라우트 일괄 모드와 전광판 보존

**Files:**
- Modify: `src/app/api/v2/me/cultivate/route.ts`
- Test: `src/app/api/v2/me/cultivate/route.test.ts`

**Interfaces:**
- Consumes: Task 1의 `applyCultivationBatch` 결과.
- Produces: `POST(req?: Request)`의 `{ mode: "max" }` 본문 지원과 공통 응답 필드 `performed`, `spent`, `greatSuccesses`, `awakenings`, `redistributedGrowthPoints`, `hasMore`.

- [ ] **Step 1: 하위 호환과 일괄 요청을 재현하는 실패 라우트 테스트 작성**

```ts
it("mode=max는 다음 비용을 낼 수 없을 때까지 한 트랜잭션에서 수행한다", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  mocks.store.set("proficiency.v2", { ...emptyProficiency(), points: 40 });

  const response = await POST(new Request("http://localhost/api/v2/me/cultivate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "max" }),
  }));
  const json = await response.json();

  expect(json).toMatchObject({ ok: true, performed: 2, spent: 40, points: 0, hasMore: false });
  expect(mocks.store.get("proficiency.v2")).toMatchObject({ points: 0 });
});

it("본문 없는 기존 요청은 1회만 수행한다", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const response = await POST();
  expect(await response.json()).toMatchObject({ ok: true, performed: 1, mult: 1 });
});

it("일괄 수행에서 발생한 각성 횟수만큼 소식을 기록한다", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  mocks.store.set("proficiency.v2", { ...emptyProficiency(), points: 136 });
  const response = await POST(maxRequest());
  expect(await response.json()).toMatchObject({ awakenings: 2 });
  expect(mocks.insertFeedEntry).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: 라우트 테스트를 실행해 `mode=max`가 아직 1회만 처리하거나 시그니처 불일치로 실패하는지 확인**

Run: `npm test -- src/app/api/v2/me/cultivate/route.test.ts`

Expected: FAIL on batch count/response fields or `POST` signature.

- [ ] **Step 3: Request 본문을 파싱하고 1회·일괄을 공통 결과로 저장하도록 라우트 구현**

```ts
export async function POST(req?: Request) {
  const requestBody = req
    ? await req.json().catch(() => null) as { mode?: unknown } | null
    : null;
  const isMax = requestBody?.mode === "max";

  const applied = applyCultivationBatch(
    prof,
    group,
    Math.random,
    jobId,
    isMax ? V2_CULTIVATION_BATCH_LIMIT : 1,
  );
  if (!applied) {
    return {
      status: 400,
      body: {
        ok: false as const,
        error: "insufficient_proficiency" as const,
        required: cultivationCost(totalCapGains(prof)),
        have: usablePoints(prof),
      },
    };
  }
  await upsertSave(tx, userId, "proficiency.v2", applied.next);

  return {
    status: 200,
    body: {
      ok: true as const,
      spent: applied.spent,
      mult: applied.lastMult,
      performed: applied.performed,
      greatSuccesses: applied.greatSuccesses,
      awakenings: applied.awakenings,
      redistributedGrowthPoints: applied.redistributedGrowthPoints,
      hasMore: applied.hasMore,
    },
  };
}

if (result.body.ok) {
  for (let i = 0; i < result.body.awakenings; i += 1) {
    await insertFeedEntry(userId, "cultivation_awakening", { cultivationMult: 5 });
  }
}
```

- [ ] **Step 4: 라우트 테스트 통과 확인**

Run: `npm test -- src/app/api/v2/me/cultivate/route.test.ts`

Expected: PASS.

- [ ] **Step 5: 라우트 변경 커밋**

```bash
git add src/app/api/v2/me/cultivate/route.ts src/app/api/v2/me/cultivate/route.test.ts
git commit -m "feat: support max cultivation requests"
```

### Task 3: 일괄 수행 버튼과 결과 요약

**Files:**
- Create: `src/adventure/v2/CultivationActions.tsx`
- Create: `src/adventure/v2/CultivationActions.test.tsx`
- Modify: `src/adventure/v2/V2CultivationView.tsx:206-272,471-498`

**Interfaces:**
- Consumes: Task 2의 공통 응답 필드와 `{ mode: "max" }` Request 본문.
- Produces: `CultivationRunSummary`, `cultivationRequestInit(mode)`, `CultivationActions`, `cultivationCompletionMessage(summary, mode, fallbackSpent)`.

- [ ] **Step 1: 버튼 표시·비활성과 요약 메시지 실패 테스트 작성**

```tsx
it("기존 1회 버튼과 가능한 만큼 버튼을 함께 노출한다", () => {
  const html = renderToStaticMarkup(
    <CultivationActions canCultivate busy={false} isLifestyleJob={false}
      onCultivate={() => undefined} onCultivateMax={() => undefined} />,
  );
  expect(html).toContain("수행</button>");
  expect(html).toContain("가능한 만큼 수행");
  expect(html).not.toContain('disabled=""');
});

it("수행할 수 없으면 두 버튼을 모두 비활성화한다", () => {
  const html = renderToStaticMarkup(
    <CultivationActions canCultivate={false} busy={false} isLifestyleJob={false}
      onCultivate={() => undefined} onCultivateMax={() => undefined} />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});

it("일괄 수행 결과를 횟수·소모·특별 결과로 요약한다", () => {
  expect(cultivationCompletionMessage({
    performed: 12,
    spent: 345,
    greatSuccesses: 2,
    awakenings: 1,
    redistributedGrowthPoints: 8,
    hasMore: false,
    mult: 1,
  }, "max", 0)).toBe(
    "✓ 수행 12회 완료 (숙달 포인트 -345) · 대성공 2회 · 각성 1회 · 성장 재분배 +8",
  );
});

it("가능한 만큼 수행은 mode=max JSON 요청을 만든다", () => {
  const init = cultivationRequestInit("max");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ "content-type": "application/json" });
  expect(JSON.parse(String(init.body))).toEqual({ mode: "max" });
});

it("요청 상한 도달 시 추가 수행 가능을 알린다", () => {
  const message = cultivationCompletionMessage({
    performed: 10_000,
    spent: 1_000_000,
    hasMore: true,
  }, "max", 0);
  expect(message).toContain("남은 포인트로 추가 수행 가능");
});
```

- [ ] **Step 2: UI 테스트를 실행해 새 표시 컴포넌트가 없어 실패하는지 확인**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

Expected: FAIL because `CultivationActions.tsx` does not exist.

- [ ] **Step 3: 불투명 버튼 표면과 결과 메시지 헬퍼 구현**

```tsx
export type CultivationRunSummary = {
  performed?: number;
  spent?: number;
  greatSuccesses?: number;
  awakenings?: number;
  redistributedGrowthPoints?: number;
  hasMore?: boolean;
  mult?: number;
};

export function cultivationRequestInit(mode: "once" | "max"): RequestInit {
  return mode === "max"
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "max" }),
      }
    : { method: "POST" };
}

export function cultivationCompletionMessage(
  summary: CultivationRunSummary,
  mode: "once" | "max",
  fallbackSpent: number,
): string {
  const spent = summary.spent ?? fallbackSpent;
  const redistributed = summary.redistributedGrowthPoints ?? 0;
  if (mode === "once") {
    const outcome = summary.mult === 5 ? " · 각성 ×5!" : summary.mult === 3 ? " · 대성공 ×3!" : "";
    const redistribution = redistributed > 0 ? ` · 성장 재분배 +${redistributed}` : "";
    return `✓ 수행 완료 (숙달 포인트 -${spent})${outcome}${redistribution}`;
  }

  const details = [
    (summary.greatSuccesses ?? 0) > 0 ? `대성공 ${summary.greatSuccesses}회` : "",
    (summary.awakenings ?? 0) > 0 ? `각성 ${summary.awakenings}회` : "",
    redistributed > 0 ? `성장 재분배 +${redistributed}` : "",
    summary.hasMore ? "남은 포인트로 추가 수행 가능" : "",
  ].filter(Boolean);
  return `✓ 수행 ${summary.performed ?? 0}회 완료 (숙달 포인트 -${spent})${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

export function CultivationActions(props: {
  canCultivate: boolean;
  busy: boolean;
  isLifestyleJob: boolean;
  onCultivate: () => void;
  onCultivateMax: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button onClick={props.onCultivate} disabled={!props.canCultivate} variant="success" size="md">
        {props.busy ? "처리 중…" : props.isLifestyleJob ? "수행 불가" : "수행"}
      </Button>
      <Button onClick={props.onCultivateMax} disabled={!props.canCultivate} variant="primary" size="md">
        {props.busy ? "수행 중…" : "가능한 만큼 수행"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: `V2CultivationView` 요청 함수를 1회·일괄 공통 경로로 바꾸고 최종 상태 반영**

현재 콜백을 아래와 같이 1회·일괄 공통 경로로 교체한다.

```ts
const cultivate = useCallback(async (mode: "once" | "max") => {
  setBusy(true);
  setMsg(null);
  try {
  const res = await fetch("/api/v2/me/cultivate", cultivationRequestInit(mode));
  const j = (await res.json().catch(() => null)) as (CultivationRunSummary & {
    ok?: boolean;
    error?: string;
    caps?: Partial<Record<V2StatKey, number>>;
    cultivations?: number;
    capGains?: number;
    points?: number;
    nextCost?: number;
    cultivationPointsSpent?: number;
    growthRespecPoints?: number;
    required?: number;
    have?: number;
  }) | null;
  if (!j?.ok) {
    const label = j?.error === "no_class"
      ? "직업이 없어요 (먼저 직업을 선택하세요)"
      : j?.error === "lifestyle_job"
        ? "생활직은 수행할 수 없습니다"
        : j?.error === "insufficient_proficiency"
          ? `숙달 포인트 부족 (필요 ${j.required ?? nextCost}, 보유 ${j.have ?? usable})`
          : (j?.error ?? `http ${res.status}`);
    setMsg(`✗ ${label}`);
    return;
  }
  setMsg(cultivationCompletionMessage(j, mode, nextCost));
  setCaps(j.caps ?? caps);
  setCultivations(j.cultivations ?? cultivations + (j.performed ?? 1));
  setCapGains(j.capGains ?? capGains);
  setUsable(j.points ?? usable);
  setCultivationPointsSpent(j.cultivationPointsSpent ?? cultivationPointsSpent);
  setGrowthRespecPoints(j.growthRespecPoints ?? growthRespecPoints);
  setNextCost(j.nextCost ?? nextCost);
  if ((j.redistributedGrowthPoints ?? 0) > 0) {
    await Promise.all([refresh(), refreshGameState()]);
  }
  } catch (err) {
    setMsg(`✗ ${(err as Error).message}`);
  } finally {
    setBusy(false);
  }
}, [
  capGains,
  caps,
  cultivationPointsSpent,
  cultivations,
  growthRespecPoints,
  nextCost,
  refresh,
  refreshGameState,
  setMsg,
  usable,
]);
```

- [ ] **Step 5: UI 테스트와 관련 라우트 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx src/app/api/v2/me/cultivate/route.test.ts`

Expected: PASS.

- [ ] **Step 6: UI 변경 커밋**

```bash
git add src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/V2CultivationView.tsx
git commit -m "feat: add max cultivation action"
```

### Task 4: 전체 회귀 검증

**Files:**
- Verify only; no production file changes expected.

**Interfaces:**
- Consumes: Tasks 1–3의 도메인, 라우트, UI 결과.
- Produces: 완료 근거.

- [ ] **Step 1: 관련 테스트 재실행**

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts src/app/api/v2/me/cultivate/route.test.ts src/adventure/v2/CultivationActions.test.tsx`

Expected: PASS with zero failures.

- [ ] **Step 2: 변경 파일 ESLint 검사**

Run: `npx eslint src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts src/app/api/v2/me/cultivate/route.ts src/app/api/v2/me/cultivate/route.test.ts src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/V2CultivationView.tsx`

Expected: exit 0 with no errors.

- [ ] **Step 3: TypeScript 검사**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 4: 전체 테스트**

Run: `npm test`

Expected: all test files pass, existing intentional skips only.

- [ ] **Step 5: 변경 범위와 공백 오류 검사**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated pre-existing worktree changes remain untouched.
