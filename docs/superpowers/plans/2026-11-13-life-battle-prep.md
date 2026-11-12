# 전투 준비물(숫돌·보강재) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 벌목·채광 가공재로 만드는 12시간 전투 준비물 8종(숫돌 4, 보강재 4)을 추가해 음식과 중복 적용되는 전투 준비 칸 두 개를 만든다.

**Architecture:** 준비물은 재료 카탈로그에 등록된 `character.v2.materials` 스택이다. 순수 모듈 `battlePrep.ts`가 품목 정의·제작 판정·사용·효과 합산을 모두 갖고, 새 API 두 개(제작, 사용)와 `derivePlayerCombatV2FromSaves`가 그 함수를 호출한다. 켜 둔 효과는 `character.v2.activeBattlePreps`에 품목 id와 만료 시각만 기록한다.

**Tech Stack:** Next.js(App Router, 이 저장소 버전은 `node_modules/next/dist/docs/` 확인 후 작성), TypeScript, Vitest, Tailwind, 기존 `surfaces.ts` 토큰과 공용 UI 컴포넌트.

**Spec:** `docs/superpowers/specs/2026-11-13-life-battle-prep-design.md`

## Global Constraints

- 배포·푸시·PR·main 병합은 하지 않는다. 커밋은 `feat/life-battle-prep` 브랜치(`/tmp/wt-life-battle-prep`)에만 한다.
- 서브에이전트를 만들지 않는다.
- 플레이어에게 보이는 문구에 "v2", 개발 경위, 홍보성 수식어, 플레이버 부제, 긴 줄표를 쓰지 않는다.
- 패널·카드 배경은 `src/components/ui/surfaces.ts`의 `SURFACE_CARD`/`SURFACE_INSET`/`SURFACE_ACCENT` 또는 `Card`/`Inset`만 쓴다. 새 색·그라데이션·배지 장식·`text-[10px]`·`text-[11px]`를 추가하지 않는다.
- 효과 수치(스펙 1절): 숫돌 공격력·마법공격력 +40 / +80 / +130 / +180, 보강재 방어력·마법방어력 +20 / +40 / +65 / +90과 최대 HP +300 / +600 / +1,000 / +1,400. 지속은 1~3등급 12시간, 명장 24시간.
- 제작 재료(스펙 2절)와 조건: 1등급 Lv.1, 2등급 Lv.20, 3등급 Lv.35, 명장은 해당 생활 주전공 명장 3단계 이상. 한 번에 1~20개. 골드 비용 없음.
- 적용 범위는 음식과 같다. `includeCookingBuff === false`인 호출에서는 준비물도 빠진다. 옵션 이름은 바꾸지 않는다.
- `tsc`는 `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`로 돌린다. 넓은 vitest 실행은 피하고 해당 파일만 지정한다(다른 세션과 메모리를 나눠 쓴다).

## Review Focus

- 만료된 준비물이 세이브에 남아 있을 때: 전투 수치, 상태 응답, 화면 어디에도 반영되지 않아야 한다. (Task 1, 2)
- 카탈로그에서 사라지거나 모르는 `itemId`가 `activeBattlePreps`나 요청에 들어올 때: 무시하거나 `bad_item`으로 거절하고 다른 칸은 유지한다. (Task 1, 3)
- 같은 칸에 낮은 등급을 덮어쓸 때: 새 품목으로 교체되고 시간은 누적되지 않는다. 다른 칸은 그대로다. (Task 3)
- 재료가 정확히 필요한 양만큼만 있을 때와 1개 모자랄 때: 앞은 제작되고 재료 키가 0으로 남지 않으며, 뒤는 아무것도 차감하지 않는다. (Task 1, 4)
- 부전공이 명장 9단계여도 명장 등급은 만들 수 없다(주전공만). (Task 4)

---

### Task 1: 준비물 카탈로그와 순수 로직

**Files:**
- Create: `src/adventure/data/v2/battlePrep.ts`
- Create: `src/adventure/data/v2/battlePrep.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.ts` (명장 산물·단련 촉매 등록 아래에 `...BATTLE_PREP_MATERIALS` 추가)
- Modify: `src/adventure/v2/lifeMajorProducts.ts` (명장 목재·명장 합금 설명 문구)

**Interfaces:**
- Consumes: `MINING_MATERIAL_ID`(`@/adventure/data/v2/miningSpots`), `LIFE_PROCESSED_MATERIAL_ID`(`@/adventure/v2/lifeWorkshopMaterials`), `LIFE_MAJOR_PRODUCT_ID`(`@/adventure/v2/lifeMajorProducts`). `dungeonDrops`는 import하지 않는다(순환 방지).
- Produces:

