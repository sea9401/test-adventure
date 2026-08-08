# 100레벨 달성 이벤트 비약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전체 유저 우편에 첨부할 수 있고 사용 시 기존 성장 규칙을 적용해 정확히 100레벨을 달성하는 이벤트 소모품을 추가한다.

**Architecture:** 기존 `MUSEUN_CASH_ITEMS` 인벤토리와 `admin_gift` 우편 첨부 경로를 재사용하되 상점·거래 대상에서는 제외한다. 목표 레벨 도약과 성장 스탯 계산은 서버 순수 함수로 격리하고, 기존 `POST /api/v2/me/use-cash-item` 트랜잭션에서 보유량 검증·성장 적용·한 개 차감을 원자적으로 처리한다.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19 Client Components, TypeScript 5, Vitest 4

## Global Constraints

- 아이템 식별자는 `level_100_elixir`, 표시 이름은 `100레벨 달성의 비약`, 태그는 `이벤트`다.
- 아이템은 계정 귀속, 거래 불가, 상점 미판매이며 관리자 전체 우편 첨부만 허용한다.
- 정상 사용 결과는 정확히 레벨 100, EXP 0이며 직업 숙련도와 누적 직업 레벨은 변경하지 않는다.
- 이미 레벨 100이면 `already_max_level`을 반환하고 아이템을 소모하지 않는다.
- 기존 테스트 전용 `경험치의 비약 (테스트)` 레어맵은 변경하지 않는다.
- 실제 우편 발송, 운영 배포, 점검 모드 전환은 수행하지 않는다.
- 기존 작업 트리의 전투·UI 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 이벤트 아이템 카탈로그와 관리자 지급 경로

**Files:**
- Modify: `src/adventure/data/v2/museunCashItems.test.ts`
- Modify: `src/adventure/data/v2/museunCashItems.ts`
- Modify: `src/adventure/v2/inventory/InventoryItemIcon.test.tsx`
- Modify: `src/adventure/v2/inventory/InventoryItemIcon.tsx`

**Interfaces:**
- Produces: `LEVEL_100_ELIXIR_ITEM_ID`, `museunCashItemTags(itemId)`, `MUSEUN_CASH_ITEMS.level_100_elixir`, 관리자 지급 허용 및 상점 제외 목록.
- Consumes: 기존 `MUSEUN_INVENTORY_ITEM_IDS`, `MUSEUN_SHOP_ITEM_IDS`, `MUSEUN_ADMIN_GIFT_ITEM_IDS` 파생 규약.

- [ ] **Step 1: 카탈로그 및 아이콘 회귀 테스트 작성**

`museunCashItems.test.ts`에 다음 기대를 추가한다.

```ts
expect(MUSEUN_CASH_ITEMS.level_100_elixir).toMatchObject({
  id: "level_100_elixir",
  name: "100레벨 달성의 비약",
  delivery: "inventory",
  tradeable: false,
  tags: ["이벤트"],
  effect: { kind: "level_target", level: 100 },
});
expect(MUSEUN_SHOP_ITEM_IDS).not.toContain("level_100_elixir");
expect(MUSEUN_ADMIN_GIFT_ITEM_IDS).toContain("level_100_elixir");
expect(isMuseunAdminGiftItemId("level_100_elixir")).toBe(true);
expect(MUSEUN_UTILITY_ITEM_IDS).toContain("level_100_elixir");
expect(museunCashItemTags("level_100_elixir")).toEqual(["이벤트"]);
```

`InventoryItemIcon.test.tsx`에는 다음 기대를 추가한다.

```ts
expect(inventoryIconKind("level_100_elixir")).toBe("flask");
```

- [ ] **Step 2: 테스트가 기능 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/inventory/InventoryItemIcon.test.tsx`

Expected: `level_100_elixir` 카탈로그·태그·아이콘 매핑이 아직 없어 FAIL.

- [ ] **Step 3: 최소 카탈로그 구현**

`museunCashItems.ts`에 보상 전용 상수와 아이템을 추가한다.

```ts
export const LEVEL_100_ELIXIR_ITEM_ID = "level_100_elixir" as const;

