# Review Admin OP Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최고 관리자 계정의 기존 캐릭터를 보존하면서 심의에 필요한 전투력·재화·최종 사냥터 진행도를 한 번에 상향하는 관리자 전용 프리셋을 제공한다.

**Architecture:** 순수 병합 함수가 `character.v2`, `proficiency.v2`, `inventory.v2`의 목표값을 계산하고, 최고 관리자 전용 App Router POST 핸들러가 세 저장값을 트랜잭션으로 기록한다. 관리자 사용자 검색 응답에 대상 계정의 최고 관리자 여부를 포함하고, 사용자 상세 패널의 독립 UI 섹션이 확인 후 API를 호출한다.

**Tech Stack:** Next.js 16.2 App Router Route Handlers, React 19, TypeScript, Drizzle ORM, Vitest, 서버 저장소 `savesKv`

## Global Constraints

- 운영 환경을 포함한 어떤 환경에도 배포하지 않는다.
- 요청자와 대상 계정 모두 `ADMIN_EMAILS` 기반 최고 관리자여야 한다.
- 기존 직업·장비·스킬·퀘스트·스토리·일반 재료를 덮어쓰지 않는다.
- 기존 값이 프리셋 목표보다 높으면 낮추지 않는다.
- 최종 사냥터 개방은 `MAX_FRONTIER_DEPTH`를 단일 소스로 사용한다.
- 새 관리자 패널은 `src/components/ui/surfaces.ts`의 `SURFACE_CARD`를 사용한다.
- 새 POST Route Handler는 Next.js 16 로컬 문서의 Web `Request`/`Response` 규약을 따른다.

---

## File Map

- Create `src/lib/server/reviewAdminOpPreset.ts`: 프리셋 상수, 입력 검증, 순수 상향 병합.
- Create `src/lib/server/reviewAdminOpPreset.test.ts`: 보존·상향·비하향·멱등성 회귀 테스트.
- Create `src/app/api/admin/users/review-op-preset/route.ts`: 최고 관리자 게이트, 대상 검증, 트랜잭션 저장, 체력·마력 재계산, 감사 로그.
- Create `src/app/api/admin/users/review-op-preset/route.test.ts`: 권한·대상·저장·감사 로그 API 테스트.
- Modify `src/app/api/admin/users/route.ts`: 각 검색 결과에 `isSuperAdmin` 추가.
- Modify `src/app/api/admin/users/route.test.ts`: 최고 관리자 표기 회귀 테스트.
- Modify `src/admin/tabs/users/types.ts`: `AdminUserRow.isSuperAdmin` 계약 추가.
- Create `src/admin/tabs/users/ReviewOpPresetSection.tsx`: 설명, 대상 자격, 확인 버튼 UI.
- Create `src/admin/tabs/users/ReviewOpPresetSection.test.tsx`: 문구와 비활성 상태 렌더 테스트.
- Modify `src/admin/tabs/users/SelectedUserPanel.tsx`: 최고 관리자 대상에만 프리셋 섹션 렌더.
- Modify `src/admin/tabs/UsersTab.tsx`: API 호출, 로딩 상태, 토스트, 세이브 재조회.

---

### Task 1: 순수 OP 프리셋 병합 함수

**Files:**
- Create: `src/lib/server/reviewAdminOpPreset.test.ts`
- Create: `src/lib/server/reviewAdminOpPreset.ts`

**Interfaces:**
- Consumes: `MAX_LEVEL`, `MAX_FRONTIER_DEPTH`, `V2_STAT_KEYS`, `parseProficiencyForChar`, `tier1ClassOf`, `jobIdFromLegacy`, `staminaConfigForCharacter`.
- Produces: `buildReviewAdminOpPreset(input): ReviewAdminOpPresetResult | null`, `REVIEW_ADMIN_OP_TARGETS`.

- [ ] **Step 1: Write the failing merge tests**

