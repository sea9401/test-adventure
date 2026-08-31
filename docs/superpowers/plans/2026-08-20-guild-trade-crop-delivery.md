# Guild Trade Crop Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 농작물 계약의 실물 요구량을 작물 등급에 맞게 낮추고 계약 카드에 최대 10점 빠른 납품 동작을 추가한다.

**Architecture:** 교역 카탈로그에 다른 채집품과 동일한 명시적 농작물 환산표를 추가해 기존 API가 변경된 `batchSize`와 `pointValue`를 그대로 소비하게 한다. UI에는 계약의 `maxBatches`와 `pointValue`만 사용하는 순수 계산 함수를 두고, 기존 `batches` POST 요청을 재사용한다.

**Tech Stack:** TypeScript, React 19 Client Components, Next.js 16 Route Handlers, Vitest

## Global Constraints

- 초반 농작물은 현재 난이도를 대체로 유지하고 사탕수수·카카오는 1개당 2점으로 조정한다.
- 기존 계약 목표, 완료 보상, 개인 한도와 서버 검증 규칙은 변경하지 않는다.
- 콘텐츠 패널은 기존 `SURFACE_INSET` 불투명 표면을 유지한다.
- 배포와 점검 모드 변경은 수행하지 않는다.
- 사용자의 기존 전투 관련 작업 트리 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 농작물 등급별 교역 환산율

**Files:**
- Modify: `src/adventure/data/v2/guildTrade.ts`
- Test: `src/adventure/data/v2/guildTrade.test.ts`

**Interfaces:**
- Consumes: `FARM_TRADE_ITEM_IDS`, `GuildTradeItem.batchSize`, `GuildTradeItem.pointValue`
- Produces: `FARM_TRADE_BATCH` 내부 환산표와 그 값을 포함한 `GUILD_TRADE_ITEMS`

- [ ] **Step 1: 작물 환산 결과를 검증하는 실패 테스트 작성**

`guildTrade.test.ts`에 실제 공개 카탈로그의 농작물 항목을 읽는 테스트를 추가한다. 기대값은 생산 코드의 계산을 재사용하지 않고 아래 리터럴로 고정한다.

```ts
it("농작물 계약은 성장 단계에 따라 적은 수량으로 같은 점수를 낸다", () => {
  expect(
    GUILD_TRADE_ITEMS.filter((item) => item.category === "farm").map(
      ({ sourceItemId, batchSize, pointValue }) => [
        sourceItemId,
        batchSize,
        pointValue,
      ],
    ),
  ).toEqual([
    ["wheat", 5, 1],
    ["herb", 4, 1],
    ["corn", 3, 1],
    ["tomato", 3, 1],
    ["strawberry", 2, 1],
    ["potato", 2, 1],
    ["onion", 1, 1],
    ["rice", 1, 1],
    ["soybean", 1, 1],
    ["sugarcane", 1, 2],
    ["cacao", 1, 2],
  ]);
});
```

- [ ] **Step 2: 대상 테스트를 실행해 기존 일괄 5개/1점 때문에 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts`

Expected: FAIL. 허브부터 카카오까지 실제 값 `[itemId, 5, 1]`이 기대 환산표와 다르다고 표시되어야 한다.

- [ ] **Step 3: 명시적 농작물 환산표를 최소 구현**

`FARM_TRADE_ITEM_IDS` 바로 아래에 다음 표를 추가하고 `farmItems` 생성 시 펼친다.

```ts
const FARM_TRADE_BATCH: Record<
  (typeof FARM_TRADE_ITEM_IDS)[number],
  { batchSize: number; pointValue: number }
> = {
  wheat: { batchSize: 5, pointValue: 1 },
  herb: { batchSize: 4, pointValue: 1 },
  corn: { batchSize: 3, pointValue: 1 },
  tomato: { batchSize: 3, pointValue: 1 },
  strawberry: { batchSize: 2, pointValue: 1 },
  potato: { batchSize: 2, pointValue: 1 },
  onion: { batchSize: 1, pointValue: 1 },
  rice: { batchSize: 1, pointValue: 1 },
  soybean: { batchSize: 1, pointValue: 1 },
  sugarcane: { batchSize: 1, pointValue: 2 },
  cacao: { batchSize: 1, pointValue: 2 },
};
```

`farmItems`의 고정 `batchSize`와 `pointValue`를 `...FARM_TRADE_BATCH[itemId]`로 바꾼다.

- [ ] **Step 4: 데이터 테스트를 다시 실행해 통과 확인**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts`

Expected: PASS.

- [ ] **Step 5: 농작물 환산 변경 커밋**

```bash
git add src/adventure/data/v2/guildTrade.ts src/adventure/data/v2/guildTrade.test.ts
git commit -m "balance: scale guild crop trade values"
```

---