[LEVEL_100_ELIXIR_ITEM_ID]: {
  id: LEVEL_100_ELIXIR_ITEM_ID,
  name: "100레벨 달성의 비약",
  description:
    "사용하면 현재 레벨에서 즉시 100레벨에 도달합니다. 레벨업 성장 능력치는 정상 적용되며 직업 숙련도는 오르지 않습니다.",
  coinPrice: 0,
  delivery: "inventory",
  tradeable: false,
  tags: ["이벤트"],
  effect: { kind: "level_target", level: 100 },
},
```

상점 목록에서는 `cultivation_reset_potion`과 `level_100_elixir`를 모두 제외하고, 관리자 지급 목록에는 둘 다 명시적으로 추가한다. 태그 접근은 이종 리터럴 객체의 타입을 안전하게 좁히는 함수로 제공한다.

```ts
export function museunCashItemTags(
  itemId: MuseunCashItemId,
): readonly string[] {
  const item = MUSEUN_CASH_ITEMS[itemId];
  return "tags" in item ? item.tags : [];
}
```

`InventoryItemIcon.tsx`에서는 `LEVEL_100_ELIXIR_ITEM_ID`를 `flask`에 매핑한다.

- [ ] **Step 4: 카탈로그 테스트 통과 확인**

Run: `npm test -- src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/inventory/InventoryItemIcon.test.tsx`

Expected: 두 테스트 파일 모두 PASS.

- [ ] **Step 5: Task 1 커밋**

```bash
git add src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/inventory/InventoryItemIcon.tsx src/adventure/v2/inventory/InventoryItemIcon.test.tsx
git commit -m "feat: add level 100 event elixir catalog"
```

### Task 2: 목표 레벨 성장 계산

**Files:**
- Create: `src/lib/server/levelTargetGrant.test.ts`
- Create: `src/lib/server/levelTargetGrant.ts`

**Interfaces:**
- Produces: `applyLevelTargetGrant(charSave, proficiencyRaw, targetLevel, rand): LevelTargetGrantResult`.
- Consumes: `parseV2Class`, `tier1ClassOf`, `jobIdFromLegacy`, `parseProficiencyForChar`, `setGrown`, `rollLevelGrowth`, `MAX_LEVEL`.

- [ ] **Step 1: 순수 함수 실패 테스트 작성**

`levelTargetGrant.test.ts`에 다음 동작을 독립 테스트로 작성한다.

```ts
it("1레벨 캐릭터를 정확히 100레벨과 EXP 0으로 만든다", () => {
  const result = applyLevelTargetGrant(
    { class: "warrior", level: 1, exp: 29 },
    {},
    100,
    () => 0,
  );
  expect(result.level).toBe(100);
  expect(result.exp).toBe(0);
  expect(result.levelsGained).toBe(99);
});

it("중간 레벨에서는 남은 레벨 수만큼만 성장시킨다", () => {
  const result = applyLevelTargetGrant(
    { class: "warrior", level: 73, exp: 456 },
    {},
    100,
    () => 0,
  );
  expect(result.levelsGained).toBe(27);
  expect(Object.values(result.proficiency.grown).reduce((a, b) => a + b, 0))
    .toBe(27);
});

it("직업 숙련도는 증가시키지 않는다", () => {
  const result = applyLevelTargetGrant(
    { class: "warrior", level: 50, exp: 0 },
    {},
    100,
    () => 0,
  );
  expect(result.proficiency.groups.warrior?.cumLevel ?? 0).toBe(0);
  expect(result.proficiency.jobCumLevel?.warrior ?? 0).toBe(0);
});

it("이미 목표 레벨이면 변화량 0을 반환한다", () => {
  const result = applyLevelTargetGrant(
    { class: "warrior", level: 100, exp: 999 },
    {},
    100,
    () => 0,
  );
  expect(result).toMatchObject({ level: 100, exp: 0, levelsGained: 0 });
});
```

- [ ] **Step 2: 새 모듈 부재로 실패하는지 확인**

Run: `npm test -- src/lib/server/levelTargetGrant.test.ts`

Expected: `./levelTargetGrant` 모듈을 찾지 못해 FAIL.

- [ ] **Step 3: 목표 레벨 계산 최소 구현**

`levelTargetGrant.ts`는 입력 레벨을 `[1, MAX_LEVEL]`로 정규화하고 목표를 `[현재 레벨, MAX_LEVEL]`로 제한한다. `levelsGained` 횟수만큼 기존 `rollLevelGrowth`를 호출하고 `setGrown`으로 결과를 저장한다.

```ts
const currentLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(charSave.level ?? 1)));
const level = Math.max(currentLevel, Math.min(MAX_LEVEL, Math.floor(targetLevel)));
const levelsGained = level - currentLevel;

for (let index = 0; index < levelsGained; index += 1) {
  grown = rollLevelGrowth(grown, playerClass, proficiency, rand, {
    currentJobId,
  });
}

