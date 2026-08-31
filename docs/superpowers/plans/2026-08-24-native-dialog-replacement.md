# Native Dialog Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every runtime browser `alert` and `confirm` call with one accessible, queued application dialog.

**Architecture:** A framework-neutral request queue exposes Promise-returning confirm and alert functions. A single client host mounted in the root layout renders one request at a time with existing UI surfaces and accessibility hooks; call sites await the same Boolean decision they previously received synchronously.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, Vitest, Testing Library, Tailwind UI surfaces.

## Global Constraints

- Do not change action messages, resource costs, busy guards, or mutation order while migrating dialogs.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not introduce translucent content cards.
- Preserve unrelated dirty-worktree changes and do not deploy.
- Do not leave browser-native `alert` or `confirm` calls in runtime source.

---

### Task 1: Queued dialog service and host

**Files:**
- Create: `src/components/ui/gameDialog.ts`
- Create: `src/components/ui/GameDialogHost.tsx`
- Create: `src/components/ui/GameDialogHost.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `confirmGameAction(input: string | GameConfirmOptions): Promise<boolean>`
- Produces: `showGameAlert(input: string | GameAlertOptions): Promise<void>`
- Produces: `GameDialogHost(): JSX.Element | null`

- [ ] Write a jsdom test that requests confirmation, clicks cancel and approve, checks alert acknowledgement, and proves two queued requests render in FIFO order.
- [ ] Run `npx vitest run src/components/ui/GameDialogHost.test.tsx` and verify failure because the host API does not exist.
- [ ] Implement the typed FIFO presenter subscription and accessible host using `useEscapeKey`, `useModalA11y`, `Button`, `SURFACE_CARD`, and `SURFACE_INSET`.
- [ ] Mount `<GameDialogHost />` as the last child of the root body.
- [ ] Re-run the host test and verify all cases pass.

### Task 2: General player call sites

**Files:**
- Modify: `src/components/ChatPanel.tsx`, `src/components/safety/ContentSafetyActions.tsx`
- Modify: `src/adventure/BulletinBoardView.tsx`, `src/adventure/bulletin/CommentsPanel.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`, `src/adventure/v2/CodexEquipmentPanel.tsx`, `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`, `src/adventure/v2/LifeFieldPanels.tsx`, `src/adventure/v2/AutoGatheringCard.tsx`, `src/adventure/v2/FarmEndgameShopPanel.tsx`, `src/adventure/v2/FarmRanchPanel.tsx`
- Modify: `src/adventure/v2/V2VillagePanel.tsx`, `src/adventure/v2/V2StormExpeditionView.tsx`, `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Modify: `src/adventure/v2/guild/GuildManagePanel.tsx`, `src/adventure/v2/guild/GuildMembersPanel.tsx`, `src/adventure/v2/guild/GuildLevelUpgradePanel.tsx`, `src/adventure/v2/guild/GuildDiningHallPanel.tsx`, `src/adventure/v2/guild/GuildTradePostPanel.tsx`, `src/adventure/v2/guild/GuildCombatSupplyPanel.tsx`, `src/adventure/v2/guild/GuildOutpostsPanel.tsx`
- Modify tests: `src/adventure/v2/V2VillagePanel.test.ts`, `src/adventure/v2/V2StormExpeditionView.test.tsx`, `src/adventure/v2/FarmRanchPanel.test.tsx`, `src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts`, `src/adventure/v2/coop/coopVisibilityUi.test.ts`

**Interfaces:**
- Consumes: `confirmGameAction` and `ConfirmGameAction` from Task 1.
- Produces: async confirmation helpers that preserve the previous true/false action contract.

- [ ] Update existing helper tests to await Promise results, then run them to verify the old synchronous helpers fail the new contract.
- [ ] Convert exported confirmation helpers and their UI callers to async confirmation.
- [ ] Replace direct player-facing native calls with awaited `confirmGameAction` without changing messages or mutation order.
- [ ] Run the helper tests and affected component tests and verify approval invokes the action once while cancellation invokes it zero times.

### Task 3: Admin and development call sites

**Files:**
- Modify: `src/admin/tabs/users/UserImpersonationSection.tsx`, `src/admin/tabs/users/OpsUserSummarySection.tsx`, `src/admin/tabs/users/ActivityVerificationTestSection.tsx`
- Modify: `src/admin/tabs/UsersTab.tsx`, `src/admin/tabs/SafetyReportsTab.tsx`, `src/admin/tabs/OpsDashboardTab.tsx`
- Modify: `src/components/AdminImpersonationBanner.tsx`
- Modify: `src/app/dev/v2-tools/V2DevToolsContents.tsx`, `src/app/dev/war-ticker/page.tsx`

**Interfaces:**
- Consumes: `confirmGameAction` and `showGameAlert` from Task 1.

- [ ] Convert administrator confirmations to awaited `confirmGameAction` while retaining staged multi-confirm flows in their original order.
- [ ] Convert failure and development alerts to `showGameAlert`.
- [ ] Run affected admin and development tests.

### Task 4: Audit and verification

**Files:**
- Test all files changed in Tasks 1–3.

- [ ] Search non-test runtime source for browser-native `alert` and `confirm` calls and verify zero results, excluding internal functions merely named `confirm`.
- [ ] Run all directly affected Vitest files.
- [ ] Run ESLint on every changed TypeScript file.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Commit only the migration files, preserving unrelated worktree changes.
