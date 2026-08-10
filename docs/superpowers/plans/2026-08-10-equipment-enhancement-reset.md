# Equipment Enhancement Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강화 투자분을 환급하지 않고 장비의 강화 상태만 제거해 다시 거래 가능한 미강화 장비로 되돌리는 대장간 기능을 만든다.

**Architecture:** 장비 도메인에 초기화 가능 여부 판정과 불변 갱신 헬퍼를 두어 API와 UI가 같은 규칙을 사용한다. 전용 서버 엔드포인트가 `equipment.v2`를 잠그고 강화 필드만 제거하며, 대장간 UI는 강화 화면의 보조 버튼과 파괴적 확인창을 통해 이 엔드포인트를 호출한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind CSS

## Global Constraints

- 강화 초기화는 무료이며 골드, 강화석과 재료 장비를 환급하지 않는다.
- 장착 중이거나 잠금된 장비는 초기화할 수 없다.
- `enhance` 외 장비 개체 필드는 모두 보존한다.
- 강화 장비 거래 제한은 완화하지 않는다.
- 서버가 소유권과 모든 초기화 조건을 권위 있게 재검증한다.
- 새 UI 패널과 확인창은 불투명 surface 토큰을 사용한다.
- 배포와 점검 모드 변경은 이 계획의 범위가 아니다.

---

### Task 1: 장비 강화 초기화 도메인 규칙과 서버 API

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Create: `src/app/api/v2/me/enhance/reset/route.ts`
- Create: `src/lib/server/enhanceResetRoute.test.ts`

**Interfaces:**
- Produces: `enhancementResetError(inst: V2EquipInstance, equipped: Partial<Record<V2EquipSlot, string>>): "not_enhanced" | "equipped" | "locked" | null`
- Produces: `resetInstanceEnhancement(owned: V2EquipInstance[], iid: string): V2EquipInstance[]`
- Produces: `POST /api/v2/me/enhance/reset` with request `{ iid: string }` and success `{ ok: true, iid: string }`

- [ ] **Step 1: 도메인 헬퍼의 실패 테스트 작성**

`src/adventure/data/v2/v2Equipment.test.ts`에 다음 동작을 검증한다.

```tsx
describe("장비 강화 초기화", () => {
  const enhanced = {
    iid: "a1",
    id: "v2_iron_sword" as V2EquipmentId,
    roll: { power: 77, weight: 3 },
    locked: false,
    enhance: { level: 8, bonusPct: 15 },
    craftQuality: { level: 1, bonusPct: 5 },
    craftedBy: {
      userId: "u1",
      profession: "blacksmith" as const,
      level: 6,
      craftedAt: "2026-08-10T00:00:00.000Z",
    },
    stormRefined: true as const,
  };

  it("강화 필드만 제거하고 나머지 개체 정보를 보존한다", () => {
    const [next] = resetInstanceEnhancement([enhanced], "a1");
    expect(next).not.toHaveProperty("enhance");
    expect(next).toMatchObject({
      iid: "a1",
      roll: enhanced.roll,
      craftQuality: enhanced.craftQuality,
      craftedBy: enhanced.craftedBy,
      stormRefined: true,
    });
    expect(enhanced.enhance).toEqual({ level: 8, bonusPct: 15 });
  });

  it("미강화·장착·잠금 상태를 각각 거부한다", () => {
    expect(enhancementResetError({ ...enhanced, enhance: undefined }, {})).toBe("not_enhanced");
    expect(enhancementResetError(enhanced, { weapon: "a1" })).toBe("equipped");
    expect(enhancementResetError({ ...enhanced, locked: true }, {})).toBe("locked");
    expect(enhancementResetError(enhanced, {})).toBeNull();
  });
});
```

- [ ] **Step 2: 도메인 테스트가 기능 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts`

Expected: FAIL because `enhancementResetError` and `resetInstanceEnhancement` are not exported.

- [ ] **Step 3: 최소 도메인 헬퍼 구현**

`src/adventure/data/v2/v2Equipment.ts`에서 장착 IID 집합, 잠금과 강화 상태를 검사하고, 객체 구조 분해로 `enhance`만 제외한 새 개체를 반환한다.

```tsx
export type EnhancementResetError = "not_enhanced" | "equipped" | "locked";

export function enhancementResetError(
  inst: V2EquipInstance,
  equipped: Partial<Record<V2EquipSlot, string>>,
): EnhancementResetError | null {
  if (!inst.enhance) return "not_enhanced";
  if (Object.values(equipped).includes(inst.iid)) return "equipped";
  if (inst.locked) return "locked";
  return null;
}

