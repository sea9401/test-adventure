# Guild Facility Support Supplies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the guild trade shop's legacy settlement-wallet grant with an immediate 200-unit log/iron donation to a selected guild facility upgrade.

**Architecture:** Put the allocation rule in a pure domain helper shared by the API preview and purchase path. Extend the guild trade API with facility target previews, then atomically revalidate and write the selected facility's existing donation progress during purchase. Keep the large trade panel focused by rendering selection and before/after values in a dedicated dialog.

**Tech Stack:** TypeScript, Next.js route handlers, React, Drizzle ORM, Vitest, `react-dom/server`

## Global Constraints

- Preserve internal shop item ID `settlement_supplies`, token cost 120, weekly limit 3, and minimum trade-post level 1.
- Rename it to `길드 시설 지원 물자`; describe an immediate facility donation, never an inventory item or stored guild currency.
- Grant exactly 200 total units using only `crop` (통나무) and `ore` (철광석).
- Start with at most 100 units per resource and move any unused share to the other resource.
- Never exceed the selected facility's remaining crop or ore requirement.
- A facility is eligible only when open, below maximum level, requiring crop or ore, and missing at least 200 combined crop/ore.
- Do not create a personal item, new guild wallet, contribution points, or retroactive replacement grants.
- Keep pre-change purchases in the same weekly limit and leave previously granted legacy settlement resources unchanged.
- Purchase validation and writes must be atomic; stale targets consume neither tokens nor weekly stock.
- Do not deploy as part of this plan.

---

## File Structure

- Create `src/adventure/data/v2/guildFacilitySupport.ts`: pure allocation and progress-application rules.
- Create `src/adventure/data/v2/guildFacilitySupport.test.ts`: allocation edge cases.
- Modify `src/adventure/data/v2/guildTrade.ts`: item copy/output and target-preview DTO.
- Modify `src/adventure/data/v2/guildTrade.test.ts`: compatible ID, price, limits, copy, and output contract.
- Modify `src/app/api/v2/guild/trade-post/route.ts`: preview targets and atomic purchase application.
- Modify `src/app/api/v2/guild/trade-post/route.test.ts`: preview, purchase, stale-state, and no-side-effect coverage.
- Create `src/adventure/v2/guild/GuildFacilitySupportDialog.tsx`: accessible target selection and preview UI.
- Create `src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx`: server-rendered dialog coverage.
- Modify `src/adventure/v2/guild/GuildTradePostPanel.tsx`: dialog integration and exact notices.
- Modify `src/app/manual/content/guild.tsx`: explain immediate facility support.

---

### Task 1: Pure support allocation and shop contract

**Files:**
- Create: `src/adventure/data/v2/guildFacilitySupport.ts`
- Create: `src/adventure/data/v2/guildFacilitySupport.test.ts`
- Modify: `src/adventure/data/v2/guildTrade.ts:261-405`
- Modify: `src/adventure/data/v2/guildTrade.test.ts:55-105`

**Interfaces:**
- Consumes: `SettlementBuildingUpgradeCost` and `SettlementResources` from `@/adventure/data/v2/settlement`.
- Produces: `GUILD_FACILITY_SUPPORT_TOTAL`, `GuildFacilitySupportAllocation`, `guildFacilitySupportAllocation(cost, donated)`, and `applyGuildFacilitySupport(donated, allocation)`.
- Produces: serialized `GuildFacilitySupportTarget` rows for the API and dialog.

- [ ] **Step 1: Write failing allocation tests**

