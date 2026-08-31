# Guild Gold Bigint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow guild reward and deposit flows to raise the shared guild gold balance beyond PostgreSQL's 32-bit integer limit without rolling back the transaction.

**Architecture:** Keep the existing JavaScript `number` API and transactional reward paths unchanged. Expand only `v2_guild_resources.gold` from PostgreSQL `integer` to `bigint`, using Drizzle's number mode because game balances remain within JavaScript's safe-integer range.

**Tech Stack:** PostgreSQL, Drizzle ORM, TypeScript, Vitest

## Global Constraints

- Do not deploy or mutate production data.
- Preserve unrelated working-tree changes.
- Prove the schema regression with a failing test before changing production code.

---

### Task 1: Protect the guild-gold storage contract

**Files:**
- Create: `src/db/guildGoldSchema.test.ts`
- Modify: `src/db/schema.ts`

**Interfaces:**
- Consumes: `v2GuildResources.gold`, whose application-facing value remains a JavaScript `number`.
- Produces: a PostgreSQL `bigint` column that maps driver values such as `"2152828938"` to the same number.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { v2GuildResources } from "./schema";

describe("guild gold schema", () => {
  it("stores balances above the PostgreSQL 32-bit integer limit", () => {
    expect(v2GuildResources.gold.getSQLType()).toBe("bigint");
    expect(v2GuildResources.gold.mapFromDriverValue("2152828938")).toBe(
      2_152_828_938,
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/guildGoldSchema.test.ts`

Expected: FAIL because the current column SQL type is `integer`.

- [x] **Step 3: Write minimal implementation**

Change `v2GuildResources.gold` to:

```ts
gold: bigint("gold", { mode: "number" }).notNull().default(0),
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/guildGoldSchema.test.ts`

Expected: PASS.

### Task 2: Ship the forward-only database migration

**Files:**
- Create: `drizzle/0177_*.sql`
- Create/Modify: matching `drizzle/meta` snapshot and journal entries

**Interfaces:**
- Consumes: the schema change from Task 1.
- Produces: `ALTER TABLE "v2_guild_resources" ALTER COLUMN "gold" SET DATA TYPE bigint;` for existing databases.

- [x] **Step 1: Generate the migration**

Run: `npm run db:generate`

Expected: one new migration changing only `v2_guild_resources.gold` from `integer` to `bigint`.

- [x] **Step 2: Inspect and validate migration artifacts**

Run: `git diff -- src/db/schema.ts drizzle && npm run check-migrations`

Expected: no destructive-operation violation and no unrelated schema changes.

- [x] **Step 3: Run focused and broad verification**

Run: `npm test -- src/db/guildGoldSchema.test.ts src/adventure/data/v2/guildExploration.test.ts`

Run: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`

Expected: all commands pass.

- [x] **Step 4: Commit the fix**

```bash
git add docs/superpowers/plans/2026-08-27-guild-gold-bigint.md src/db/guildGoldSchema.test.ts src/db/schema.ts drizzle
git commit -m "fix: expand guild gold storage"
```