```ts
export type BattlePrepSlot = "weapon" | "armor";
export type BattlePrepTier = 1 | 2 | 3 | "master";
export type BattlePrepActivity = "mining" | "woodcutting";
export type BattlePrepEffect = { atk: number; magicAtk: number; def: number; magicDef: number; maxHp: number };
export type BattlePrepItem = {
  id: string; name: string; description: string;
  slot: BattlePrepSlot; tier: BattlePrepTier; activity: BattlePrepActivity;
  requiredLevel: number; requiresMajor: boolean; durationMs: number;
  effect: BattlePrepEffect; costs: Record<string, number>;
};
export const BATTLE_PREP_SLOTS: readonly BattlePrepSlot[]; // ["weapon", "armor"]
export const BATTLE_PREP_SLOT_NAME: Record<BattlePrepSlot, string>; // 무기 손질, 방어구 손질
export const BATTLE_PREP_CRAFT_MAX_QUANTITY = 20;
export const BATTLE_PREP_ITEMS: readonly BattlePrepItem[];
export const BATTLE_PREP_ITEM_BY_ID: ReadonlyMap<string, BattlePrepItem>;
export const BATTLE_PREP_MATERIALS: Record<string, { id: string; name: string; description: string }>;

export type ActiveBattlePrep = { itemId: string; expiresAt: number };
export type ActiveBattlePreps = Partial<Record<BattlePrepSlot, ActiveBattlePrep>>;
export function activeBattlePreps(raw: unknown, now?: number): ActiveBattlePreps;
export function battlePrepCombatFlat(active: ActiveBattlePreps): BattlePrepEffect;
export function battlePrepEffectText(effect: BattlePrepEffect): string;

export type BattlePrepCraftContext = {
  levels: Record<BattlePrepActivity, number>;
  masterCraft: Record<BattlePrepActivity, boolean>;
};
export type BattlePrepCraftError = "bad_item" | "invalid_quantity" | "level_required" | "major_required" | "not_enough_materials";
export function craftBattlePrep(args: { materials: Record<string, number>; itemId: unknown; quantity: unknown } & BattlePrepCraftContext):
  | { ok: true; item: BattlePrepItem; quantity: number; materials: Record<string, number> }
  | { ok: false; error: BattlePrepCraftError };

export type BattlePrepCraftRow = {
  id: string; name: string; slot: BattlePrepSlot; tier: BattlePrepTier; activity: BattlePrepActivity;
  effectText: string; durationHours: number; owned: number;
  costs: Array<{ id: string; need: number; owned: number }>;
  blocked: "level" | "major" | null; requiredLevel: number; maxCraftable: number;
};
export function battlePrepCraftRows(args: { materials: Record<string, number> } & BattlePrepCraftContext): BattlePrepCraftRow[];

export function applyBattlePrepUse(args: { materials: Record<string, number>; activeRaw: unknown; itemId: unknown; now: number }):
  | { ok: true; item: BattlePrepItem; materials: Record<string, number>; active: ActiveBattlePreps }
  | { ok: false; error: "bad_item" | "not_owned" };
```

품목 id와 이름은 스펙 1절 표 그대로다. 설명 문구는 `"{칸 이름}에 쓴다. {효과 문구} · {N}시간."` 형식으로 `battlePrepEffectText`에서 만든다. `battlePrepEffectText`는 0이 아닌 수치만 `"공격력·마법공격력 +130"`, `"방어력·마법방어력 +65 · 최대 HP +1,000"` 형식으로 돌려준다(공격력과 마법공격력이 같으면 한 묶음, 방어도 같음).

- [ ] **Step 1: 실패하는 테스트 작성** (`battlePrep.test.ts`)

