# Admin Mail Item Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mastery-certificate admin mail rewards and make the oversized material/equipment selectors manageable with explicit unexplored-area categories.

**Architecture:** Extend the shared admin catalog with exhaustive groups, teach the common picker to select a group before an item, and carry a backward-compatible `masteryCertificates` field through admin send, inbox parsing, display, and claim persistence.

**Tech Stack:** TypeScript, React, Next.js App Router route handlers, Vitest, Drizzle save transactions.

### Task 1: Define grouped admin catalogs and picker behavior

**Files:**
- Create: `src/admin/adminCatalogOptions.test.ts`
- Create: `src/admin/ui/AttachmentPicker.test.tsx`
- Modify: `src/admin/adminCatalogOptions.ts`
- Modify: `src/admin/ui/AttachmentPicker.tsx`

- [x] Add failing tests for exhaustive, duplicate-free material/equipment groups and named unexplored groups.
- [x] Add a failing render test for the separate category selector.
- [x] Implement catalog groups and the grouped picker while retaining flat-picker compatibility.
- [x] Run the focused catalog and picker tests.

### Task 2: Carry mastery certificates through admin mail

**Files:**
- Modify: `src/app/api/admin/mail/route.test.ts`
- Modify: `src/lib/server/inboxPayload.test.ts`
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/app/api/admin/mail/route.ts`
- Modify: `src/lib/server/inboxPayload.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/adventure/v2/V2InboxView.tsx`

- [x] Add failing send, parsing, claim, and display assertions.
- [x] Parse and cap the new admin field and include it in payload, response, and audit records.
- [x] Normalize missing payload values to zero and include the field in claimability.
- [x] Add certificates to the locked `inventory.v2` save and claim response.
- [x] Show the reward in the inbox summary.
- [x] Run the focused route, payload, claim, and inbox tests.

### Task 3: Integrate the categorized UI

**Files:**
- Modify: `src/admin/tabs/BroadcastTab.test.tsx`
- Modify: `src/admin/tabs/BroadcastTab.tsx`

- [x] Add failing UI assertions for 숙련 증서 and all named unexplored categories.
- [x] Use grouped material/equipment catalogs and add the mastery-certificate input, request, confirmation, toast, and reset behavior.
- [x] Run the admin UI tests.

### Task 4: Verify and commit

- [x] Run focused tests, TypeScript checking, lint for touched files, and the relevant broader inbox/admin tests.
- [x] Review the diff and confirm no deployment or unrelated files are included.
- [x] Commit the implementation on the isolated feature branch.