export function resetInstanceEnhancement(
  owned: V2EquipInstance[],
  iid: string,
): V2EquipInstance[] {
  return owned.map((inst) => {
    if (inst.iid !== iid) return inst;
    const { enhance: _enhance, ...reset } = inst;
    return reset;
  });
}
```

- [ ] **Step 4: 도메인 테스트 통과 확인**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts`

Expected: PASS.

- [ ] **Step 5: 전용 API의 실패 통합 테스트 작성**

`src/lib/server/enhanceResetRoute.test.ts`에 기존 `enhanceRoute.test.ts`의 in-memory `savesKv` 패턴을 적용한다. 실 DB 대신 저장 경계만 대체하고 실제 `parseEquipmentSave`, 판정 헬퍼와 라우트를 실행한다.

검증 사례:

```tsx
it("강화만 제거하고 재화와 다른 장비 메타데이터를 보존한다", async () => {
  const response = await POST(request({ iid: "w1" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, iid: "w1" });
  expect(savedEquipment.owned[0]).not.toHaveProperty("enhance");
  expect(savedEquipment.owned[0]).toMatchObject({
    iid: "w1",
    roll: { power: 300, weight: 5 },
    craftQuality: { level: 1, bonusPct: 5 },
    stormRefined: true,
  });
  expect(store.get("character.v2")).toEqual(originalCharacterSave);
});

it.each([
  ["missing", "not_owned", 404],
  ["plain", "not_enhanced", 400],
  ["equipped", "equipped", 409],
  ["locked", "locked", 409],
])("%s 장비는 %s로 거부한다", async (iid, error, status) => {
  const response = await POST(request({ iid }));
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, error });
});
```

- [ ] **Step 6: API 테스트가 라우트 부재로 실패하는지 확인**

Run: `npm test -- src/lib/server/enhanceResetRoute.test.ts`

Expected: FAIL because `src/app/api/v2/me/enhance/reset/route.ts` does not exist.

- [ ] **Step 7: 전용 초기화 API 최소 구현**

라우트는 `ensureUser`, `enforceUserAndIpRateLimit`, `db.transaction`, `lockSaveForUpdate`, `parseEquipmentSave`, `enhancementResetError`, `resetInstanceEnhancement`, `upsertSave`를 사용한다. `iid`가 비어 있거나 JSON이 잘못되면 400을 반환한다. `equipment.v2`만 잠그고 저장하며 재화 세이브에는 접근하지 않는다.

```tsx
const inst = owned.find((entry) => entry.iid === iid);
if (!inst) return failure(404, "not_owned");
const resetError = enhancementResetError(inst, equipped);
if (resetError) {
  return failure(resetError === "not_enhanced" ? 400 : 409, resetError);
}
await upsertSave(tx, userId, "equipment.v2", {
  owned: resetInstanceEnhancement(owned, iid),
  equipped,
});
```

- [ ] **Step 8: API·도메인 테스트 통과 확인**

Run: `npm test -- src/lib/server/enhanceResetRoute.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 9: 서버 단계 커밋**

```bash
git add src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2Equipment.test.ts src/app/api/v2/me/enhance/reset/route.ts src/lib/server/enhanceResetRoute.test.ts
git commit -m "feat: 장비 강화 초기화 API 추가"
```

### Task 2: 대장간 초기화 확인창과 사용자 안내

**Files:**
- Modify: `src/adventure/v2/V2EnhanceView.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.test.tsx`
- Modify: `src/app/manual/content/enhance.tsx`

**Interfaces:**
- Consumes: `enhancementResetError` from Task 1
- Consumes: `POST /api/v2/me/enhance/reset` from Task 1
- Produces: `EnhancementResetConfirmDialog` with props `{ itemName, enhanceLevel, currentPower, resetPower, busy, onConfirm, onClose }`

- [ ] **Step 1: 확인창의 실패 렌더링 테스트 작성**

`src/adventure/v2/V2EnhanceView.test.tsx`에서 실제 확인창 정적 마크업을 검증한다.

```tsx
it("강화 초기화 손실과 위력 변화를 확정 전에 보여준다", () => {
  const html = renderToStaticMarkup(
    <EnhancementResetConfirmDialog
      itemName="일식"
      enhanceLevel={9}
      currentPower={420}
      resetPower={350}
      busy={false}
      onConfirm={() => undefined}
      onClose={() => undefined}
    />,
  );

  expect(html).toContain('role="dialog"');
  expect(html).toContain("+9 일식의 강화를 초기화할까요?");
  expect(html).toContain("420 → 350");
  expect(html).toContain("골드·강화석·재료 장비는 환급되지 않습니다");
  expect(html).toContain("되돌릴 수 없습니다");
  expect(html).toContain("강화 초기화 확정");
});
```

- [ ] **Step 2: UI 테스트가 컴포넌트 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/V2EnhanceView.test.tsx`