```ts
it("8종의 효과·지속·조건이 스펙 값과 같다", () => {
  const byId = BATTLE_PREP_ITEM_BY_ID;
  expect(BATTLE_PREP_ITEMS).toHaveLength(8);
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_whetstone_${t}`)!.effect.atk)).toEqual([40, 80, 130, 180]);
  expect(byId.get("v2_prep_whetstone_3")!.effect).toEqual({ atk: 130, magicAtk: 130, def: 0, magicDef: 0, maxHp: 0 });
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_brace_${t}`)!.effect)).toEqual([
    { atk: 0, magicAtk: 0, def: 20, magicDef: 20, maxHp: 300 },
    { atk: 0, magicAtk: 0, def: 40, magicDef: 40, maxHp: 600 },
    { atk: 0, magicAtk: 0, def: 65, magicDef: 65, maxHp: 1_000 },
    { atk: 0, magicAtk: 0, def: 90, magicDef: 90, maxHp: 1_400 },
  ]);
  for (const item of BATTLE_PREP_ITEMS) {
    expect(item.durationMs).toBe((item.tier === "master" ? 24 : 12) * 3_600_000);
    expect(item.requiresMajor).toBe(item.tier === "master");
    expect(item.requiredLevel).toBe(item.tier === 2 ? 20 : item.tier === 1 ? 1 : 35);
    expect(item.activity).toBe(item.slot === "weapon" ? "mining" : "woodcutting");
  }
});

it("제작 재료가 스펙 표와 같고 모두 재료 카탈로그에 있다", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID; const M = MINING_MATERIAL_ID;
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_1")!.costs).toEqual({ [P.basicIngot]: 40, [M.stone]: 20 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_2")!.costs).toEqual({ [P.preciousIngot]: 25, [P.basicIngot]: 15, [M.coal]: 10 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_3")!.costs).toEqual({ [P.arcaneAlloy]: 20, [P.preciousIngot]: 10, [P.basicIngot]: 10, [M.roughGem]: 5 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_master")!.costs).toEqual({ [P.arcaneAlloy]: 20, [P.preciousIngot]: 10, [P.basicIngot]: 10, [M.roughGem]: 5, [LIFE_MAJOR_PRODUCT_ID.mining]: 1 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_1")!.costs).toEqual({ [P.softwood]: 40 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_2")!.costs).toEqual({ [P.hardwood]: 25, [P.softwood]: 15 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_3")!.costs).toEqual({ [P.masterwood]: 20, [P.hardwood]: 10, [P.softwood]: 10 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_master")!.costs).toEqual({ [P.masterwood]: 20, [P.hardwood]: 10, [P.softwood]: 10, [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 1 });
  for (const item of BATTLE_PREP_ITEMS) {
    expect(V2_MATERIALS[item.id]?.name).toBe(item.name);
    for (const id of Object.keys(item.costs)) expect(V2_MATERIALS[id], id).toBeDefined();
  }
});

it("켜 둔 준비물 파서는 만료·모르는 품목·칸 불일치·잘못된 형식을 버린다", () => {
  const now = 1_000_000;
  expect(activeBattlePreps({
    weapon: { itemId: "v2_prep_whetstone_3", expiresAt: now + 1 },
    armor: { itemId: "v2_prep_brace_2", expiresAt: now },          // 만료
  }, now)).toEqual({ weapon: { itemId: "v2_prep_whetstone_3", expiresAt: now + 1 } });
  expect(activeBattlePreps({ weapon: { itemId: "v2_prep_brace_1", expiresAt: now + 1 } }, now)).toEqual({}); // 칸 불일치
  expect(activeBattlePreps({ weapon: { itemId: "gone", expiresAt: now + 1 }, armor: "x" }, now)).toEqual({});
  expect(activeBattlePreps(null, now)).toEqual({});
});

it("두 칸의 고정 수치를 합산하고 효과 문구를 만든다", () => {
  const flat = battlePrepCombatFlat({
    weapon: { itemId: "v2_prep_whetstone_master", expiresAt: 9 },
    armor: { itemId: "v2_prep_brace_3", expiresAt: 9 },
  });
  expect(flat).toEqual({ atk: 180, magicAtk: 180, def: 65, magicDef: 65, maxHp: 1_000 });
  expect(battlePrepCombatFlat({})).toEqual({ atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0 });
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_3")!.effect)).toBe("공격력·마법공격력 +130");
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_3")!.effect)).toBe("방어력·마법방어력 +65 · 최대 HP +1,000");
});

describe("craftBattlePrep", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID;
  const ctx = { levels: { mining: 100, woodcutting: 100 }, masterCraft: { mining: false, woodcutting: false } };
  it("정확한 양이면 제작하고 0이 된 재료 키를 지운다", () => {
    const result = craftBattlePrep({ ...ctx, materials: { [P.softwood]: 80, other: 3 }, itemId: "v2_prep_brace_1", quantity: 2 });
    expect(result).toMatchObject({ ok: true, quantity: 2, materials: { other: 3, v2_prep_brace_1: 2 } });
    expect(result.ok && P.softwood in result.materials).toBe(false);
  });
  it("1개 모자라면 거절하고, 레벨·전공·수량·품목 오류를 구분한다", () => {
    expect(craftBattlePrep({ ...ctx, materials: { [P.softwood]: 79 }, itemId: "v2_prep_brace_1", quantity: 2 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, levels: { mining: 100, woodcutting: 19 }, materials: {}, itemId: "v2_prep_brace_2", quantity: 1 })).toEqual({ ok: false, error: "level_required" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_whetstone_master", quantity: 1 })).toEqual({ ok: false, error: "major_required" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_brace_1", quantity: 21 })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_brace_1", quantity: 1.5 })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "nope", quantity: 1 })).toEqual({ ok: false, error: "bad_item" });
  });
});

it("제작 화면용 행은 보유량·막힌 이유·최대 제작 수를 계산한다", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID;
  const rows = battlePrepCraftRows({
    materials: { [P.softwood]: 95, v2_prep_brace_1: 4 },
    levels: { mining: 1, woodcutting: 25 }, masterCraft: { mining: false, woodcutting: false },
  });
  expect(rows.map((row) => row.id)).toEqual(BATTLE_PREP_ITEMS.map((item) => item.id));
  const brace1 = rows.find((row) => row.id === "v2_prep_brace_1")!;
  expect(brace1).toMatchObject({ owned: 4, blocked: null, maxCraftable: 2, durationHours: 12, costs: [{ id: P.softwood, need: 40, owned: 95 }] });
  expect(rows.find((row) => row.id === "v2_prep_brace_3")).toMatchObject({ blocked: "level", maxCraftable: 0, requiredLevel: 35 });
  expect(rows.find((row) => row.id === "v2_prep_brace_master")).toMatchObject({ blocked: "major", maxCraftable: 0 });
  expect(rows.find((row) => row.id === "v2_prep_whetstone_1")).toMatchObject({ blocked: null, maxCraftable: 0 });
});

describe("applyBattlePrepUse", () => {
  const now = 5_000;
  it("1개를 쓰고 같은 칸만 교체한다", () => {
    const result = applyBattlePrepUse({
      materials: { v2_prep_whetstone_1: 1, keep: 2 },
      activeRaw: { weapon: { itemId: "v2_prep_whetstone_master", expiresAt: now + 99 }, armor: { itemId: "v2_prep_brace_2", expiresAt: now + 50 } },
      itemId: "v2_prep_whetstone_1", now,
    });
    expect(result).toMatchObject({
      ok: true, materials: { keep: 2 },
      active: { weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now + 12 * 3_600_000 }, armor: { itemId: "v2_prep_brace_2", expiresAt: now + 50 } },
    });
    expect(result.ok && "v2_prep_whetstone_1" in result.materials).toBe(false);
  });
  it("미보유와 모르는 품목을 거절한다", () => {
    expect(applyBattlePrepUse({ materials: {}, activeRaw: {}, itemId: "v2_prep_brace_1", now })).toEqual({ ok: false, error: "not_owned" });
    expect(applyBattlePrepUse({ materials: { x: 1 }, activeRaw: {}, itemId: "x", now })).toEqual({ ok: false, error: "bad_item" });
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/battlePrep.test.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 3: `battlePrep.ts` 구현.** 품목은 데이터 배열 하나로 정의하고 나머지는 거기서 파생한다. 보유량은 `Math.max(0, Math.floor(Number(x) || 0))`로 읽는다. `craftBattlePrep`의 판정 순서는 품목 → 수량 → 레벨 → 전공 → 재료다.
- [ ] **Step 4: `dungeonDrops.ts`에 등록, `lifeMajorProducts.ts` 문구 수정.** 명장 목재: `"벌목 명장만 고를 수 있는 결 좋은 목재. 단련 촉매와 명장의 보강재의 재료가 된다."`, 명장 합금: `"채광 명장만 뽑아낼 수 있는 순도 높은 합금. 단련 촉매와 명장의 숫돌의 재료가 된다."`
- [ ] **Step 5: 통과 확인** — `npx vitest run src/adventure/data/v2/battlePrep.test.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/v2/lifeMajor.test.ts` → PASS. (문구를 고정한 기존 테스트가 있으면 새 문구로 고친다.)
- [ ] **Step 6: 커밋** — `feat: 전투 준비물 카탈로그와 제작·사용 판정 추가`

---

### Task 2: 전투 수치 반영

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2FromSaves.ts` (음식 `combatFlat`을 더하는 마지막 블록, `includeCookingBuff` 주석)
- Modify: `src/lib/server/derivePlayerCombatV2Pure.ts` (`SavedCharacterV2`에 `activeBattlePreps?: unknown;` 추가, `activeFoodBuff` 옆)
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Consumes: `activeBattlePreps(raw, now)`, `battlePrepCombatFlat(active)` (Task 1)
- Produces: `derivePlayerCombatV2FromSaves`가 `character.activeBattlePreps`를 반영한다. 시그니처 변화 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 "음식의 고정 HP·MP는…" 테스트 옆에 추가한다.

