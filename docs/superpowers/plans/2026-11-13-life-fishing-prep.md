# 전투 준비물 3번째 칸(기력 보충·어유) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 낚시 어획물로 만드는 전투 준비물 4종(어유)과 세 번째 준비 칸 "기력 보충"(최대 MP)을 추가한다.

**Architecture:** 오늘 배포한 전투 준비물 모듈(`battlePrep.ts`)을 넓힌다. 칸·생활·효과에 값 하나씩을 더하고, 재료 정의에 선택 필드 두 개(어획물 재고 재료, 위험 해역 등급 묶음 재료)를 더한다. 기존 8종의 정의와 `costs` 모양은 그대로 둔다. 제작 API만 두 번째 세이브(`fishing-stock.v1`)를 잠근다.

**Tech Stack:** Next.js(App Router) · TypeScript · vitest · drizzle(saves_kv)

**Spec:** `docs/superpowers/specs/2026-11-13-life-fishing-prep-design.md`

## Global Constraints

- 품목 id와 수치: `v2_prep_fishoil_1/2/3/master`, 최대 MP +250/+500/+800/+1,100, 12시간(명장 24시간).
- 제작 조건: 낚시 Lv.1 / Lv.15 / Lv.25 / 낚시 주전공 명장 3단계(`lifeMajorCanCraft(state, "fishing")`, 부전공 불가).
- 재료(1개): 초급 `catch_common` 3 + `catch_fresh` 1 / 중급 `catch_fresh` 3 + `catch_quality` 3 / 상급 `catch_quality` 4 + `catch_special` 1 + 위험 해역 희귀 이상 2 / 명장 `catch_special` 2 + `catch_legendary` 1 + 위험 해역 영웅 이상 2 + `v2_master_catch` 1.
- 숫돌·보강재 8종의 수치·재료·id는 바꾸지 않는다.
- 잠금 순서는 `character.v2` → `fishing-stock.v1`. `fishing-stock.v1`의 `daily`는 건드리지 않는다.
- `derivePlayerCombatV2Pure.ts`는 줄을 늘리지 않는다(모듈 예산).
- 클라이언트 컴포넌트에서 `@/adventure/v2/lifeMajor`를 값으로 import하지 않는다(화면 상수는 `lifeMajorRules.ts`).
- 표면은 `surfaces.ts` 토큰만 쓴다. 플레이어 문구에 마크다운·대시·"v2"를 쓰지 않는다.
- 서브에이전트를 쓰지 않는다. 배포·푸시는 하지 않는다.

## Review Focus

1. `fishing-stock.v1`이 없는 계정이 제작 화면을 열면 어획물 보유 0으로 보이고 오류가 나지 않는다 → Task 3.
2. 위험 해역 어획물이 여러 어종에 한두 개씩 흩어져 있어도 합쳐서 낸다. 낮은 등급을 먼저 쓴다 → Task 1.
3. 숫돌·보강재를 만들 때는 `fishing-stock.v1`을 저장하지 않는다 → Task 3.
4. `vigor` 칸이 없는 기존 세이브와 `weapon`·`armor`만 켠 세이브가 그대로 읽힌다 → Task 1.
5. 어유만 켜고 음식이 없을 때도 최대 MP가 오르고, 음식 제외 전투에서는 빠진다 → Task 2.

---

### Task 1: 카탈로그와 순수 로직

**Files:**
- Modify: `src/adventure/data/v2/battlePrep.ts`
- Modify: `src/adventure/data/v2/battlePrep.test.ts`
- Modify: `src/adventure/data/v2/codex.test.ts` (136 → 140, 날짜 주석)
- Modify: `src/lib/server/marketplaceV2.test.ts` (136 → 140, 날짜 주석)
- Modify: `src/adventure/v2/lifeMajorProducts.ts` (명장 어획 설명에 "명장의 어유" 추가)

**Interfaces (Produces):**