Create `src/adventure/data/v2/guildFacilitySupport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyGuildFacilitySupport,
  guildFacilitySupportAllocation,
} from "./guildFacilitySupport";

describe("guildFacilitySupport", () => {
  it("통나무와 철광석이 충분히 부족하면 100개씩 지원한다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 100, ore: 50 },
      ),
    ).toEqual({ crop: 100, ore: 100, total: 200 });
  });

  it("한쪽의 남는 몫을 다른 재료에 넘긴다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 460, ore: 100 },
      ),
    ).toEqual({ crop: 40, ore: 160, total: 200 });
  });

  it("한 재료만 필요하면 200개를 모두 지원한다", () => {
    expect(
      guildFacilitySupportAllocation({ ore: 500 }, { ore: 250 }),
    ).toEqual({ crop: 0, ore: 200, total: 200 });
  });

  it("합산 부족량이 200개보다 적으면 지원할 수 없다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 420, ore: 400 },
      ),
    ).toBeNull();
  });

  it("고급 목재와 광석은 지원 계산에 포함하지 않는다", () => {
    expect(
      guildFacilitySupportAllocation(
        { v2_birch_log: 600, v2_copper_ore: 600 },
        {},
      ),
    ).toBeNull();
  });

  it("계산한 지원량만 기존 공동 기부 진행도에 더한다", () => {
    expect(
      applyGuildFacilitySupport(
        { crop: 460, ore: 100, v2_birch_log: 25 },
        { crop: 40, ore: 160, total: 200 },
      ),
    ).toEqual({ crop: 500, ore: 260, v2_birch_log: 25 });
  });
});
```

- [ ] **Step 2: Run the allocation test and verify RED**

Run:

```bash
npm test -- src/adventure/data/v2/guildFacilitySupport.test.ts
```

Expected: FAIL because `guildFacilitySupport.ts` does not exist.

- [ ] **Step 3: Implement the pure allocation helper**

Create `src/adventure/data/v2/guildFacilitySupport.ts`:

```ts
import type {
  SettlementBuildingUpgradeCost,
  SettlementResources,
} from "./settlement";

export const GUILD_FACILITY_SUPPORT_TOTAL = 200;

export type GuildFacilitySupportAllocation = {
  crop: number;
  ore: number;
  total: 200;
};

export function guildFacilitySupportAllocation(
  cost: SettlementBuildingUpgradeCost,
  donated: SettlementResources,
): GuildFacilitySupportAllocation | null {
  const cropRemaining = Math.max(
    0,
    Math.floor(cost.crop ?? 0) - Math.floor(donated.crop ?? 0),
  );
  const oreRemaining = Math.max(
    0,
    Math.floor(cost.ore ?? 0) - Math.floor(donated.ore ?? 0),
  );
  if (cropRemaining + oreRemaining < GUILD_FACILITY_SUPPORT_TOTAL) return null;

  let crop = Math.min(100, cropRemaining);
  let ore = Math.min(100, oreRemaining);
  let unassigned = GUILD_FACILITY_SUPPORT_TOTAL - crop - ore;
  const cropExtra = Math.min(unassigned, cropRemaining - crop);
  crop += cropExtra;
  unassigned -= cropExtra;
  const oreExtra = Math.min(unassigned, oreRemaining - ore);
  ore += oreExtra;
  unassigned -= oreExtra;
  if (unassigned !== 0) return null;
  return { crop, ore, total: GUILD_FACILITY_SUPPORT_TOTAL };
}

export function applyGuildFacilitySupport(
  donated: SettlementResources,
  allocation: GuildFacilitySupportAllocation,
): SettlementResources {
  return {
    ...donated,
    crop: Math.max(0, Math.floor(donated.crop ?? 0)) + allocation.crop,
    ore: Math.max(0, Math.floor(donated.ore ?? 0)) + allocation.ore,
  };
}
```

- [ ] **Step 4: Run the allocation test and verify GREEN**

Run:

```bash
npm test -- src/adventure/data/v2/guildFacilitySupport.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write failing shop-contract assertions**

Extend the shop data test in `guildTrade.test.ts`:

```ts
const support = GUILD_TRADE_SHOP_ITEMS.find(
  (item) => item.id === "settlement_supplies",
);
expect(support).toMatchObject({
  id: "settlement_supplies",
  name: "길드 시설 지원 물자",
  tokenCost: 120,
  weeklyLimit: 3,
  minFacilityLevel: 1,
  target: "guild",
  output: { kind: "guild_facility_support", count: 200 },
});
expect(support?.description).toContain("통나무·철광석");
expect(support?.description).toContain("총 200개");
```

Add this DTO beside the shop types in `guildTrade.ts`:

```ts
export type GuildFacilitySupportTarget = {
  buildingId: SettlementBuildingId;
  buildingName: string;
  currentLevel: number;
  targetLevel: number | null;
  eligible: boolean;
  reason: "max_level" | "materials_not_required" | "remaining_below_200" | null;
  crop: { current: number; required: number; grant: number; after: number };
  ore: { current: number; required: number; grant: number; after: number };
};
```

- [ ] **Step 6: Run the shop data test and verify RED**

Run:

```bash
npm test -- src/adventure/data/v2/guildTrade.test.ts
```

Expected: FAIL on the old name and `guild_settlement` output.

- [ ] **Step 7: Update the shop item without changing identity or limits**

In `guildTrade.ts`:

- Import `SettlementBuildingId` as a type.
- Replace the `guild_settlement` output variant with `{ kind: "guild_facility_support"; count: 200 }`.
- Keep ID `settlement_supplies`, cost 120, limit 3, minimum level 1, target `guild`, and House icon.
- Set name `길드 시설 지원 물자`.
- Set description `선택한 길드 시설의 통나무·철광석 기부 진행도에 총 200개를 즉시 지원합니다.`.
- Export `GuildFacilitySupportTarget` with the fields from Step 5.

- [ ] **Step 8: Run the domain suite**

Run:

```bash
npm test -- src/adventure/data/v2/guildFacilitySupport.test.ts src/adventure/data/v2/guildTrade.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/adventure/data/v2/guildFacilitySupport.ts src/adventure/data/v2/guildFacilitySupport.test.ts src/adventure/data/v2/guildTrade.ts src/adventure/data/v2/guildTrade.test.ts
git commit -m "feat: define guild facility support supplies"
```

---

### Task 2: Facility previews and atomic purchase application

**Files:**
- Modify: `src/app/api/v2/guild/trade-post/route.ts:1-650`
- Modify: `src/app/api/v2/guild/trade-post/route.test.ts:1-390`

**Interfaces:**
- Consumes: Task 1 allocation helpers.
- Consumes: donation-progress read/lock/set functions from `@/lib/server/guildFacilityUpgradeDonations`.
- Consumes: `lockGuildSettlementBuilding()` from `@/lib/server/v2Settlement`.
- Produces: `facilitySupportTargets: GuildFacilitySupportTarget[]` in successful trade views.
- Consumes: `facilityId` in `buy` requests for `settlement_supplies`.
- Produces: `purchased.facilitySupport` with facility identity, target level, and exact grants.

- [ ] **Step 1: Replace legacy route mocks and write failing preview coverage**

Use these mocks in `route.test.ts`:

```ts
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: vi.fn(),
}));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", () => ({
  readGuildFacilityDonationProgress: vi.fn(async () => ({
    guild_smithy: { targetLevel: 2, materials: { crop: 20, ore: 30 } },
  })),
  lockGuildFacilityDonationProgress: vi.fn(async () => ({ crop: 20, ore: 30 })),
  setGuildFacilityDonationProgress: vi.fn(async () => undefined),
}));
```

Make `buildingLevelFromSlots` return level 3 for `trade_post`, level 1 for `guild_smithy`, and 0 otherwise. Make `lockGuildSettlementBuilding` return a village slot containing a Lv.1 smithy.

Add:

```ts
it("지원 가능한 시설과 구매 후 진행도를 미리 보여준다", async () => {
  const response = await GET();
  const json = await response.json();
  expect(response.status).toBe(200);
  expect(json.facilitySupportTargets).toContainEqual(
    expect.objectContaining({
      buildingId: "guild_smithy",
      buildingName: "길드 제작소",
      currentLevel: 1,
      targetLevel: 2,
      eligible: true,
      reason: null,
      crop: { current: 20, required: 500, grant: 100, after: 120 },
      ore: { current: 30, required: 500, grant: 100, after: 130 },
    }),
  );
});
```

- [ ] **Step 2: Write failing purchase and stale-state tests**

Replace the old settlement-pool test with:

```ts
it("시설 지원 물자를 선택한 시설 공동 기부 진행도에 적용한다", async () => {
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));
  const response = await POST(
    request({
      action: "buy",
      shopItemId: "settlement_supplies",
      facilityId: "guild_smithy",
    }),
  );
  const json = await response.json();
  expect(response.status).toBe(200);
  expect(setGuildFacilityDonationProgress).toHaveBeenCalledWith(
    expect.anything(),
    7,
    "guild_smithy",
    2,
    { crop: 120, ore: 130 },
  );
  expect(json.purchased.facilitySupport).toEqual({
    buildingId: "guild_smithy",
    buildingName: "길드 제작소",
    targetLevel: 2,
    crop: 100,
    ore: 100,
  });
  expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      tokens: 380,
      purchases: { settlement_supplies: 1 },
    }),
  );
  expect(upsertSave).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    "character.v2",
    expect.anything(),
  );
});