```ts
describe("전투 준비물", () => {
  const base = { equipmentSave: {}, proficiencyRaw: {}, skillsRaw: {} };
  const future = Date.now() + 60_000;
  const prep = { weapon: { itemId: "v2_prep_whetstone_3", expiresAt: future }, armor: { itemId: "v2_prep_brace_3", expiresAt: future } };

  it("숫돌·보강재의 고정 수치를 더한다", () => {
    const plain = derivePlayerCombatV2FromSaves({ ...base, character: { level: 100 } })!;
    const buffed = derivePlayerCombatV2FromSaves({ ...base, character: { level: 100, activeBattlePreps: prep } })!;
    expect(buffed.player.atk - plain.player.atk).toBe(130);
    expect((buffed.player.magicAtk ?? 0) - (plain.player.magicAtk ?? plain.player.atk)).toBe(130);
    expect(buffed.player.def - plain.player.def).toBe(65);
    expect((buffed.player.magicDef ?? 0) - (plain.player.magicDef ?? 0)).toBe(65);
    expect(buffed.maxHp - plain.maxHp).toBe(1_000);
    expect(buffed.player.maxHp).toBe(buffed.maxHp);
  });

  it("음식과 함께 켜면 둘 다 더해진다", () => {
    const food = { recipeId: "flame_corn_stew", recipeName: "불꽃 옥수수 스튜", quality: "normal", effect: { combatFlat: { maxHp: 300 } }, expiresAt: future };
    const plain = derivePlayerCombatV2FromSaves({ ...base, character: { level: 100 } })!;
    const both = derivePlayerCombatV2FromSaves({ ...base, character: { level: 100, activeFoodBuff: food, activeBattlePreps: prep } })!;
    expect(both.maxHp - plain.maxHp).toBe(1_300);
  });

  it("음식을 제외하는 전투에서는 준비물도 빠지고, 만료된 칸은 무시한다", () => {
    const plain = derivePlayerCombatV2FromSaves({ ...base, character: { level: 100 } })!;
    expect(derivePlayerCombatV2FromSaves({ ...base, character: { level: 100, activeBattlePreps: prep }, includeCookingBuff: false })).toEqual(plain);
    const expired = { weapon: { itemId: "v2_prep_whetstone_3", expiresAt: Date.now() - 1 } };
    expect(derivePlayerCombatV2FromSaves({ ...base, character: { level: 100, activeBattlePreps: expired } })).toEqual(plain);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/derivePlayerCombatV2.test.ts -t "전투 준비물"` → FAIL.