```ts
import { describe, expect, it } from "vitest";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import {
  REVIEW_ADMIN_OP_TARGETS,
  buildReviewAdminOpPreset,
} from "./reviewAdminOpPreset";

const character = {
  class: "mage",
  specChoice: "elementalist",
  level: 20,
  exp: 55,
  hp: 1,
  mp: 2,
  gold: 30,
  bankedGold: 40,
  fame: 5,
  frontierDepth: 4,
  questMarker: "preserve",
};

describe("buildReviewAdminOpPreset", () => {
  it("심의 목표값을 적용하면서 관련 없는 캐릭터 필드를 보존한다", () => {
    const result = buildReviewAdminOpPreset({
      characterRaw: character,
      proficiencyRaw: {},
      inventoryRaw: { hpCharges: 3, mpCharges: 4, custom: true },
      nowMs: 1234,
    });
    expect(result).not.toBeNull();
    expect(result?.character).toMatchObject({
      class: "mage",
      specChoice: "elementalist",
      level: 100,
      exp: 0,
      gold: 1_000_000_000,
      bankedGold: 1_000_000_000,
      fame: 1_000_000,
      frontierDepth: MAX_FRONTIER_DEPTH,
      questMarker: "preserve",
    });
    expect(result?.inventory).toMatchObject({
      hpCharges: 100_000,
      mpCharges: 100_000,
      custom: true,
    });
  });

  it("모든 능력치와 현재 직업 숙련도를 올리고 높은 기존 값은 보존한다", () => {
    const result = buildReviewAdminOpPreset({
      characterRaw: { ...character, gold: 2_000_000_000 },
      proficiencyRaw: {
        points: 2_000_000,
        groups: { mage: { cultivations: 7, tier: 2, cumLevel: 9 } },
        caps: { int: 1500 },
        grown: { int: 1600 },
      },
      inventoryRaw: {},
      nowMs: 1234,
    });
    expect(result?.character.gold).toBe(2_000_000_000);
    expect(result?.proficiency.points).toBe(2_000_000);
    expect(result?.proficiency.groups.mage).toMatchObject({
      cultivations: 7,
      tier: 5,
      cumLevel: 1_000_000,
    });
    expect(result?.proficiency.caps.int).toBe(1500);
    expect(result?.proficiency.grown.int).toBe(1600);
    expect(Object.values(result?.proficiency.caps ?? {})).toHaveLength(6);
    expect(Object.values(result?.proficiency.grown ?? {})).toHaveLength(6);
    expect(result?.proficiency.reincarnations).toBe(100);
  });

  it("같은 시각에 재적용해도 같은 결과를 내고 직업 없는 캐릭터는 거절한다", () => {
    const first = buildReviewAdminOpPreset({
      characterRaw: character,
      proficiencyRaw: {},
      inventoryRaw: {},
      nowMs: 1234,
    });
    const second = first && buildReviewAdminOpPreset({
      characterRaw: first.character,
      proficiencyRaw: first.proficiency,
      inventoryRaw: first.inventory,
      nowMs: 1234,
    });
    expect(second).toEqual(first);
    expect(buildReviewAdminOpPreset({
      characterRaw: { ...character, class: "none" },
      proficiencyRaw: {},
      inventoryRaw: {},
      nowMs: 1234,
    })).toBeNull();
    expect(REVIEW_ADMIN_OP_TARGETS.level).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- src/lib/server/reviewAdminOpPreset.test.ts`