return {
  level,
  exp: level >= targetLevel ? 0 : Math.max(0, charSave.exp ?? 0),
  levelsGained,
  proficiency: setGrown(proficiency, grown),
};
```

- [ ] **Step 4: 순수 함수 테스트 통과 확인**

Run: `npm test -- src/lib/server/levelTargetGrant.test.ts`

Expected: 네 동작 모두 PASS.

- [ ] **Step 5: Task 2 커밋**

```bash
git add src/lib/server/levelTargetGrant.ts src/lib/server/levelTargetGrant.test.ts
git commit -m "feat: calculate level target growth"
```

### Task 3: 서버 권위 사용 API

**Files:**
- Modify: `src/app/api/v2/me/use-cash-item/route.test.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.ts`

**Interfaces:**
- Consumes: `LEVEL_100_ELIXIR_ITEM_ID`, `removeMuseunCashItem`, `applyLevelTargetGrant`.
- Produces: 성공 응답 `{ ok, itemId, cashItems, level, levelsGained }` 및 `already_max_level` 409 응답.

- [ ] **Step 1: Route Handler 실패 테스트 작성**

기존 route 테스트에 정상 사용, 만렙 비소모, 미보유 세 사례를 추가한다.

```ts
it("비약 한 개를 소모하고 100레벨과 성장 상태를 함께 저장한다", async () => {
  mocks.store.set("character.v2", {
    class: "warrior",
    level: 70,
    exp: 321,
    cashItems: { level_100_elixir: 2 },
  });
  mocks.store.set("proficiency.v2", emptyProficiency());

  const response = await POST(request("level_100_elixir"));
  const json = await response.json();

  expect(response.status).toBe(200);
  expect(json).toMatchObject({
    ok: true,
    itemId: "level_100_elixir",
    cashItems: { level_100_elixir: 1 },
    level: 100,
    levelsGained: 30,
  });
  expect(mocks.store.get("character.v2")).toMatchObject({
    level: 100,
    exp: 0,
    cashItems: { level_100_elixir: 1 },
  });
});