it("확인 뒤 남은 기초 재료가 200개 미만이면 구매를 롤백한다", async () => {
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));
  vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
    crop: 450,
    ore: 400,
  });
  const response = await POST(
    request({
      action: "buy",
      shopItemId: "settlement_supplies",
      facilityId: "guild_smithy",
    }),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("facility_support_unavailable");
  expect(setGuildFacilityDonationProgress).not.toHaveBeenCalled();
  expect(saveGuildTradeWeekly).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ purchases: { settlement_supplies: 1 } }),
  );
});

it("시설 지원 물자 구매에는 유효한 시설 ID가 필요하다", async () => {
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));
  const response = await POST(
    request({ action: "buy", shopItemId: "settlement_supplies" }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("invalid_facility_support_target");
});
```

Remove legacy `lockGuildSettlement`, `upsertGuildSettlement`, and assertions. Retain regression assertions for member grants, guild gold, and guild fame.

- [ ] **Step 3: Run the route test and verify RED**

Run:

```bash
npm test -- src/app/api/v2/guild/trade-post/route.test.ts
```

Expected: FAIL because preview targets and facility donation writes do not exist.

- [ ] **Step 4: Build facility target previews from current state**

In `route.ts`:

- Add `facilityId?: unknown` to `TradeBody`.
- Import `PLACEABLE_SETTLEMENT_BUILDING_IDS`, `SETTLEMENT_BUILDINGS`, `isSettlementBuildingId`, `nextSettlementBuildingUpgrade`, `settlementBuildingLevelOf`, and related types.
- Import Task 1 helpers, donation-progress helpers, and `lockGuildSettlementBuilding`.
- Remove legacy settlement-wallet imports.
- Add `guildId` to `tradeView()` arguments.
- Build `facilitySupportTargets` from current village building rows and `readGuildFacilityDonationProgress(tx, guildId)`.
- Include every open facility and provide `max_level`, `materials_not_required`, or `remaining_below_200` for ineligible entries.
- Use the pure helper for `grant` and `after`; do not duplicate allocation arithmetic.

Use this converter signature:

```ts
function guildFacilitySupportTarget(args: {
  buildingId: SettlementBuildingId;
  currentLevel: number;
  donated: SettlementResources;
}): GuildFacilitySupportTarget
```

- [ ] **Step 5: Implement atomic selected-facility application**

For `guild_facility_support` purchases:

1. Validate `facilityId` against `PLACEABLE_SETTLEMENT_BUILDING_IDS`.
2. Lock the actual facility with `lockGuildSettlementBuilding`.
3. Resolve its latest level and next upgrade.
4. Lock donation progress for the exact target level.
5. Recompute the allocation from latest progress.
6. Return `facility_support_unavailable` when no full allocation is possible.
7. Apply progress through `setGuildFacilityDonationProgress` in the purchase transaction.
8. Return facility identity, target level, crop grant, and ore grant.

Refactor the grant result to make validation explicit:

```ts
type GuildShopGrantResult =
  | {
      ok: true;
      apply: () => Promise<void>;
      recipientCount?: number;
      facilitySupport?: {
        buildingId: SettlementBuildingId;
        buildingName: string;
        targetLevel: number;
        crop: number;
        ore: number;
      };
    }
  | {
      ok: false;
      status: 400 | 409;
      error:
        | "invalid_facility_support_target"
        | "facility_support_unavailable"
        | "no_recipients";
    };