Expected: FAIL because `reviewAdminOpPreset.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure merge**

Create a typed record-based helper with these exact targets:

```ts
export const REVIEW_ADMIN_OP_TARGETS = {
  level: MAX_LEVEL,
  stat: 3_000,
  capGain: 3_000,
  proficiencyPoints: 1_000_000,
  mastery: 1_000_000,
  groupTier: 5,
  reincarnations: 100,
  gold: 1_000_000_000,
  fame: 1_000_000,
  charges: 100_000,
} as const;
```

`buildReviewAdminOpPreset` must:

1. Parse the current class and return `null` when `tier1ClassOf(class) === "none"` or `jobIdFromLegacy(...) === "none"`.
2. Spread the original character before setting level, currencies, fame, frontier depth, and full stamina.
3. Set EXP to 0 only when the original level was below `MAX_LEVEL`; otherwise preserve the stored EXP.
4. Parse proficiency through `parseProficiencyForChar`, spread every nested map, and apply `Math.max` to all targets.
5. Preserve `cultivations`, other job groups, other job mastery entries, history, and migration fields.
6. Spread the original inventory and apply `Math.max` to both charge counts.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `npm test -- src/lib/server/reviewAdminOpPreset.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure domain change**

```bash
git add src/lib/server/reviewAdminOpPreset.ts src/lib/server/reviewAdminOpPreset.test.ts
git commit -m "feat: add review admin OP preset merge"
```

---

### Task 2: 최고 관리자 전용 프리셋 API

**Files:**
- Create: `src/app/api/admin/users/review-op-preset/route.test.ts`
- Create: `src/app/api/admin/users/review-op-preset/route.ts`

**Interfaces:**
- Consumes: `buildReviewAdminOpPreset`, `requireAdminRole("super")`, `isSuperAdminEmail`, `lockSaveForUpdate`, `readSave`, `upsertSave`, `derivePlayerCombatV2FromSaves`, `logAdminAction`.
- Produces: `POST /api/admin/users/review-op-preset` with body `{ userId: string }` and success payload `{ ok: true, level, frontierDepth, gold, bankedGold, fame, hpCharges, mpCharges }`.

- [ ] **Step 1: Write failing route tests**

Use the existing hoisted-mock route-test pattern. Mock:

```ts
const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  isSuperAdminEmail: vi.fn((email: string | null) => email === "review@example.com"),
  currentAdminEmail: vi.fn(async () => "operator@example.com"),
  audit: vi.fn(async () => {}),
  lock: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(async () => {}),
  transaction: vi.fn(),
  targetRows: [{ id: "review-user", email: "review@example.com", gameName: "심의자" }],
  tx: { kind: "transaction" },
}));
```

Cover these exact cases:

- gate response 403 returns before target lookup and transaction.
- missing `userId` returns 400 `missing_userId`.
- missing target returns 404 `user_not_found`.
- target email not in `ADMIN_EMAILS` returns 400 `target_not_super_admin`.
- missing character returns 409 `character_required`.
- class `none` returns 409 `class_required`.
- success locks `character.v2 → proficiency.v2 → inventory.v2`, reads equipment/skills, writes all three saves, fills HP/MP from mocked derive result, and logs `review-op-preset.apply`.

Success assertions must include:

```ts
expect(mocks.upsert).toHaveBeenCalledWith(
  mocks.tx,
  "review-user",
  "character.v2",
  expect.objectContaining({ level: 100, hp: 9999, mp: 8888 }),
);
expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
  action: "review-op-preset.apply",
  targetUserId: "review-user",
}));
```

- [ ] **Step 2: Run route tests to verify RED**

Run: `npm test -- src/app/api/admin/users/review-op-preset/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the POST Route Handler**

Implement this sequence:

```ts
const gate = await requireAdminRole("super");
if (gate) return gate;
// parse body and validate userId
// select target id/email/gameName
// reject non-super-admin target
// transaction:
//   read equipment.v2 and skills.v2
//   lock character.v2, proficiency.v2, inventory.v2 in that order
//   reject null character; build preset; reject null result
//   derive combat from candidate saves
//   set character hp/mp to derived maxHp/player.maxMp
//   upsert the three candidate saves
// log review-op-preset.apply with before/after summary
// return compact success summary
```

Use `Response.json` for every JSON response and keep POST uncached. The audit detail must include target game name plus before/after level, frontier depth, gold, and proficiency points; it must not include entire save payloads.

- [ ] **Step 4: Run route and merge tests**

Run: `npm test -- src/app/api/admin/users/review-op-preset/route.test.ts src/lib/server/reviewAdminOpPreset.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the API**