- [ ] **Step 3: 구현.** 마지막 블록에서 음식 `combatFlat`과 `battlePrepCombatFlat(...)`을 키별로 합친 뒤 기존 가산식을 한 번만 적용한다. 합이 전부 0이면 지금처럼 `derived`를 그대로 돌려준다(기존 결과와 바이트 동일 유지). `includeCookingBuff === false`면 준비물도 읽지 않는다. 옵션 주석을 "음식과 전투 준비물을 함께 제외"로 고친다.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/server/derivePlayerCombatV2.test.ts` 전체 PASS.
- [ ] **Step 5: 커밋** — `feat: 전투 준비물 고정 수치를 PvE 전투 수치에 반영`

---

### Task 3: 사용 API

**Files:**
- Create: `src/app/api/v2/me/use-battle-prep/route.ts`
- Create: `src/app/api/v2/me/use-battle-prep/route.test.ts`

**Interfaces:**
- Consumes: `applyBattlePrepUse` (Task 1), `lockSaveForUpdate`/`upsertSave`, `ensureUser`, `enforceUserAndIpRateLimit`
- Produces: `POST /api/v2/me/use-battle-prep` 요청 `{ itemId }` → 200 `{ ok: true, itemId, slot, expiresAt, activeBattlePreps, owned }`, 400 `{ ok: false, error: "bad_item" }`, 409 `{ ok: false, error: "not_owned" }`, 401 `unauthorized`.

요청 제한은 `use-cooking-food`와 같은 값(`userLimit: 30, ipLimit: 180, windowMs: 60_000`), action은 `"v2:me:use-battle-prep"`.

- [ ] **Step 1: 실패하는 테스트 작성** — `use-cooking-food/route.test.ts`의 mock 구성을 그대로 쓴다(`@/db`, `ensureUser`, `userRateLimit`, `savesKv`).

```ts
it("1개를 차감하고 해당 칸을 12시간으로 교체한다", async () => {
  mocks.store.set("character.v2", {
    gold: 5,
    materials: { v2_prep_whetstone_3: 2 },
    activeBattlePreps: { weapon: { itemId: "v2_prep_whetstone_master", expiresAt: NOW + 20 * 3_600_000 }, armor: { itemId: "v2_prep_brace_1", expiresAt: NOW + 1_000 } },
  });
  const response = await POST(request("v2_prep_whetstone_3"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, itemId: "v2_prep_whetstone_3", slot: "weapon", expiresAt: NOW + 12 * 3_600_000, owned: 1 });
  expect(mocks.store.get("character.v2")).toEqual({
    gold: 5,
    materials: { v2_prep_whetstone_3: 1 },
    activeBattlePreps: { weapon: { itemId: "v2_prep_whetstone_3", expiresAt: NOW + 12 * 3_600_000 }, armor: { itemId: "v2_prep_brace_1", expiresAt: NOW + 1_000 } },
  });
});
it("명장 등급은 24시간이다", async () => { /* v2_prep_brace_master 1개 → armor.expiresAt === NOW + 24 * 3_600_000 */ });
it("미보유는 409, 모르는 품목은 400이고 세이브를 바꾸지 않는다", async () => { /* 저장 전후 character.v2 toEqual */ });
it("저장할 때 만료된 다른 칸은 정리된다", async () => { /* armor 만료 상태에서 숫돌 사용 → 저장된 activeBattlePreps에 armor 없음 */ });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/api/v2/me/use-battle-prep/route.test.ts` → FAIL.
- [ ] **Step 3: 구현.** `itemId`가 카탈로그에 없으면 트랜잭션 전에 400. 트랜잭션에서 `character.v2`를 잠그고 `applyBattlePrepUse`를 호출해 `materials`와 `activeBattlePreps`만 바꿔 저장한다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋** — `feat: 전투 준비물 사용 API 추가`

---

### Task 4: 제작 API

**Files:**
- Create: `src/app/api/v2/life-workshop/battle-prep/route.ts`
- Create: `src/app/api/v2/life-workshop/battle-prep/route.test.ts`

**Interfaces:**
- Consumes: `craftBattlePrep`, `battlePrepCraftRows`, `BattlePrepCraftContext` (Task 1); `readLifeLevels(tx, userId)`(`@/lib/server/lifeMajor`); `parseLifeMajorState`, `lifeMajorCanCraft`, `LIFE_MAJOR_SAVE_KEY`(`@/adventure/v2/lifeMajor`)
- Produces:
  - `GET /api/v2/life-workshop/battle-prep` → `{ ok: true, rows: BattlePrepCraftRow[] }`
  - `POST` 요청 `{ itemId, quantity }` → 200 `{ ok: true, itemId, crafted, rows }`, 400(`bad_item`, `invalid_quantity`), 409(`level_required`, `major_required`, `not_enough_materials`)

`masterCraft`는 `{ mining: lifeMajorCanCraft(state, "mining"), woodcutting: lifeMajorCanCraft(state, "woodcutting") }`. 요청 제한은 단련 촉매 제작과 같은 값(`userLimit: 30, ipLimit: 200, windowMs: 60_000`), action은 `"v2:life-workshop:battle-prep"`. GET은 잠금 없이 `readSave`로 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/lib/server/lifeMajorRoute.test.ts`의 mock 구성과 `seedLevels`, `lifeMajorStageXp`를 그대로 쓴다.

```ts
it("채광 Lv.35 이상이 상급 숫돌을 만든다", async () => {
  seedLevels({ mining: 40 });
  mocks.store.set("character.v2", { gold: 7, materials: { v2_arcane_alloy: 40, v2_precious_ingot: 20, v2_basic_ingot: 21, v2_rough_gem: 10 } });
  const response = await craft("v2_prep_whetstone_3", 2);
  expect(response.status).toBe(200);
  expect(mocks.store.get("character.v2")).toEqual({ gold: 7, materials: { v2_basic_ingot: 1, v2_prep_whetstone_3: 2 } });
  const json = await response.json();
  expect(json).toMatchObject({ ok: true, itemId: "v2_prep_whetstone_3", crafted: 2 });
  expect(json.rows.find((row: { id: string }) => row.id === "v2_prep_whetstone_3")).toMatchObject({ owned: 2, maxCraftable: 0 });
});
it("레벨 미달은 level_required", async () => { /* mining 34, 상급 숫돌 → 409 */ });
it("명장 등급은 주전공 3단계 이상만, 부전공 9단계는 거절", async () => {
  /* major: mining 2단계 → major_required; major: farming, minor: mining 9단계 → major_required;
     major: mining 3단계 + 재료(상급 재료 + v2_master_alloy 1) → 200, v2_master_alloy 키 삭제 */
});
it("벌목 주전공은 명장의 보강재를 만들고 명장의 숫돌은 못 만든다", async () => { /* major: woodcutting 3단계 */ });
it("재료 부족·수량 오류는 세이브를 바꾸지 않는다", async () => { /* not_enough_materials 409, quantity 0·21 → 400 */ });
it("GET은 현재 레벨과 보유량으로 8행을 돌려준다", async () => { /* rows.length 8, blocked 값 확인 */ });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/api/v2/life-workshop/battle-prep/route.test.ts` → FAIL.
- [ ] **Step 3: 구현.** POST는 한 트랜잭션에서 `character.v2` 잠금 → 레벨·전공 읽기 → `craftBattlePrep` → `materials`만 바꿔 저장 → 갱신된 `rows` 응답. 오류 코드의 HTTP 상태는 위 표대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋** — `feat: 전투 준비물 제작 API 추가`

---

### Task 5: 상태 응답과 캐릭터 화면 표시