```

Only after `ok: true` may the route decrement tokens and increment `weekly.purchases`. Include `facilitySupport` in `purchased` and the activity metadata. Do not call a contribution-point helper.

- [ ] **Step 6: Run route and adjacent facility tests**

Run:

```bash
npm test -- src/app/api/v2/guild/trade-post/route.test.ts src/app/api/v2/guild/facilities/[buildingId]/donate/route.test.ts src/app/api/v2/guild/facilities/[buildingId]/upgrade/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/api/v2/guild/trade-post/route.ts src/app/api/v2/guild/trade-post/route.test.ts
git commit -m "feat: apply trade supplies to guild facilities"
```

---

### Task 3: Facility selection and before/after dialog

**Files:**
- Create: `src/adventure/v2/guild/GuildFacilitySupportDialog.tsx`
- Create: `src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx`
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx:1-520`

**Interfaces:**
- Consumes: `GuildFacilitySupportTarget[]`, token cost, pending state, close callback, and confirm callback.
- Produces: `onConfirm(buildingId: SettlementBuildingId)` only for eligible targets.
- Consumes API `facilitySupportTargets` and `purchased.facilitySupport`.

- [ ] **Step 1: Write failing dialog rendering tests**

Create `GuildFacilitySupportDialog.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuildFacilitySupportDialog } from "./GuildFacilitySupportDialog";

const eligible = {
  buildingId: "guild_smithy" as const,
  buildingName: "길드 제작소",
  currentLevel: 1,
  targetLevel: 2,
  eligible: true,
  reason: null,
  crop: { current: 20, required: 500, grant: 100, after: 120 },
  ore: { current: 30, required: 500, grant: 100, after: 130 },
};

describe("GuildFacilitySupportDialog", () => {
  it("현재값과 지원 후 값을 시설별로 보여준다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitySupportDialog
        targets={[eligible]}
        tokenCost={120}
        busy={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("길드 제작소");
    expect(html).toContain("20 / 500");
    expect(html).toContain("지원 후 120 / 500");
    expect(html).toContain("공동 교역 토큰 120개");
  });

  it("선택할 시설이 없으면 정확한 사유를 보여준다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitySupportDialog
        targets={[{ ...eligible, eligible: false, reason: "remaining_below_200" }]}
        tokenCost={120}
        busy={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(html).toContain("남은 통나무·철광석 필요량이 200개 미만입니다.");
    expect(html).toContain("지원 가능한 시설이 없습니다.");
  });
});
```

- [ ] **Step 2: Run the dialog test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused dialog**

Create `GuildFacilitySupportDialog.tsx` with these requirements:

- Opaque `SURFACE_CARD` panel over `bg-black/60 backdrop-blur-sm`.
- `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="guild-facility-support-title"`.
- Render all returned targets; disable ineligible rows without applying whole-card opacity.
- Show current, grant, and after values for 통나무 and 철광석.
- Translate reasons exactly:
  - `max_level`: `최대 레벨에 도달했습니다.`
  - `materials_not_required`: `다음 단계에서 통나무·철광석을 요구하지 않습니다.`
  - `remaining_below_200`: `남은 통나무·철광석 필요량이 200개 미만입니다.`
- Default selection to the first eligible target.
- Disable confirmation while busy or with no eligible target.
- Display `길드 공용 · 구매 즉시 시설에 적용` and `공동 교역 토큰 120개 사용`.
- Call `onConfirm(selectedBuildingId)` without inventory state.

- [ ] **Step 4: Run the dialog test and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Integrate the dialog into the trade panel**

In `GuildTradePostPanel.tsx`:

- Import the dialog and target types.
- Add `facilitySupportTargets` to `TradeState` and optional support metadata to `TradeResponse.purchased`.
- Store the support item currently being confirmed.
- For `settlement_supplies`, open the dialog instead of `window.confirm`.
- Submit `{ action: "buy", shopItemId: "settlement_supplies", facilityId }`.
- On success close the dialog and show:

```ts
`${support.buildingName} Lv.${support.targetLevel} 지원 완료 · 통나무 +${support.crop.toLocaleString()} · 철광석 +${support.ore.toLocaleString()} · 공동 토큰 -${purchase.tokenCost.toLocaleString()} · 잔액 ${purchase.remainingTokens.toLocaleString()}`
```

- Use the returned trade view to refresh token balance and facility previews.
- Disable the support purchase button when no target is eligible and show `지원 가능한 시설 없음`.
- Keep current confirmations for member goods, guild gold, and guild fame.
- Add errors:
  - `invalid_facility_support_target`: `지원할 길드 시설을 다시 선택해 주세요.`
  - `facility_support_unavailable`: `다른 기부나 업그레이드로 시설 상태가 변경되었습니다. 최신 상태를 다시 불러왔습니다.`

- [ ] **Step 6: Run UI, route, and type checks**

Run:

```bash
npm test -- src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx src/app/api/v2/guild/trade-post/route.test.ts
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/adventure/v2/guild/GuildFacilitySupportDialog.tsx src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx src/adventure/v2/guild/GuildTradePostPanel.tsx
git commit -m "feat: add guild facility support picker"
```

---

### Task 4: Player documentation and final regression verification

**Files:**
- Modify: `src/app/manual/content/guild.tsx:364-425`

**Interfaces:**
- Consumes: finalized shop copy and target type.
- Produces: manual text distinguishing member grants, guild currencies, and immediate facility support.

- [ ] **Step 1: Update the guild manual**

Replace the claim that every item goes to all current members with:

```tsx
<li>
  상점 품목은 길드장과 관리자만 선택할 수 있습니다. 개인 물품은 현재
  길드원 전원에게 같은 수량으로 지급되며, 길드 공용 보상은 길드 금고·명성
  또는 선택한 시설의 공동 기부 진행도에 즉시 반영됩니다. 구매 한도는 길드
  전체에 적용됩니다.
</li>
<li>
  길드 시설 지원 물자는 별도 아이템이나 공용 재화로 보관되지 않습니다.
  구매할 때 선택한 시설의 통나무·철광석 기부 진행도에 총 200개가 바로
  반영되며, 고급 목재·광석에는 사용할 수 없습니다.
</li>
```

In the shop table, render `settlement_supplies` as `선택한 길드 시설`, other guild targets as `길드 공용 자원`, and member targets as `현재 길드원 전원`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/guildFacilitySupport.test.ts src/adventure/data/v2/guildTrade.test.ts src/app/api/v2/guild/trade-post/route.test.ts src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx src/app/api/v2/guild/facilities/[buildingId]/donate/route.test.ts src/app/api/v2/guild/facilities/[buildingId]/upgrade/route.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run lint and TypeScript checks**

Run:

```bash
npx eslint src/adventure/data/v2/guildFacilitySupport.ts src/adventure/data/v2/guildFacilitySupport.test.ts src/adventure/data/v2/guildTrade.ts src/adventure/data/v2/guildTrade.test.ts src/app/api/v2/guild/trade-post/route.ts src/app/api/v2/guild/trade-post/route.test.ts src/adventure/v2/guild/GuildFacilitySupportDialog.tsx src/adventure/v2/guild/GuildFacilitySupportDialog.test.tsx src/adventure/v2/guild/GuildTradePostPanel.tsx src/app/manual/content/guild.tsx
npx tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 4: Verify final diff and unrelated worktree changes**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Every modification that was already present before implementation remains untouched and unstaged; only files named by this plan are included in this feature's commits.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/app/manual/content/guild.tsx
git commit -m "docs: explain guild facility support supplies"
```

- [ ] **Step 6: Record final verification evidence**

Run the focused test command, ESLint command, TypeScript command, and `git status --short` after the final commit. Report exact pass counts and confirm that no deployment or maintenance-mode change occurred.