```bash
git add src/app/api/admin/users/review-op-preset/route.ts src/app/api/admin/users/review-op-preset/route.test.ts
git commit -m "feat: add review admin OP preset API"
```

---

### Task 3: 사용자 검색 결과에 대상 자격 표시

**Files:**
- Modify: `src/app/api/admin/users/route.test.ts`
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/admin/tabs/users/types.ts`

**Interfaces:**
- Consumes: `isSuperAdminEmail(email)`.
- Produces: required `AdminUserRow.isSuperAdmin: boolean`.

- [ ] **Step 1: Extend the failing user-route test**

Mock `isSuperAdminEmail` alongside `requireAdmin`, mark `active@example.com` as true, and assert:

```ts
expect(await response.json()).toEqual([
  expect.objectContaining({ id: "active-user", isSuperAdmin: true }),
  expect.objectContaining({ id: "beta-user", isSuperAdmin: false }),
]);
```

- [ ] **Step 2: Run the user-route test to verify RED**

Run: `npm test -- src/app/api/admin/users/route.test.ts`

Expected: FAIL because `isSuperAdmin` is absent.

- [ ] **Step 3: Add the response field and TypeScript contract**

Import `isSuperAdminEmail` in the route and add this field during response mapping:

```ts
isSuperAdmin: isSuperAdminEmail(r.email),
```

Add to `AdminUserRow`:

```ts
isSuperAdmin: boolean;
```

- [ ] **Step 4: Run tests and type-check affected files**

Run: `npm test -- src/app/api/admin/users/route.test.ts src/admin/mailRecipient.test.ts`

Run: `npx tsc --noEmit`

Expected: tests and type-check PASS; any `AdminUserRow` fixtures must explicitly add `isSuperAdmin: false`.

- [ ] **Step 5: Commit the eligibility contract**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/admin/tabs/users/types.ts src/admin/mailRecipient.test.ts
git commit -m "feat: expose review preset eligibility to admins"
```

---

### Task 4: 관리자 사용자 상세 UI

**Files:**
- Create: `src/admin/tabs/users/ReviewOpPresetSection.test.tsx`
- Create: `src/admin/tabs/users/ReviewOpPresetSection.tsx`
- Modify: `src/admin/tabs/users/SelectedUserPanel.tsx`
- Modify: `src/admin/tabs/UsersTab.tsx`

**Interfaces:**
- Consumes: `AdminUserRow.isSuperAdmin`, `adminMe.capabilities.super`, `adminPost`.
- Produces: `ReviewOpPresetSection({ disabled, applying, onApply })` and parent handler `applyReviewOpPreset()`.

- [ ] **Step 1: Write the failing presentational test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewOpPresetSection } from "./ReviewOpPresetSection";

describe("ReviewOpPresetSection", () => {
  it("상향 범위와 되돌리기 주의를 설명한다", () => {
    const html = renderToStaticMarkup(
      <ReviewOpPresetSection disabled={false} applying={false} onApply={vi.fn()} />,
    );
    expect(html).toContain("심의용 OP 세팅");
    expect(html).toContain("최종 사냥터");
    expect(html).toContain("퀘스트와 장비는 유지");
    expect(html).toContain("심의용 OP 세팅 적용");
  });

  it("처리 중에는 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <ReviewOpPresetSection disabled={false} applying onApply={vi.fn()} />,
    );
    expect(html).toContain("적용 중…");
    expect(html).toContain('disabled=""');
  });
});
```

- [ ] **Step 2: Run the component test to verify RED**

Run: `npm test -- src/admin/tabs/users/ReviewOpPresetSection.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused UI section**