it("이미 100레벨이면 비약을 소모하지 않는다", async () => {
  mocks.store.set("character.v2", {
    class: "warrior",
    level: 100,
    cashItems: { level_100_elixir: 1 },
  });
  const response = await POST(request("level_100_elixir"));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "already_max_level" });
  expect(mocks.store.get("character.v2")).toMatchObject({
    cashItems: { level_100_elixir: 1 },
  });
});
```

미보유 테스트는 `cashItems: {}`에서 403 `not_owned`이고 캐릭터·숙련도가 변하지 않는지 검증한다.

- [ ] **Step 2: 새 효과가 아직 처리되지 않아 실패하는지 확인**

Run: `npm test -- src/app/api/v2/me/use-cash-item/route.test.ts`

Expected: `level_target`이 `use_elsewhere`로 처리되거나 카탈로그가 없어 FAIL.

- [ ] **Step 3: 트랜잭션 분기 구현**

`adventure_support` 최종 분기 전에 `level_target` 처리를 추가한다. 아이템 보유량을 메모리에서 먼저 차감해 보유 여부를 검증하되, 이미 만렙이면 어떤 저장도 수행하지 않는다.

```ts
if (item.effect.kind === "level_target") {
  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const cashItems = removeMuseunCashItem(character.cashItems, itemId, 1);
    if (!cashItems) {
      return { status: 403, body: { ok: false as const, error: "not_owned" as const } };
    }
    if (Math.max(1, Math.floor(Number(character.level) || 1)) >= item.effect.level) {
      return { status: 409, body: { ok: false as const, error: "already_max_level" as const } };
    }
    const proficiency = await lockSaveForUpdate(tx, userId, "proficiency.v2", {});
    const grant = applyLevelTargetGrant(character, proficiency, item.effect.level);
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      cashItems,
      level: grant.level,
      exp: grant.exp,
    });
    await upsertSave(tx, userId, "proficiency.v2", grant.proficiency);
    return {
      status: 200,
      body: {
        ok: true as const,
        itemId,
        cashItems,
        level: grant.level,
        levelsGained: grant.levelsGained,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Route Handler 테스트 통과 확인**

Run: `npm test -- src/app/api/v2/me/use-cash-item/route.test.ts`

Expected: 기존 수행 초기화 물약 사례와 새 비약 사례 모두 PASS.

- [ ] **Step 5: Task 3 커밋**

```bash
git add src/app/api/v2/me/use-cash-item/route.ts src/app/api/v2/me/use-cash-item/route.test.ts
git commit -m "feat: use level 100 event elixir"
```

### Task 4: 인벤토리 이벤트 태그와 사용 피드백

**Files:**
- Create: `src/adventure/v2/inventory/RareMapsTab.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`

**Interfaces:**
- Consumes: `museunCashItemTags`, `MuseunCashItemId`, 사용 API 응답의 `level`과 `levelsGained`.
- Produces: 인벤토리 목록의 `이벤트` 칩, 상세 카드의 `이벤트 소모품` 유형, 100레벨 성공·만렙 비소모 안내.

- [ ] **Step 1: UI 실패 테스트 작성**

`next/navigation`의 `useRouter`만 테스트에서 스텁하고, `RareMapsTab`을 서버 정적 마크업으로 렌더링한다.

```tsx
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const html = renderToStaticMarkup(
  <RareMapsTab
    materials={{}}
    spFruitUsed={{ 3: 0, 4: 0, 5: 0 }}
    busy={null}
    onUseSpFruit={() => undefined}
    onUseEquipmentBox={() => undefined}
    onUseMasteryTome={() => undefined}
    rareMaps={[]}
    cashItems={{ level_100_elixir: 1 }}
    onUseCashItem={() => undefined}
    cookingFoods={{}}
    onUseCookingFood={() => undefined}
    onUseExpTome={() => undefined}
  />,
);

expect(html).toContain("100레벨 달성의 비약");
expect(html).toContain("이벤트");
expect(html).toContain("사용 즉시 100레벨 달성");
```

- [ ] **Step 2: 이벤트 태그 미표시로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/inventory/RareMapsTab.test.tsx`

Expected: 이름은 보이지만 `이벤트` 태그와 전용 사용 설명이 없어 FAIL.

- [ ] **Step 3: 태그·설명·알림 구현**

`cashItemUseLabel`에 `level_target`을 추가한다.

```ts
if (effect.kind === "level_target") {
  return `사용 즉시 ${effect.level}레벨 달성`;
}
```

`CashItemSection`은 `museunCashItemTags(itemId)`를 이름 옆 칩으로 표시하고, 태그가 `이벤트`인 상세 카드의 subtitle을 `이벤트 소모품`으로 바꾼다. 칩은 불투명 `bg-amber-100 dark:bg-amber-950` 계열을 사용하고 카드 표면은 기존 `SURFACE_CARD`를 유지한다.

`V2InventoryView.tsx`의 응답 타입에 `level`과 `levelsGained`를 추가하고 오류/성공 문구를 분기한다.

```ts
if (data?.error === "already_max_level") {
  return "이미 100레벨입니다 · 비약은 소모되지 않았습니다";
}

itemId === LEVEL_100_ELIXIR_ITEM_ID
  ? `✓ 100레벨 달성 · ${data.levelsGained ?? 0}레벨 상승`
  : itemId === "cultivation_reset_potion"
    ? `✓ 수행 초기화 완료 · 숙달 포인트 +${(data.refundedPoints ?? 0).toLocaleString()}`
    : `✓ 월간 모험 지원권 ${data.daysAdded ?? 30}일 적용`;
```

- [ ] **Step 4: UI 테스트와 관련 회귀 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/me/use-cash-item/route.test.ts`

Expected: 세 테스트 파일 모두 PASS.

- [ ] **Step 5: Task 4 커밋**

```bash
git add src/adventure/v2/inventory/RareMapsTab.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2InventoryView.tsx
git commit -m "feat: show event elixir in inventory"
```

### Task 5: 전체 검증과 범위 확인

**Files:**
- Verify only; no production file changes expected.

**Interfaces:**
- Consumes: Tasks 1-4의 모든 산출물.
- Produces: 테스트·타입·린트·이미지 참조·프로덕션 빌드 검증 기록.

- [ ] **Step 1: 기능 관련 테스트 전체 실행**

Run: `npm test -- src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/inventory/InventoryItemIcon.test.tsx src/lib/server/levelTargetGrant.test.ts src/app/api/v2/me/use-cash-item/route.test.ts src/adventure/v2/inventory/RareMapsTab.test.tsx src/lib/server/inboxPayload.test.ts`

Expected: 모든 관련 테스트 PASS.

- [ ] **Step 2: 전체 단위 테스트 실행**

Run: `npm test`

Expected: 0 failed.

- [ ] **Step 3: 정적 검증 실행**

Run: `npm run lint`

Expected: ESLint 오류 0개.

Run: `npx tsc --noEmit`

Expected: TypeScript 오류 0개.

Run: `npm run check-images`

Expected: 누락 이미지 참조 0개.

- [ ] **Step 4: 프로덕션 빌드 실행**

Run: `npm run build`

Expected: Next.js 16.2.11 프로덕션 빌드 exit 0.

- [ ] **Step 5: 요구사항과 작업 트리 범위 점검**

Run: `git diff --check`

Expected: 공백 오류 0개.

Run: `git status --short`

Expected: 기존 사용자 변경과 이번 기능 변경이 구분되며 운영 배포·우편 발송 작업은 발생하지 않음.