**Files:**
- Modify: `src/app/api/v2/me/state/route.ts` (`activeFoodBuff` 응답 줄 아래, 캐릭터 세이브 타입에 필드 추가. 파일 예산 762줄 안)
- Create: `src/adventure/v2/BattlePrepBadges.tsx`, `src/adventure/v2/BattlePrepBadges.test.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx` (상태 타입과 두 곳의 prop 전달)
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`, `src/adventure/v2/CompactCharacterEffectCard.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.tsx`
- Test: `src/adventure/v2/CompactCharacterSummary.test.tsx` (상태 라우트 `route.ts`에는 직접 테스트 파일이 없다. 응답 값은 Task 1의 `activeBattlePreps` 파서 테스트와 타입 검사로 확인한다)

**Interfaces:**
- Consumes: `activeBattlePreps`, `ActiveBattlePreps`, `BATTLE_PREP_ITEM_BY_ID`, `BATTLE_PREP_SLOTS`, `BATTLE_PREP_SLOT_NAME`, `battlePrepEffectText` (Task 1)
- Produces:
  - 상태 응답 필드 `activeBattlePreps: ActiveBattlePreps` (`activeBattlePreps(charSave.activeBattlePreps, now)`)
  - `export function battlePrepBadgeRows(active: ActiveBattlePreps | null | undefined, now: number): Array<{ slot: BattlePrepSlot; slotName: string; itemName: string; effectText: string; expiresAt: number }>` — 만료·미사용 칸은 빠지고 `BATTLE_PREP_SLOTS` 순서를 지킨다.
  - `CompactCharacterSummary`와 `V2CharacterCard`의 새 prop `activeBattlePreps?: ActiveBattlePreps | null`
  - `CompactCharacterEffectDetail`의 새 갈래 `{ kind: "battlePrep"; slotName: string; itemName: string; effectText: string; expiresAt: number }`

표시 규칙: 요약 화면은 음식 버튼과 같은 `Inset as="button"` 모양으로 칸마다 하나씩, 라벨은 품목 이름, `aria-label`은 `` `${itemName} ${slotName} 효과 보기` ``. 누르면 효과 카드에 칸 이름, 품목 이름, 효과 문구, 남은 시간을 보여 준다(남은 시간 문구는 음식과 같은 포맷 함수를 쓴다). 캐릭터 카드는 `ActiveFoodBuffBadge`와 같은 줄 모양으로 `품목 이름 · 효과 문구`와 남은 시간을 보여 준다. 아이콘은 이미 쓰는 아이콘 묶음에서 무기 손질은 칼·검 계열, 방어구 손질은 방패 계열을 고른다. 새 색은 넣지 않고 음식 배지의 클래스를 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// BattlePrepBadges.test.tsx
it("켜 둔 칸만 칸 순서대로 돌려준다", () => {
  const now = 1_000;
  expect(battlePrepBadgeRows({ armor: { itemId: "v2_prep_brace_3", expiresAt: now + 5 }, weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now } }, now))
    .toEqual([{ slot: "armor", slotName: "방어구 손질", itemName: "상급 보강재", effectText: "방어력·마법방어력 +65 · 최대 HP +1,000", expiresAt: now + 5 }]);
  expect(battlePrepBadgeRows(null, now)).toEqual([]);
});
// CompactCharacterSummary.test.tsx
it("켜 둔 준비물을 음식 옆에 보여 주고 누르면 효과를 보여 준다", async () => {
  /* activeBattlePreps={{ weapon: { itemId: "v2_prep_whetstone_3", expiresAt: Date.now() + 3_600_000 } }} 렌더
     → getByRole("button", { name: "상급 숫돌 무기 손질 효과 보기" }) 클릭 → "공격력·마법공격력 +130" 표시
     → 방어구 손질 버튼은 없음 */
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/BattlePrepBadges.test.tsx src/adventure/v2/CompactCharacterSummary.test.tsx` → FAIL.
- [ ] **Step 3: 구현.** 배지 컴포넌트와 `battlePrepBadgeRows`는 `BattlePrepBadges.tsx`에 두고 두 화면이 가져다 쓴다.
- [ ] **Step 4: 통과 확인** — 위 두 파일과 `src/adventure/v2/V2CharacterCard.test.tsx`, `src/app/api/v2/me/state/stateView.test.ts`, `src/components/ui/designSystemBudget.test.ts` PASS. `npm run check-module-budgets` PASS.
- [ ] **Step 5: 커밋** — `feat: 켜 둔 전투 준비물을 캐릭터 요약과 카드에 표시`

---

### Task 6: 인벤토리 소모품 탭에서 사용

**Files:**
- Create: `src/adventure/v2/inventory/BattlePrepSection.tsx`, `src/adventure/v2/inventory/BattlePrepSection.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx` (prop `onUseBattlePrep: (itemId: string) => void` 추가, SP 열매 묶음 아래에 섹션 배치, 빈 상태 판정에 준비물 보유 포함)
- Modify: `src/adventure/v2/V2InventoryView.tsx` (`useBattlePrep` 콜백, prop 전달)
- Test: `src/adventure/v2/inventory/RareMapsTab.test.tsx`

**Interfaces:**
- Consumes: `BATTLE_PREP_ITEMS`, `BATTLE_PREP_SLOT_NAME`, `battlePrepEffectText` (Task 1); `POST /api/v2/me/use-battle-prep` (Task 3)
- Produces: `export function BattlePrepSection(props: { materials: Record<string, number>; search: string; busy: string | null; onUse: (itemId: string) => void }): JSX.Element | null` — 보유한 품목만 행으로 보여 주고, 하나도 없으면 `null`.

