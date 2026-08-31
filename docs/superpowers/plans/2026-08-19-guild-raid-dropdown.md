# Guild Raid Dropdown Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a direct guild raid entry in the guild dropdown for guild members.

**Architecture:** Keep the existing guild raid tab and route unchanged. Add one fixed raid menu item and centralize guild dropdown assembly in a pure function so membership gating, ordering, and facility independence are directly testable.

**Tech Stack:** TypeScript, React, Vitest, Phosphor icons, existing Next.js App Router query navigation.

## Global Constraints

- Guild members see `토벌전` at `/guild?tab=raid`.
- Non-members do not see the raid entry.
- Ordering is `길드`, `토벌전`, then unlocked guild facilities.
- Raid visibility does not depend on the guild facility API result.
- Do not change guild raid combat, rewards, server APIs, or deployment state.

---

## File Structure

- Modify `src/adventure/v2/MainTabNav.tsx`: define the raid item, expose pure guild menu assembly, and use it while rendering.
- Modify `src/adventure/v2/MainTabNav.test.ts`: verify member gating, route, and ordering through the pure menu assembly function.

### Task 1: Add the guild raid dropdown entry

**Files:**
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Test: `src/adventure/v2/MainTabNav.test.ts`

**Interfaces:**
- Consumes: `viewerGuildId: number | null` and `GuildFacilityId[]` from the current component state.
- Produces: `guildMenuItemsForViewer(viewerGuildId, facilityIds): SubItem[]`.

- [ ] **Step 1: Write the failing membership and route test**

Extend `MainTabNav.test.ts`:

```ts
import {
  TOWN_MENU_ITEMS,
  guildMenuItemsForViewer,
  townMenuItemsForViewer,
} from "./MainTabNav";

describe("길드 드롭다운 메뉴", () => {
  it("길드 가입자에게 토벌전을 길드와 시설 사이에 노출한다", () => {
    const items = guildMenuItemsForViewer(7, ["guild_smithy"]).map(
      ({ label, href }) => ({ label, href }),
    );

    expect(items).toEqual([
      { label: "길드", href: "/guild" },
      { label: "토벌전", href: "/guild?tab=raid" },
      { label: "제작소", href: "/guild?tab=facilities&facility=guild_smithy" },
    ]);
  });

  it("무소속 사용자에게는 토벌전을 노출하지 않는다", () => {
    expect(guildMenuItemsForViewer(null).map((item) => item.href)).toEqual([
      "/guild",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to confirm RED**

Run:

```bash
npm test -- src/adventure/v2/MainTabNav.test.ts
```

Expected: FAIL because `guildMenuItemsForViewer` is not exported.

- [ ] **Step 3: Add the minimal menu assembly**

In `MainTabNav.tsx`, define the fixed item and pure helper:

```ts
const GUILD_RAID_ITEM: SubItem = {
  label: "토벌전",
  href: "/guild?tab=raid",
  Icon: Crown,
  color: "text-rose-600 dark:text-rose-400",
};

export function guildMenuItemsForViewer(
  viewerGuildId: number | null,
  facilityIds: readonly GuildFacilityId[] = [],
): SubItem[] {
  if (viewerGuildId == null) return [GUILD_ROOT_ITEM];
  return [
    GUILD_ROOT_ITEM,
    GUILD_RAID_ITEM,
    ...facilityIds.map(guildFacilityMenuItem),
  ];
}
```

Replace the guild branch of `openSubItems` with:

```ts
guildMenuItemsForViewer(viewerGuildId, cachedGuildFacilityIds)
```

- [ ] **Step 4: Run focused GREEN verification**

Run:

```bash
npm test -- src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/guild/guildFacilities.test.ts
```

Expected: all menu and facility tests pass.

- [ ] **Step 5: Run static checks**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.ts
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 6: Review and commit only this task**

Inspect `git diff` and `git status`, stage only the two implementation files, then commit:

```bash
git add src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.ts
git commit -m "feat: show guild raid in guild menu"
```
