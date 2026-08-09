# Dining Personal Menu Choice Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 공동 식재료 목표를 달성하면 개인 식권을 사용할 수 있고, 각 이용자가 시설 레벨에서 해금된 메뉴를 직접 골라 주문하게 한다.

**Architecture:** 메뉴 등록부의 `minFacilityLevel`을 주문 가능 메뉴의 단일 기준으로 삼는다. 길드와 협회 API는 과거 `selectedMenuIds` 저장값을 호환성 데이터로만 유지하고 응답·주문 판정에서 제외한다. 공유 React 패널과 도움말은 관리자 주간 메뉴 선정 대신 공동 목표와 개인 선택 흐름을 설명한다.

**Tech Stack:** Next.js App Router route handlers, React, TypeScript, Vitest

---

### Task 1: 시설 레벨별 메뉴 해금 SSOT 추가

**Files:**
- Modify: `src/adventure/data/v2/guildDining.ts`
- Modify: `src/adventure/data/v2/guildDining.test.ts`
- Modify: `src/adventure/data/v2/settlement.ts`
- Modify: `src/adventure/data/v2/settlement.test.ts`

**Step 1: Write the failing test**

시설 레벨별 해금 메뉴 수가 `[2, 3, 4, 5, 6]`이고 시설 요약이 이용 가능 메뉴 수를 표시하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts src/adventure/data/v2/settlement.test.ts`
Expected: 새 메뉴 해금 도우미가 없거나 기존 `weeklyMenuSlots` 기대값 때문에 FAIL.

**Step 3: Write minimal implementation**

`guildDiningMenusForFacilityLevel`을 추가하고 `DiningHallUpgradeDef.weeklyMenuSlots`와 데이터 값을 제거한다. 시설 요약은 도우미로 이용 가능 메뉴 수를 계산한다.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts src/adventure/data/v2/settlement.test.ts`
Expected: PASS.

### Task 2: 길드 식당 메뉴 선정 제거

**Files:**
- Modify: `src/app/api/v2/guild/dining-hall/route.test.ts`
- Modify: `src/app/api/v2/guild/dining-hall/route.ts`

**Step 1: Write the failing tests**

과거 선택 목록에 없는 Lv.1 메뉴 주문이 성공하고, 시설 레벨보다 높은 메뉴는 거부되며, `select_menus`는 유효하지 않은 요청이 되는 테스트를 작성한다.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/v2/guild/dining-hall/route.test.ts`
Expected: 선택 목록 외 메뉴 주문과 폐기 액션 기대가 FAIL.

**Step 3: Write minimal implementation**

관리자·선택 액션 의존성을 제거한다. GET/POST 응답에서 `canManage`, `menuSlots`, `selected`를 제거하고 주문은 메뉴 존재 여부와 시설 레벨만 검사한다.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/v2/guild/dining-hall/route.test.ts`
Expected: PASS.

### Task 3: 협회 식당에 동일한 개인 선택 규칙 적용

**Files:**
- Create: `src/app/api/v2/association/dining-hall/route.test.ts`
- Modify: `src/app/api/v2/association/dining-hall/route.ts`

**Step 1: Write the failing tests**

협회 주간 데이터의 선택 목록과 무관하게 해금 메뉴를 주문할 수 있고 시설 레벨 제한은 유지되는 라우트 테스트를 작성한다.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/v2/association/dining-hall/route.test.ts`
Expected: 선택 목록 외 메뉴 주문이 `menu_unavailable`로 FAIL.

**Step 3: Write minimal implementation**

협회 기본 호환 메뉴 목록은 시설에서 해금된 메뉴 전체로 저장하되, 응답과 주문 판정은 선택 목록을 사용하지 않는다.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/v2/association/dining-hall/route.test.ts`
Expected: PASS.

### Task 4: 개인 선택 UI와 안내 갱신

**Files:**
- Modify: `src/adventure/v2/guild/guildDiningAvailability.test.ts`
- Modify: `src/adventure/v2/guild/guildDiningAvailability.ts`
- Modify: `src/adventure/v2/guild/GuildDiningHallPanel.tsx`
- Delete: `src/adventure/v2/guild/guildDiningMenuSelection.ts`
- Delete: `src/adventure/v2/guild/guildDiningMenuSelection.test.ts`
- Modify: `src/app/manual/content/guild.tsx`

**Step 1: Write the failing test**

이용 불가 사유에서 주간 메뉴 미선정 사유가 사라지고 목표 미달·식권 소진 사유만 유지되는 기대값으로 바꾼다.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/guild/guildDiningAvailability.test.ts`
Expected: 기존 메뉴 미선정 사유가 남아 FAIL.

**Step 3: Write minimal implementation**

선택 상태와 메뉴 편집 UI를 제거하고 모든 해금 메뉴에 주문 버튼을 표시한다. 목표 달성 전 식권을 발급 예정으로 명확히 표시하고 설명서·레벨 표를 개인 메뉴 선택 흐름으로 갱신한다. 더 이상 참조되지 않는 메뉴 선택 도우미와 테스트를 삭제한다.

**Step 4: Run focused tests**

Run: `npm test -- src/adventure/v2/guild/guildDiningAvailability.test.ts src/adventure/data/v2/settlement.test.ts`
Expected: PASS.

### Task 5: 통합 검증과 커밋

**Files:**
- Verify all modified files

**Step 1: Run targeted dining tests**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts src/adventure/data/v2/settlement.test.ts src/adventure/v2/guild/guildDiningAvailability.test.ts src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/association/dining-hall/route.test.ts`
Expected: PASS.

**Step 2: Run static verification**

Run: `npm run lint`
Run: `npx tsc --noEmit`
Expected: both PASS.

**Step 3: Run full test suite**

Run: `npm test`
Expected: baseline과 동일하게 전체 PASS(기존 skip 제외).

**Step 4: Commit**

Run: `git add docs/superpowers/specs/2026-08-10-dining-personal-menu-choice-design.md docs/superpowers/plans/2026-08-10-dining-personal-menu-choice.md src/adventure/data/v2/guildDining.ts src/adventure/data/v2/guildDining.test.ts src/adventure/data/v2/settlement.ts src/adventure/data/v2/settlement.test.ts src/app/api/v2/guild/dining-hall/route.ts src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/association/dining-hall/route.ts src/app/api/v2/association/dining-hall/route.test.ts src/adventure/v2/guild/guildDiningAvailability.ts src/adventure/v2/guild/guildDiningAvailability.test.ts src/adventure/v2/guild/GuildDiningHallPanel.tsx src/adventure/v2/guild/guildDiningMenuSelection.ts src/adventure/v2/guild/guildDiningMenuSelection.test.ts src/app/manual/content/guild.tsx`

Run: `git commit -m "feat: let diners choose unlocked menus"`