Use `SURFACE_CARD`, explanatory text, and one primary button. Keep state and network calls out of the component.

In `SelectedUserPanel`, add props:

```ts
canApplyReviewOpPreset: boolean;
reviewOpPresetApplying: boolean;
onApplyReviewOpPreset: () => void | Promise<void>;
```

Render the section only when `user.isSuperAdmin` is true. Disable it for read-only mode, loading, applying, or when the current operator lacks super capability.

In `UsersTab`, add `reviewOpPresetApplying` state and implement:

```ts
const applyReviewOpPreset = async () => {
  if (!selected || readOnly || !adminMe?.capabilities.super) return;
  const label = selected.gameName?.trim() || selected.email || selected.id;
  if (!window.confirm(
    `「${label}」 캐릭터를 심의용 OP 상태로 상향할까요?\n` +
    "직업·장비·퀘스트는 유지되지만 진행도와 성장 수치는 자동으로 되돌아가지 않습니다.",
  )) return;
  setReviewOpPresetApplying(true);
  try {
    const result = await adminPost<{
      level: number;
      frontierDepth: number;
      gold: number;
    }>("/api/admin/users/review-op-preset", { userId: selected.id });
    showToast(`심의용 OP 세팅 완료: Lv.${result.level}, 사냥터 깊이 ${result.frontierDepth}`);
    await loadSaves(selected.id);
  } catch (cause) {
    showToast(`심의용 OP 세팅 실패: ${cause instanceof Error ? cause.message : "오류"}`);
  } finally {
    setReviewOpPresetApplying(false);
  }
};
```

- [ ] **Step 4: Run component, route, and type tests**

Run: `npm test -- src/admin/tabs/users/ReviewOpPresetSection.test.tsx src/app/api/admin/users/review-op-preset/route.test.ts src/app/api/admin/users/route.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the admin UI**

```bash
git add src/admin/tabs/users/ReviewOpPresetSection.tsx src/admin/tabs/users/ReviewOpPresetSection.test.tsx src/admin/tabs/users/SelectedUserPanel.tsx src/admin/tabs/UsersTab.tsx
git commit -m "feat: add review OP preset admin control"
```

---

### Task 5: 통합 검증

**Files:**
- Verify only; fix only files already listed when failures are caused by this feature.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified local implementation with no deployment.

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
npm test -- src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.test.ts src/app/api/admin/users/route.test.ts src/admin/tabs/users/ReviewOpPresetSection.test.tsx src/admin/mailRecipient.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run static validation**

Run: `npx tsc --noEmit`

Run:

```bash
npx eslint src/lib/server/reviewAdminOpPreset.ts src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.ts src/app/api/admin/users/review-op-preset/route.test.ts src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/admin/tabs/users/types.ts src/admin/tabs/users/ReviewOpPresetSection.tsx src/admin/tabs/users/ReviewOpPresetSection.test.tsx src/admin/tabs/users/SelectedUserPanel.tsx src/admin/tabs/UsersTab.tsx
```

Expected: PASS.

- [ ] **Step 3: Inspect the final diff and confirm scope**

Run: `git diff --check`

Run: `git status --short`

Confirm the diff does not include deployment commands, quest/story completion, equipment/material grants, arena eligibility changes, or unrelated dirty worktree files.

- [ ] **Step 4: Commit any verification-only fixes**

If and only if verification required an in-scope correction:

```bash
git add src/lib/server/reviewAdminOpPreset.ts src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.ts src/app/api/admin/users/review-op-preset/route.test.ts src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/admin/tabs/users/types.ts src/admin/tabs/users/ReviewOpPresetSection.tsx src/admin/tabs/users/ReviewOpPresetSection.test.tsx src/admin/tabs/users/SelectedUserPanel.tsx src/admin/tabs/UsersTab.tsx src/admin/mailRecipient.test.ts
git commit -m "fix: harden review admin OP preset"
```