```ts
export type BattlePrepSlot = "weapon" | "armor" | "vigor";
export type BattlePrepActivity = "mining" | "woodcutting" | "fishing";
export type BattlePrepEffect = { atk: number; magicAtk: number; def: number; magicDef: number; maxHp: number; maxMp: number };
export type BattlePrepDangerCatchCost = { minRarity: "rare" | "epic"; amount: number };
export type BattlePrepItem = {
  /* 기존 필드 + */
  catchCosts?: Partial<Record<FishingCatchItemId, number>>;   // fishing-stock.v1 items
  dangerCatchCost?: BattlePrepDangerCatchCost;                 // character.v2 materials 중 등급 묶음
};
export const BATTLE_PREP_SLOTS = ["weapon", "armor", "vigor"];
export const BATTLE_PREP_SLOT_NAME = { weapon: "무기 손질", armor: "방어구 손질", vigor: "기력 보충" };

/** 낮은 등급부터, 같은 등급은 보유량 많은 어종 → 화물 가치 낮은 어종 → 정의 순서. 모자라면 null. */
export function selectDangerCatchMaterials(
  materials: Readonly<Record<string, number>>, cost: BattlePrepDangerCatchCost, quantity: number,
): Record<string, number> | null;
export function dangerCatchHeld(materials: Readonly<Record<string, number>>, minRarity: "rare" | "epic"): number;
export function dangerCatchCostName(minRarity: "rare" | "epic"): string; // "위험 해역 희귀 이상 어획물" / "위험 해역 영웅 이상 어획물"

export type BattlePrepCraftContext = {
  levels: Record<BattlePrepActivity, number>;
  masterCraft: Record<BattlePrepActivity, boolean>;
};
export function craftBattlePrep(args: {
  materials: Record<string, number>;
  catchItems?: Partial<Record<FishingCatchItemId, number>>;
  itemId: unknown; quantity: unknown;
} & BattlePrepCraftContext):
  | { ok: true; item: BattlePrepItem; quantity: number; materials: Record<string, number>;
      catchItems: Partial<Record<FishingCatchItemId, number>>; usesCatchStock: boolean }
  | { ok: false; error: BattlePrepCraftError };

export type BattlePrepCraftRow = { /* 기존 + */ costs: Array<{ id: string; need: number; owned: number; name?: string }> };
export function battlePrepCraftRows(args: {
  materials: Record<string, number>; catchItems?: Partial<Record<FishingCatchItemId, number>>;
} & BattlePrepCraftContext): BattlePrepCraftRow[];
```

- 행의 재료 순서: `catchCosts`(등급 낮은 순) → `dangerCatchCost` → `costs`. 어획물 재고 재료의 행 id는 어획물 id, `name`은 `FISHING_CATCH_ITEMS[id].name`. 묶음 재료의 행 id는 `danger_catch:rare` / `danger_catch:epic`, `name`은 `dangerCatchCostName`.
- `usesCatchStock`은 품목에 `catchCosts`가 있을 때만 true.
- 어유 이름은 "초급 어유", "중급 어유", "상급 어유", "명장의 어유". 효과 문구는 `최대 MP +800` 형식.
- import는 `@/adventure/data/v2/dangerousFishing`(순수 데이터)와 `@/adventure/v2/fishingStock`만 더한다. `dangerousFishingExchange.ts`는 import하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성** — `battlePrep.test.ts`에 추가·수정:
  - 12종, 어유 4종의 `effect.maxMp` = [250, 500, 800, 1100], 다른 효과 0, `slot: "vigor"`, `activity: "fishing"`, `requiredLevel` = 1/15/25(명장은 전공), 명장만 24시간.
  - 어유 재료가 Global Constraints 표와 같다(`catchCosts`, `dangerCatchCost`, `costs`).
  - 기존 8종 테스트의 효과 기대값에 `maxMp: 0`을 더하고, 레벨·활동 반복문은 어유를 뺀 8종에만 적용한다. 컨텍스트 객체에 `fishing`을 더한다.
  - `selectDangerCatchMaterials`: 희귀 1 + 영웅 5 보유, 희귀 이상 2 → 희귀 1 + 영웅 1. 영웅 이상 2 → 희귀를 쓰지 않는다. 합계 부족 → null. 수량 3이면 6개를 고른다. 같은 등급에서 보유량 많은 어종 먼저.
  - `craftBattlePrep` 어유: 상급 2개 제작 시 `catchItems`와 `materials`가 정확히 줄고 0이 된 키는 지워진다. 어획물 부족·위험 해역 어획물 부족은 `not_enough_materials`. 낚시 Lv.24는 `level_required`. 숫돌 제작은 `usesCatchStock: false`이고 `catchItems`를 그대로 돌려준다.
  - `battlePrepCraftRows`: 어유 행의 `costs`가 이름을 싣고, `maxCraftable`이 세 종류 재료 중 가장 모자란 쪽을 따른다. `catchItems`를 안 넘기면 어획물 보유 0.
  - `activeBattlePreps`: `vigor` 칸을 읽고, `vigor`에 숫돌 id가 있으면 버린다. `vigor`가 없는 기존 값은 그대로다.
  - `battlePrepCombatFlat`: 세 칸을 켜면 `maxMp`가 더해진다.
  - 그림 파일 테스트는 12종 모두 경로 규칙을 확인하고 파일 존재도 12종 모두 확인한다(어유 그림이 없으면 실패하는 것이 맞다. 그림은 구현 뒤 추가한다).
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/battlePrep.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 위 명령 + `npx vitest run src/adventure/data/v2/codex.test.ts src/lib/server/marketplaceV2.test.ts`. 그림 파일 존재 단언 하나만 실패로 남는다.
- [ ] **Step 5: Commit** — `feat: 전투 준비물에 기력 보충 칸과 어유 4종 정의 추가`