### Task 2: 최대 10점 빠른 납품

**Files:**
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx`
- Test: `src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

**Interfaces:**
- Consumes: 계약의 `maxBatches: number`, `pointValue: number`
- Produces: `guildTradeQuickDelivery(contract): { batches: number; points: number }`와 해당 결과를 전송하는 계약 카드 버튼

- [ ] **Step 1: 빠른 납품 계산을 검증하는 실패 테스트 작성**

`GuildTradePostPanel.test.tsx`에서 새 함수를 import하고 실제 계약 경계값을 리터럴로 검증한다.

```ts
it.each([
  [{ maxBatches: 21, pointValue: 1 }, { batches: 10, points: 10 }],
  [{ maxBatches: 20, pointValue: 3 }, { batches: 3, points: 9 }],
  [{ maxBatches: 20, pointValue: 8 }, { batches: 1, points: 8 }],
  [{ maxBatches: 4, pointValue: 1 }, { batches: 4, points: 4 }],
  [{ maxBatches: 0, pointValue: 1 }, { batches: 0, points: 0 }],
])("10점을 넘지 않는 완전한 묶음을 계산한다 %#", (contract, expected) => {
  expect(guildTradeQuickDelivery(contract)).toEqual(expected);
});
```

- [ ] **Step 2: 대상 테스트를 실행해 함수가 없어 실패하는지 확인**

Run: `npm test -- src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

Expected: FAIL with `guildTradeQuickDelivery is not a function` 또는 export 누락 오류.

- [ ] **Step 3: 순수 계산 함수와 빠른 납품 버튼 최소 구현**

`GuildTradePostPanel.tsx`에 다음 순수 함수를 export한다.

```ts
export function guildTradeQuickDelivery(contract: {
  maxBatches: number;
  pointValue: number;
}): { batches: number; points: number } {
  const maxBatches = Math.max(0, Math.floor(contract.maxBatches));
  const pointValue = Math.max(1, Math.floor(contract.pointValue));
  const batches = Math.min(
    maxBatches,
    Math.max(1, Math.floor(10 / pointValue)),
  );
  return { batches, points: batches * pointValue };
}
```

계약 map 안에서 `const quickDelivery = guildTradeQuickDelivery(contract);`를 계산한다. 기존 두 버튼 사이에 아래 동작을 추가한다.

```tsx
<button
  type="button"
  disabled={disabled}
  onClick={() =>
    void submit(
      `deliver-quick:${contract.id}`,
      {
        action: "deliver",
        contractId: contract.id,
        batches: quickDelivery.batches,
      },
      (json) => deliveryNotice(json, sharedTokens),
    )
  }
  className="flex-1 rounded-md border border-cyan-700 bg-cyan-50 px-2 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-950 dark:text-cyan-200 dark:hover:bg-cyan-900"
>
  {quickDelivery.points}점 납품
</button>
```

- [ ] **Step 4: 컴포넌트 테스트를 다시 실행해 통과 확인**

Run: `npm test -- src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: UI 변경 커밋**

```bash
git add src/adventure/v2/guild/GuildTradePostPanel.tsx src/adventure/v2/guild/GuildTradePostPanel.test.tsx
git commit -m "feat: add quick guild trade delivery"
```

---

### Task 3: 통합 검증

**Files:**
- Verify: `src/adventure/data/v2/guildTrade.ts`
- Verify: `src/adventure/v2/guild/GuildTradePostPanel.tsx`
- Verify: `src/app/api/v2/guild/trade-post/route.ts`

**Interfaces:**
- Consumes: Task 1의 교역 카탈로그와 Task 2의 기존 `batches` 요청
- Produces: 테스트·타입·린트 검증 결과

- [ ] **Step 1: 교역소 관련 회귀 테스트 실행**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts src/adventure/v2/guild/GuildTradePostPanel.test.tsx src/app/api/v2/guild/trade-post/route.test.ts`

Expected: 모든 테스트 PASS.

- [ ] **Step 2: 타입 검사 실행**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: 변경 파일 린트 실행**

Run: `npx eslint src/adventure/data/v2/guildTrade.ts src/adventure/data/v2/guildTrade.test.ts src/adventure/v2/guild/GuildTradePostPanel.tsx src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

Expected: exit code 0.

- [ ] **Step 4: 이미지 참조 검사 실행**

Run: `npm run check-images`

Expected: 누락 이미지 없이 exit code 0. 기존 고아 이미지 경고는 실패가 아니다.

- [ ] **Step 5: diff와 작업 트리 범위 확인**

Run: `git diff --check HEAD~2..HEAD && git status --short`

Expected: 공백 오류가 없고 교역소 커밋에는 계획된 네 코드 파일만 포함된다. 기존 전투 파일은 여전히 별도 미커밋 변경으로 남아 있다.