행 구성은 SP 열매 행과 같은 구조(이름, 보유 수량, 설명 한 줄, `사용` 버튼)다. 설명 줄은 `` `${칸 이름} · ${효과 문구} · ${N}시간` ``. 진행 중 표시는 `busy === \`battle_prep_${itemId}\``. 검색어는 품목 이름에 대한 부분 일치로 거른다.

`useBattlePrep` 콜백은 `useSpFruit`와 같은 흐름이다. 성공 알림은 `` `✓ ${item.name} 적용 · ${N}시간` ``, 오류 문구는 `not_owned` → `"보유한 준비물이 없습니다"`, 그 밖은 기존 관례대로 오류 코드나 HTTP 상태. 성공 후 `refresh()`와 `refreshGameState()`를 부른다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it("보유한 준비물만 보여 주고 사용을 전달한다", async () => {
  const onUse = vi.fn();
  render(<BattlePrepSection materials={{ v2_prep_whetstone_3: 2, v2_prep_brace_1: 0 }} search="" busy={null} onUse={onUse} />);
  expect(screen.getByText("상급 숫돌")).toBeTruthy();
  expect(screen.getByText("무기 손질 · 공격력·마법공격력 +130 · 12시간")).toBeTruthy();
  expect(screen.queryByText("초급 보강재")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "상급 숫돌 사용" }));
  expect(onUse).toHaveBeenCalledWith("v2_prep_whetstone_3");
});
it("하나도 없으면 아무것도 그리지 않고, 검색어로 거른다", () => { /* container.firstChild null / search="보강" */ });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/inventory/BattlePrepSection.test.tsx` → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `npx vitest run src/adventure/v2/inventory src/adventure/v2/V2InventoryView.test.tsx` PASS.
- [ ] **Step 5: 커밋** — `feat: 인벤토리 소모품 탭에서 전투 준비물 사용`

---

### Task 7: 생활 공방 제작 패널

**Files:**
- Create: `src/adventure/v2/BattlePrepCraftPanel.tsx`, `src/adventure/v2/BattlePrepCraftPanel.test.tsx`
- Create: `src/adventure/v2/LifeWorkshopQuantityControls.tsx` (`LifeWorkshopView.tsx`의 `LifeWorkshopMaxConfirmDialog`와 `LifeWorkshopQuantityControls`를 그대로 옮긴다. 패널이 `LifeWorkshopView.tsx`를 import하면 순환 참조가 되기 때문이다. `LifeWorkshopView.tsx`는 두 이름을 re-export해 기존 import 경로를 유지한다)
- Modify: `src/adventure/v2/LifeWorkshopView.tsx` (제작 탭의 생활 보조품 카드 위에 `<BattlePrepCraftPanel busy={busy !== null} onNotice={setNotice} />` 한 줄과 import)

**Interfaces:**
- Consumes: `GET`/`POST /api/v2/life-workshop/battle-prep` (Task 4), `BattlePrepCraftRow`, `BATTLE_PREP_SLOT_NAME`, `BATTLE_PREP_CRAFT_MAX_QUANTITY` (Task 1), `LifeWorkshopQuantityControls`(`./LifeWorkshopQuantityControls`), `V2_MATERIALS`(재료 이름)
- Produces: `export function BattlePrepCraftPanel(props: { busy: boolean; onNotice: (text: string) => void }): JSX.Element`

패널은 자기 데이터를 직접 불러온다(공방 API와 페이로드는 건드리지 않는다). 구성:

- `Card` 하나, 제목 `전투 준비물`, 설명 한 줄: `"인벤토리 소모품 탭에서 사용합니다. 무기 손질과 방어구 손질은 음식과 함께 적용됩니다."`
- 칸별 소제목(무기 손질, 방어구 손질) 아래에 품목 행 4개씩. 행은 `SURFACE_INSET`.
- 행 내용: 이름, `보유 N`, `효과 문구 · N시간`, 재료 줄(`재료 이름 보유/필요`를 `·`로 이음, 모자란 재료만 기존 부족 색으로), 수량 입력(`LifeWorkshopQuantityControls`, `maxQuantity = Math.min(row.maxCraftable, BATTLE_PREP_CRAFT_MAX_QUANTITY)`), 막힌 이유.
- 막힌 이유 문구: `blocked === "level"` → `` `${활동 이름} Lv.${requiredLevel}부터 제작할 수 있습니다.` ``(활동 이름은 채광/벌목), `blocked === "major"` → `` `${활동 이름} 주전공 명장 ${LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 제작할 수 있습니다.` ``, 재료만 모자라면 `"재료가 부족합니다."`
- 제작 성공 시 `onNotice(\`${row.name} ${crafted}개를 완성했습니다.\`)`, 실패 시 오류 코드별 문구(`level_required`, `major_required`는 위 문구, `not_enough_materials` → `"재료가 부족합니다."`, 그 밖 → `"제작하지 못했습니다. 잠시 후 다시 시도해 주세요."`).
- 불러오기 실패는 `LoadErrorBanner`, 불러오는 중은 `Skeleton`.
- 글씨는 `text-sm`/`text-xs`만 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — `fetch`를 mock해 GET 응답으로 `battlePrepCraftRows(...)` 결과를 준다.

```ts
it("칸별로 8행을 보여 주고 막힌 이유를 알려 준다", async () => {
  /* levels { mining: 25, woodcutting: 100 }, masterCraft 둘 다 false, materials { v2_processed_softwood: 95 }
     → "무기 손질", "방어구 손질" 제목, "상급 숫돌" 행에 "채광 Lv.35부터 제작할 수 있습니다."
     → "명장의 보강재" 행에 "벌목 주전공 명장 3단계부터 제작할 수 있습니다."
     → "초급 보강재" 행에 "다듬은 목재 95/40" */
});
it("제작하면 POST를 보내고 응답 행으로 갱신하며 알림을 올린다", async () => {
  /* 초급 보강재 수량 2 제작 → fetch("/api/v2/life-workshop/battle-prep", { method: "POST", body: {"itemId":"v2_prep_brace_1","quantity":2} })
     → onNotice("초급 보강재 2개를 완성했습니다.") → 보유 2 표시 */
});
it("서버 오류 코드를 문구로 바꾼다", async () => { /* 409 not_enough_materials → onNotice("재료가 부족합니다.") */ });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/BattlePrepCraftPanel.test.tsx` → FAIL.
- [ ] **Step 3: 수량 컨트롤을 새 파일로 옮긴 뒤 패널을 구현하고 `LifeWorkshopView.tsx`에 배치.** 옮기기만 하고 동작은 바꾸지 않는다.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/adventure/v2/BattlePrepCraftPanel.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/components/ui/designSystemBudget.test.ts src/components/ui/darkSurfaceAudit.test.ts` PASS.
- [ ] **Step 5: 커밋** — `feat: 생활 공방 제작 탭에 전투 준비물 패널 추가`

---

### Task 8: 안내서

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: `BATTLE_PREP_ITEMS`, `BATTLE_PREP_SLOT_NAME`, `battlePrepEffectText` (Task 1), `V2_MATERIALS`, `LIFE_MAJOR_CRAFT_MIN_STAGE`

추가·수정 내용(수치는 모두 상수에서 만든다):

- 개인 요리 항목의 음식 효과 문단 끝에 한 문장: `"음식 효과는 무기 손질·방어구 손질과 함께 적용됩니다."`
- 벌목과 채광 항목 앞에 `<H2>전투 준비물</H2>`: 설명 두 문장(`"생활 공방의 제작 탭에서 벌목·채광 가공재로 숫돌과 보강재를 만듭니다. 인벤토리의 소모품 탭에서 사용하며, 무기 손질과 방어구 손질에 하나씩 음식과 함께 적용됩니다."` / `"같은 칸에 다시 쓰면 새로 쓴 것으로 바뀌고 시간은 합쳐지지 않습니다. 효과는 사냥 전용이며 아레나·챔피언십·거점전·훈련 대련·스탯 합계 랭킹에는 반영되지 않습니다."`)과 표(품목, 칸, 효과, 지속, 재료, 제작 조건) 8행. 표 설명에 `"준비물은 거래소에서 거래할 수 있습니다."`
- 생활 전공 항목의 단련 촉매 줄 아래에 한 줄: 명장의 숫돌은 채광 주전공, 명장의 보강재는 벌목 주전공 명장 `LIFE_MAJOR_CRAFT_MIN_STAGE`단계부터 만들며 지속 시간이 24시간이라는 내용.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it("전투 준비물의 칸·효과·재료·제작 조건을 안내한다", () => {
  const html = renderToStaticMarkup(<PastimesContent />);
  expect(html).toContain("전투 준비물");
  for (const item of BATTLE_PREP_ITEMS) expect(html).toContain(item.name);
  expect(html).toContain("공격력·마법공격력 +130");
  expect(html).toContain("방어력·마법방어력 +90 · 최대 HP +1,400");
  expect(html).toContain("음식 효과는 무기 손질·방어구 손질과 함께 적용됩니다.");
  expect(html).not.toMatch(/v2_prep_/);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/manual/current-content.test.tsx -t "전투 준비물"` → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `npx vitest run src/app/manual` PASS.
- [ ] **Step 5: 커밋** — `docs: 안내서에 전투 준비물 추가`

---

### Task 9: 전체 검증과 마무리

**Files:**
- Create: `docs/content-modification-records/2026-11-13-life-battle-prep.md` (기존 기록 파일 형식을 따른다: 무엇을 추가했는지, 수치, 관련 스펙·계획 경로, 아이콘 사양)

- [ ] **Step 1: 타입 검사** — `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` → 오류 0.
- [ ] **Step 2: 린트** — `npx eslint` 를 이번에 만들거나 고친 파일 경로에만 실행 → 오류 0.
- [ ] **Step 3: 예산·디자인 검사** — `npm run check-module-budgets` PASS, `bash .claude/skills/anti-slop-ui/scan.sh origin/main` 결과를 하나씩 확인(새로 생긴 후보가 없거나 근거가 있어야 한다), `npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/components/ui/surfaces.test.ts src/components/ui/designSystemBudget.test.ts` PASS.
- [ ] **Step 4: 관련 테스트 일괄 실행** — Task 1~8에서 지정한 테스트 파일과 `src/lib/server/huntRoute.test.ts`, `src/lib/server/lifeMajorRoute.test.ts`, `src/lib/server/lifeWorkshopRoute.test.ts`, 거래소 재료 등록 테스트(`src/lib/server/marketplace*.test.ts` 중 재료 카탈로그를 전수 검사하는 파일)를 실행 → PASS.
- [ ] **Step 5: 화면 확인** — `/dev/*` 미리보기 경로로 생활 공방 제작 탭, 인벤토리 소모품 탭, 캐릭터 요약을 라이트·다크, 360px·PC 폭에서 확인한다. 배경 그림이 패널 사이로 비치지 않고 긴 재료 줄이 넘치지 않아야 한다. 미리보기 경로가 이 화면들을 다루지 않으면 그 사실을 기록에 적고 테스트 결과로 대신한다.
- [ ] **Step 6: 수정 기록 작성과 커밋** — 아이콘 사양(8종, `public/images/items/battle-prep/<id>.webp`, 기존 `items/life-aids`와 같은 규격)을 기록에 적는다. 커밋: `docs: 전투 준비물 수정 기록`