### Task 2: 전투 반영

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2FromSaves.ts` (`maxMp: (foodFlat?.maxMp ?? 0) + (prepFlat?.maxMp ?? 0)`)
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:** Consumes `battlePrepCombatFlat(...).maxMp` (Task 1).

- [ ] **Step 1: 실패하는 테스트** — 기존 준비물 전투 반영 테스트 옆에: `activeBattlePreps: { vigor: { itemId: "v2_prep_fishoil_3", expiresAt: 미래 } }`면 `player.maxMp`가 기준보다 정확히 800 크고 공격력·방어력·HP는 같다. `includeCookingBuff: false`면 기준과 같다. 만료된 `vigor`는 무시한다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/derivePlayerCombatV2.test.ts -t "어유"`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: 어유의 최대 MP를 전투 수치에 반영`

### Task 3: 제작 API

**Files:**
- Modify: `src/app/api/v2/life-workshop/battle-prep/route.ts`
- Modify: `src/app/api/v2/life-workshop/battle-prep/route.test.ts`

**Interfaces:** Consumes Task 1의 `craftBattlePrep`, `battlePrepCraftRows`. `FISHING_STOCK_KEY`, `parseFishingStock`, `emptyFishingStock`(`@/adventure/v2/fishingStock`).

- 컨텍스트에 `levels.fishing`, `masterCraft.fishing`을 채운다.
- GET: `fishing-stock.v1`을 읽어 `catchItems`로 넘긴다.
- POST: `character.v2`를 잠근 뒤 요청 품목에 `catchCosts`가 있을 때만 `fishing-stock.v1`을 잠근다. 없으면 잠그지 않고 읽기만 한다(행 표시용). 저장은 `usesCatchStock`일 때만 `{ ...stock, items: crafted.catchItems }`.

- [ ] **Step 1: 실패하는 테스트**
  - 낚시 Lv.25가 상급 어유 2개를 만들면 두 세이브가 정확히 줄고 `daily`는 그대로다.
  - 낚시 Lv.24 → `level_required`, 어획물 1개 부족 → `not_enough_materials`, 위험 해역 어획물 부족 → `not_enough_materials`. 세이브 변경 없음.
  - 명장의 어유: 낚시 부전공 9단계 거절, 주전공 3단계 성공.
  - 숫돌 제작 시 `upsertSave`가 `character.v2`로 한 번만 불린다.
  - GET: 12행. `fishing-stock.v1`이 없어도 200이고 어유 행의 어획물 보유가 0이다.
  - 기존 테스트의 "8행" 기대값을 12로 고친다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/api/v2/life-workshop/battle-prep/route.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 위 명령 + `npx vitest run src/app/api/v2/me/use-battle-prep/route.test.ts`(어유 사용 시 `vigor`만 바뀌는 테스트 1개 추가)
- [ ] **Step 5: Commit** — `feat: 어유 제작(어획물 재고·위험 해역 어획물 차감)`

### Task 4: 화면

**Files:**
- Modify: `src/adventure/v2/BattlePrepCraftPanel.tsx` + `.test.tsx` (`ACTIVITY_NAME.fishing = "낚시"`, 재료 이름 `cost.name ?? V2_MATERIALS[cost.id]?.name ?? cost.id`, 안내 문장)
- Modify: `src/adventure/v2/BattlePrepBadges.tsx` + `.test.tsx` (`vigor` 아이콘: `@phosphor-icons/react`의 `Drop`)
- Modify: `src/adventure/v2/inventory/BattlePrepSection.tsx` (주석만), `.test.tsx`에 어유 행 1건
- Modify: `src/app/dev/battle-prep/page.tsx` (미리보기 컨텍스트에 낚시·어획물·`vigor`)
- 확인만: `CompactCharacterSummary.tsx`, `CompactCharacterEffectCard.tsx`, `V2CharacterCard.tsx`, `InventoryItemIcon.tsx`, `RareMapsTab.tsx`, `me/state/route.ts`는 칸 목록과 품목 정의를 읽으므로 코드 변경이 없어야 한다. `tsc`로 확인한다.

안내 문장: "인벤토리 소모품 탭에서 사용합니다. 무기 손질, 방어구 손질, 기력 보충은 음식과 함께 적용됩니다."

- [ ] **Step 1: 실패하는 테스트** — 패널: 어유 행이 "기력 보충" 묶음 아래에 보이고 재료 줄에 "위험 해역 희귀 이상 어획물 14/2", "고급 어획물 3/4"(부족 색)처럼 이름이 나온다. 막힌 행은 "낚시 Lv.25부터 제작할 수 있습니다.", "낚시 주전공 명장 3단계부터 제작할 수 있습니다." 배지: `vigor`를 켜면 세 번째 줄에 "상급 어유 · 최대 MP +800".
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/BattlePrepCraftPanel.test.tsx src/adventure/v2/BattlePrepBadges.test.tsx src/adventure/v2/inventory/BattlePrepSection.test.tsx`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 위 명령 + `npx vitest run src/adventure/v2/CompactCharacterSummary.test.tsx`
- [ ] **Step 5: Commit** — `feat: 기력 보충 칸과 어유를 제작·인벤토리·캐릭터 화면에 표시`