Expected: FAIL because `EnhancementResetConfirmDialog` is not exported.

- [ ] **Step 3: 불투명 확인창 최소 구현**

기존 `StormRefinementConfirmDialog`와 같은 접근성 패턴(`role="dialog"`, `aria-modal`, `useEscapeKey`, `useModalA11y`)과 `SURFACE_CARD`, `SURFACE_INSET`을 사용한다. 취소는 보조 버튼, 확정은 `danger` 버튼으로 표시한다.

- [ ] **Step 4: 확인창 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2EnhanceView.test.tsx`

Expected: PASS.

- [ ] **Step 5: 강화 작업대에 초기화 동작 연결**

`V2EnhanceView`에 확인창 열림 상태와 `doResetEnhancement`를 추가한다. 초기화 전 위력은 기존 `curPower`, 초기화 후 위력은 `powerWithBonuses(basePower, undefined, selected.craftQuality)`로 계산한다.

강화된 장비에서만 보조 버튼을 표시한다. `enhancementResetError`가 `equipped` 또는 `locked`이면 버튼을 비활성화하고 이유를 라벨에 표시한다. 유효한 버튼은 확인창만 열며, 실제 fetch는 확인창 확정 콜백에서만 실행한다.

```tsx
const resetError = selected
  ? enhancementResetError(selected, equipped)
  : "not_enhanced";

const resetActionLabel =
  resetError === "equipped"
    ? "장착 해제 후 초기화 가능"
    : resetError === "locked"
      ? "잠금 해제 후 초기화 가능"
      : "강화 초기화";
```

성공하면 확인창을 닫고 `강화가 초기화되었습니다. 사용한 재화는 환급되지 않습니다.`를 표시한 뒤 `refresh()`와 `refreshGameState()`를 함께 호출한다. `not_owned`, `not_enhanced`, `equipped`, `locked` 응답은 각각 구체적인 한국어 오류로 표시한다.

- [ ] **Step 6: 게임 내 도움말에 초기화 정책 추가**

`src/app/manual/content/enhance.tsx`의 강화 설명 다음에 `강화 초기화` 절을 추가해 무료, 무환급, 장착·잠금 해제 필요, 강화 외 메타 보존과 되돌릴 수 없음을 안내한다.

- [ ] **Step 7: 관련 테스트와 정적 검증 실행**

Run: `npm test -- src/adventure/v2/V2EnhanceView.test.tsx src/lib/server/enhanceResetRoute.test.ts src/adventure/data/v2/v2Equipment.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: PASS with zero failures.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2Equipment.test.ts src/app/api/v2/me/enhance/reset/route.ts src/lib/server/enhanceResetRoute.test.ts src/adventure/v2/V2EnhanceView.tsx src/adventure/v2/V2EnhanceView.test.tsx src/app/manual/content/enhance.tsx`

Expected: exit 0.

Run: `npm run build`

Expected: Next.js production build exits 0.

- [ ] **Step 8: UI와 도움말 단계 커밋**

```bash
git add src/adventure/v2/V2EnhanceView.tsx src/adventure/v2/V2EnhanceView.test.tsx src/app/manual/content/enhance.tsx
git commit -m "feat: 대장간 강화 초기화 기능 추가"
```

### Task 3: 완료 전 요구사항 대조

**Files:**
- Review: `docs/superpowers/specs/2026-08-10-equipment-enhancement-reset-design.md`
- Review: all files modified by Tasks 1-2

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior
- Produces: verified implementation ready for handoff

- [ ] **Step 1: 설계 요구사항을 변경 diff와 일대일 대조**

확인 항목: 무료, 무환급, 장착 차단, 잠금 차단, `enhance`만 제거, 확인창, 거래 제한 유지, 구체적 오류, 관련 도움말.

- [ ] **Step 2: 최종 검증을 새로 실행**

Run: `git diff --check HEAD~2..HEAD && git status --short --branch`

Expected: whitespace error가 없고 작업 트리가 깨끗하다.

Run: `npm test -- src/adventure/v2/V2EnhanceView.test.tsx src/lib/server/enhanceResetRoute.test.ts src/adventure/data/v2/v2Equipment.test.ts src/lib/server/marketplaceV2.test.ts && npx tsc --noEmit`

Expected: all tests pass and typecheck exits 0.