### Task 5: 안내서와 기록

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`, `src/app/manual/current-content.test.tsx`
- Create: `docs/content-modification-records/2026-11-13-life-fishing-prep.md`

- 준비물 표의 재료 문구 함수가 `catchCosts`·`dangerCatchCost`를 함께 적는다. 조건 문구가 낚시를 처리한다.
- 전투 준비물 첫 문단: "생활 공방의 제작 탭에서 벌목·채광 가공재로 숫돌과 보강재를, 낚시 어획물로 어유를 만듭니다. 인벤토리의 소모품 탭에서 사용하며, 무기 손질·방어구 손질·기력 보충에 하나씩 음식과 함께 적용됩니다."
- 표 아래 문장 추가: "위험 해역 희귀 이상 어획물은 위험 해역에서 낚은 희귀·영웅·전설 등급 어획물을 어종과 상관없이 합쳐서 냅니다. 낮은 등급부터 쓰입니다."
- 생활 전공 항목: 명장 등급 문장에 "어유는 낚시 주전공"을 더한다.
- 개인 요리 항목의 "무기 손질·방어구 손질과 함께 적용됩니다"에 기력 보충을 더한다.
- 위험 해역 항목: "안전 귀환한 희귀 등급 이상 어획물은 상급 어유와 명장의 어유의 재료로도 씁니다."

- [ ] **Step 1: 실패하는 테스트** — `current-content.test.tsx`에 "초급 어유", "기력 보충", "위험 해역 희귀 이상 어획물 2", "낚시 주전공 명장 3단계" 노출 단언.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/manual/current-content.test.tsx`
- [ ] **Step 3: 구현 + 기록 문서 작성**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `docs: 안내서에 기력 보충 칸과 어유 추가, 수정 기록`

### Task 6: 전체 검증

- [ ] `npx tsc --noEmit -p .` 오류 0
- [ ] `npx eslint` 변경 파일 오류 0
- [ ] `node scripts/check-module-budgets.mjs`(또는 package.json의 해당 스크립트) 통과
- [ ] 준비물·낚시·요리·안내서·거래소·도감 관련 테스트 묶음 통과. 실패는 어유 그림 파일 존재 단언 하나뿐이어야 한다.
- [ ] `anti-slop-ui` 스킬 검수 항목으로 바뀐 화면 문구·클래스를 확인한다.
- [ ] 설계 문서의 "재료 정의 형태"를 실제 구현(선택 필드 두 개)에 맞게 고친다.
