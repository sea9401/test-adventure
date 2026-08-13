# Dangerous Waters Fishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate, optional dangerous-waters fishing mode with server-authoritative tension encounters, risked cargo, expensive fishing-coin gear, existing fishing progression benefits, tradeable catches, and asynchronous cooperative giant fish.

**Architecture:** Keep ordinary fishing untouched. Store each player's dangerous-waters voyage, loadout, bait, codex, and current encounter in one versioned `savesKv` document so personal actions can be serialized with the existing row-lock pattern; settle returned cargo into ordinary `character.v2.materials` so inventory and marketplace behavior remain generic. Store global giant-fish events and per-player contributions in dedicated PostgreSQL tables, while reusing the same deterministic encounter engine for personal and cooperative attempts.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router Route Handlers, Drizzle ORM/PostgreSQL, Vitest

## Global Constraints

- Do not alter ordinary fishing sessions, rods, lures, codex entries, weekly records, or reward rules.
- Unlock dangerous waters at fishing level 15 and grant a free starter rod, reel, line, and unlimited basic bait.
- Do not add daily entry limits, daily completion rewards, stamina costs, durability, repair costs, or a new currency.
- Target 30–60 seconds for ordinary dangerous fish and 1–3 minutes for large/giant fish; a player may return after one catch.
- Only unreturned cargo may be lost. Existing inventory, gear, codex records, traces, and confirmed catches are never loss targets.
- Risk 0–2 has no cargo accident; risk 3/4/5 may lose at most 20%/35%/50% of cargo value.
- Gear and bait use existing fishing coins. Starter bait is unlimited; special bait is consumed only when a valid encounter is created.
- Dangerous-waters rewards must not grant combat stats or SP.
- Apply the highest previously visited fishing job lineage without requiring the player to switch current jobs.
- Giant fish remain available for 6 hours and use asynchronous cumulative contribution without a contribution leaderboard.
- Use opaque surfaces from `src/components/ui/surfaces.ts`; do not put translucent content cards over scene backgrounds.
- Follow the checked-in Next.js 16 Route Handler docs: native `Request`/`Response`, uncached database-backed GET handlers, and explicit POST handlers.
- Do not add image assets; use existing `GameIcon`, text, and CSS so the image pipeline remains unchanged.
- Do not deploy.

---

### Task 1: Dangerous-waters catalog and tradeable catch materials

**Files:**
- Create: `src/adventure/data/v2/dangerousFishing.ts`
- Create: `src/adventure/data/v2/dangerousFishing.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`

**Interfaces:**
- Produces: `DangerousZoneId`, `DangerousDepthId`, `DangerousFishId`, `DangerousGearKind`, `DangerousRodId`, `DangerousReelId`, `DangerousLineId`, `DangerousBaitId`, `DangerousBossId`.
- Produces: `DANGEROUS_ZONES`, `DANGEROUS_FISH`, `DANGEROUS_RODS`, `DANGEROUS_REELS`, `DANGEROUS_LINES`, `DANGEROUS_BAITS`, `DANGEROUS_BOSSES`.
- Produces: `dangerousCatchMaterialId(fishId)`, `dangerousBossMaterialId(bossId)`, `isDangerousCatchMaterialId(id)`.

- [x] **Step 1: Write catalog and marketplace behavior tests**

  Add literal assertions that the launch catalog has three zones (`shattered_reef`, `storm_trench`, `abyssal_rift`), three depths, at least eight fish spread across them, starter gear with price 0, permanent gear in the approved 15,000–100,000+ coin bands, basic bait price 0, special bait packs in the 500–3,000 band, and two giant fish. Assert every fish produces a unique `danger_catch_*` material ID and that `itemDisplayName("material", id)` returns the catalog name.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts src/lib/server/marketplaceV2.test.ts`

  Expected: FAIL because the dangerous fishing catalog and material IDs do not exist.

- [x] **Step 3: Implement the immutable catalog**

  Define concrete launch content:

  - zones: 파쇄 암초, 폭풍 해구, 심연 균열;
  - depths: 표층, 중층, 심층;
  - fish behavior profiles: 돌진형, 몸부림형, 잠수형, 변칙형;
  - permanent gear trade-offs for safe, fast, and heavy styles;
  - bait targeting reef, blood-scented, luminous, and abyss groups;
  - bosses: 해일의 거신 and 심연 크라켄.

  Export catalog guards that reject unknown IDs. Spread tradeable catch material definitions into `V2_MATERIALS`; do not add NPC sell prices.

- [x] **Step 4: Run tests and confirm GREEN**

  Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts src/lib/server/marketplaceV2.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/adventure/data/v2/dangerousFishing.ts src/adventure/data/v2/dangerousFishing.test.ts src/adventure/data/v2/dungeonDrops.ts src/lib/server/marketplaceV2.test.ts
  git commit -m "feat: add dangerous fishing catalog"
  ```

### Task 2: Server-authoritative tension encounter engine

**Files:**
- Create: `src/adventure/v2/dangerousFishingEncounter.ts`
- Create: `src/adventure/v2/dangerousFishingEncounter.test.ts`

**Interfaces:**
- Consumes: fish and gear definitions from Task 1.
- Produces: `DangerousFishingAction = "reel" | "give" | "brace"` and `DangerousFishBehavior = "charge" | "thrash" | "turn" | "dive"`.
- Produces: `createDangerousEncounter(args): DangerousEncounter`.
- Produces: `applyDangerousEncounterAction(encounter, action, now): DangerousEncounterTransition`.
- Produces: `dangerousEncounterView(encounter): DangerousEncounterView` without returning the private pattern seed.

- [x] **Step 1: Write failing action-engine tests**

  Use fixed literal encounters to prove:

  - reel against `turn` reduces distance but raises tension;
  - give against `charge` prevents a line break and lets distance grow;
  - brace against `thrash` removes more stamina than a wrong action;
  - excessive tension returns `line_broken`;
  - two consecutive slack steps return `hook_lost`;
  - both zero stamina and zero distance are required for `caught`;
  - an action before `nextActionAt` is rejected without mutating state;
  - repeating an old revision is rejected as `stale`;
  - the next behavior sequence is deterministic from `patternSeed` but absent from the public view.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/adventure/v2/dangerousFishingEncounter.test.ts`

  Expected: FAIL because the encounter module is missing.

- [x] **Step 3: Implement the pure engine**

  Store tension on a 0–100 base scale modified by rod/line, stamina and distance from the fish profile, `slackTurns`, `step`, `revision`, `nextActionAt`, and a private pattern seed. Apply one action every 850ms. Correct counters get the largest benefit; wrong actions remain recoverable for lower-tier fish. Return explicit events (`progress`, `line_broken`, `hook_lost`, `caught`, `timeout`, `too_fast`, `stale`).

- [x] **Step 4: Run tests and confirm GREEN**

  Run: `npm test -- src/adventure/v2/dangerousFishingEncounter.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/adventure/v2/dangerousFishingEncounter.ts src/adventure/v2/dangerousFishingEncounter.test.ts
  git commit -m "feat: add dangerous fishing encounter engine"
  ```

### Task 3: Versioned voyage, cargo, risk, codex, and recovery state

**Files:**
- Create: `src/adventure/v2/dangerousFishingState.ts`
- Create: `src/adventure/v2/dangerousFishingState.test.ts`

**Interfaces:**
- Consumes: catalog IDs and `DangerousEncounter`.
- Produces: `DANGEROUS_FISHING_SAVE_KEY = "dangerous-fishing.v1"`.
- Produces: `emptyDangerousFishingState()`, `parseDangerousFishingState(raw)`.
- Produces: `startDangerousVoyage(state, args)`, `startPersonalEncounter(state, args)`, `resolvePersonalEncounter(state, transition, now)`.
- Produces: `dangerousRiskPreview(risk)` returning accident chance and maximum loss fraction.
- Produces: `applyDangerousAccidentAndReturn(state, roll)` and `returnDangerousVoyage(state)`.

- [x] **Step 1: Write failing state-transition tests**

  Assert literal states for unlock-safe defaults, starter loadout, malformed-save normalization, one active voyage, cargo accumulation, codex persistence, resolved encounter ID idempotency, and risk clamping. Assert no incident at risk 0–2, maximum value loss of 20/35/50% at risk 3/4/5, proportional loss across cargo stacks, forced return after an incident, and a normal return that converts every retained cargo entry into material quantities while clearing only the voyage.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/adventure/v2/dangerousFishingState.test.ts`

- [x] **Step 3: Implement versioned immutable transitions**

  Keep account progression and codex outside the nullable `voyage` object. Keep at most 32 resolved encounter IDs. Store each cargo stack as `{ fishId, materialId, quantity, totalValue }`; codex stores caught count, best size, first catch, and best-catch time. Incident loss uses item value units and never deletes codex or trace state.

- [x] **Step 4: Run tests and confirm GREEN**

  Run: `npm test -- src/adventure/v2/dangerousFishingState.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts
  git commit -m "feat: model dangerous fishing voyages"
  ```

### Task 4: Existing fishing level, lineage, passives, and gear economy

**Files:**
- Create: `src/adventure/v2/dangerousFishingHeritage.ts`
- Create: `src/adventure/v2/dangerousFishingHeritage.test.ts`
- Create: `src/adventure/v2/dangerousFishingShop.ts`
- Create: `src/adventure/v2/dangerousFishingShop.test.ts`

**Interfaces:**
- Consumes: `FishingProgressionState`, proficiency, current job ID, equipped skill IDs, dangerous gear catalog, dangerous state.
- Produces: `dangerousFishingHeritage(args): DangerousFishingHeritage`.
- Produces: `dangerousFishingEncounterModifiers(heritage, loadout)` with capped safe-zone, telegraph, stamina, cargo-protection, size, and trace bonuses.
- Produces: `buyDangerousGear(state, walletCoins, kind, id)` and `equipDangerousGear(state, kind, id)`.
- Produces: `buyDangerousBaitPack(state, walletCoins, baitId)`.

- [x] **Step 1: Write failing heritage and economy tests**

  Prove level 14 remains locked and level 15 unlocks; level 50 grants no more than 10% manipulation assistance. Prove `highestVisitedFishingJobId` grants the approved lineage effect even when the current job is unrelated. Prove equipped fishing passives map to dangerous-waters bonuses with caps. Prove starter gear cannot be repurchased, unowned gear cannot be equipped, purchases deduct exact fishing coins, duplicate permanent purchases do not deduct again, and basic bait is never decremented.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingShop.test.ts`

- [x] **Step 3: Implement heritage and purchases**

  Use the highest visited lineage `fisher → angler → masterangler → fullcatchking → seagod`. Map equipped `물때 읽기`, `포인트 짚기`, `대물 감각`, `만선 조업`, and `심해 해류` to trace, target-reading, stamina, cargo-protection, and deep-water bonuses. Keep all combined assistance within explicit constants exported for UI explanation.

- [x] **Step 4: Run tests and confirm GREEN**

  Run: `npm test -- src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingShop.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/adventure/v2/dangerousFishingHeritage.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingShop.ts src/adventure/v2/dangerousFishingShop.test.ts
  git commit -m "feat: connect dangerous fishing progression"
  ```

### Task 5: Personal dangerous-waters service and Route Handlers

**Files:**
- Create: `src/lib/server/dangerousFishingService.ts`
- Create: `src/lib/server/dangerousFishingRoute.test.ts`
- Create: `src/app/api/v2/dangerous-fishing/status/route.ts`
- Create: `src/app/api/v2/dangerous-fishing/voyage/route.ts`
- Create: `src/app/api/v2/dangerous-fishing/encounter/route.ts`
- Create: `src/app/api/v2/dangerous-fishing/shop/route.ts`

**Interfaces:**
- Consumes: Tasks 1–4, `lockSaveForUpdate`, `upsertSave`, `FISHING_WALLET_KEY`, `FISHING_PROGRESS_KEY`, `skills.v2`, `proficiency.v2`, and `character.v2`.
- Produces: `readDangerousFishingView(executor, userId, now)`.
- Produces: `startVoyageInTx`, `startEncounterInTx`, `actOnEncounterInTx`, `returnVoyageInTx`, and `purchaseDangerousFishingItemInTx`.
- Route contracts:
  - `GET /api/v2/dangerous-fishing/status` → full personal view and catalogs.
  - `POST /api/v2/dangerous-fishing/voyage` body `{ action: "start", zoneId, depthId } | { action: "return" }`.
  - `POST /api/v2/dangerous-fishing/encounter` body `{ action: "start", baitId } | { action: "reel" | "give" | "brace", encounterId, revision }`.
  - `POST /api/v2/dangerous-fishing/shop` body `{ kind: "rod" | "reel" | "line", id, action: "buy" | "equip" } | { kind: "bait", id, action: "buy" }`.

- [x] **Step 1: Build a real-route in-memory harness and failing tests**

  Mock only authentication, the database transaction executor, and `savesKv` I/O. Exercise real handlers and assert unauthorized 401, level gate 403, invalid catalog 400, auto-gathering conflict 409, stale revision 409, too-fast action 429, valid catch persistence, special bait consumption only on valid encounter start, ordinary failure preserving cargo, normal return transferring cargo to `character.v2.materials`, incident return applying its loss cap, duplicate result idempotency, fishing XP increase, and highest fishing-lineage mastery increase.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/lib/server/dangerousFishingRoute.test.ts`

- [x] **Step 3: Implement transaction services and handlers**

  Use one `db.transaction` per mutation. Lock keys in this order: dangerous state → fishing progress → skills (read only where possible) → character → proficiency → fishing wallet. Validate activity verification before starting or acting. Record one `fishing` activity completion only when an encounter resolves, not for every button press. Rate-limit start and action endpoints separately so expected repeated actions do not trip the ordinary cast limit.

- [x] **Step 4: Run focused and ordinary-fishing regression tests**

  Run: `npm test -- src/lib/server/dangerousFishingRoute.test.ts src/lib/server/fishingReelRoute.test.ts src/adventure/v2/fishingSession.test.ts src/adventure/v2/fishingProgression.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingRoute.test.ts src/app/api/v2/dangerous-fishing
  git commit -m "feat: add personal dangerous fishing APIs"
  ```

### Task 6: Personal dangerous-waters UI and navigation

**Files:**
- Create: `src/adventure/v2/useDangerousFishing.ts`
- Create: `src/adventure/v2/DangerousFishingView.tsx`
- Create: `src/adventure/v2/DangerousFishingEncounterPanel.tsx`
- Create: `src/adventure/v2/DangerousFishingLoadoutPanel.tsx`
- Create: `src/adventure/v2/DangerousFishingCargoPanel.tsx`
- Create: `src/adventure/v2/DangerousFishingView.test.tsx`
- Create: `src/app/(game)/town/fishing/dangerous/page.tsx`
- Create: `src/app/(game)/town/fishing/dangerous/page.test.tsx`
- Modify: `src/adventure/v2/FishingSubTabs.tsx`
- Modify: `src/adventure/v2/FishingPanel.tsx`
- Modify: `src/app/(game)/town/fishing/page.tsx`

**Interfaces:**
- Consumes: Task 5 API contracts.
- Produces: a separate `/town/fishing/dangerous` experience and a `위험 해역` fishing subtab.

- [x] **Step 1: Write failing UI behavior tests**

  Render real components with injected handlers and assert the level-locked explanation, preparation selectors, fishing-coin prices, owned/equipped states, risk preview, opaque surface classes, cargo and safe-return action, three large encounter controls, non-color tension labels, keyboard controls, busy-state duplicate prevention, reconnect restoration, and actionable API error copy.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx 'src/app/(game)/town/fishing/dangerous/page.test.tsx'`

- [x] **Step 3: Implement hook, panels, page, and navigation**

  Keep the client as a projection of server state. Poll only while an encounter is active or a boss is near expiry; otherwise refresh after mutations. Put `감아올리기`, `줄 풀기`, and `버티기` in a sticky mobile control row and bind keyboard keys `A`, `S`, `D` while ignoring text-entry targets. Use `SURFACE_CARD`, `SURFACE_INSET`, and existing buttons/cards.

- [x] **Step 4: Run focused UI and navigation tests**

  Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/FishingView.test.ts 'src/app/(game)/town/fishing/page.test.tsx' 'src/app/(game)/town/fishing/dangerous/page.test.tsx'`

- [x] **Step 5: Commit**

  ```bash
  git add src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishing*.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/FishingSubTabs.tsx src/adventure/v2/FishingPanel.tsx 'src/app/(game)/town/fishing/page.tsx' 'src/app/(game)/town/fishing/dangerous'
  git commit -m "feat: add dangerous fishing interface"
  ```

### Task 7: Inventory and marketplace integration for returned catches

**Files:**
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/adventure/v2/v2ItemListShared.test.ts`
- Modify: `src/adventure/v2/inventory/MaterialTab.tsx` if the generic material renderer lacks descriptions for the new IDs.

**Interfaces:**
- Consumes: dangerous catch materials from Task 1 and returned `character.v2.materials` quantities from Task 5.
- Produces: generic inventory display, listing, escrow removal, cancellation/expiry return, purchase fulfillment, and buy-order support without a dangerous-fishing-specific marketplace branch.

- [x] **Step 1: Add failing end-to-end material tests**

  Use `danger_catch_ironjaw_tuna` as a literal fixture. Assert it appears in the material tab classification, can be listed in a real marketplace list handler, removes the exact quantity, uses its catalog display name, and is recognized by stackable buy orders and generic fulfillment.

- [x] **Step 2: Run tests and confirm RED or document generic GREEN**

  Run: `npm test -- src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/adventure/v2/v2ItemListShared.test.ts`

  If the new catalog makes all behavioral tests pass immediately, keep the integration tests because they protect the generic boundary; do not add a special branch. If a real boundary fails, implement only that missing generic integration.

- [x] **Step 3: Implement the minimal missing integration**

  Preserve material-kind listing and fulfillment. Do not invent a new marketplace kind or transfer personal sizes/codex records.

- [x] **Step 4: Run marketplace regression tests**

  Run: `npm test -- src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts`

- [x] **Step 5: Commit**

  ```bash
  git add src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/adventure/v2/v2ItemListShared.test.ts src/adventure/v2/inventory/MaterialTab.tsx
  git commit -m "test: cover dangerous catch trading"
  ```

### Task 8: Giant-fish schema, migration, and concurrency-safe service

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0165_*.sql`
- Create: `drizzle/meta/0165_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/server/dangerousFishingBoss.ts`
- Create: `src/lib/server/dangerousFishingBoss.test.ts`

**Interfaces:**
- Produces tables `dangerous_fishing_boss_events` and `dangerous_fishing_boss_contributions`.
- Produces: `activeDangerousFishingBoss(executor, now)`.
- Produces: `maybeSpawnDangerousFishingBoss(tx, args)`.
- Produces: `startBossAttemptInTx(tx, args)`, `applyBossActionInTx(tx, args)`, `claimBossRewardInTx(tx, args)`.

- [x] **Step 1: Write failing service tests with a transaction double**

  Assert a risk-4 epic/legendary personal catch can spawn one six-hour event, an already active event prevents duplicates, discoverer identity is recorded, personal attempts use the encounter engine, successful attempts atomically reduce public stamina, simultaneous final contributions produce one defeated transition, expired events reject starts, contribution totals persist, reward tiers flatten after the high threshold, one successful attempt qualifies for base reward, discoverer bonus is additive, last-haul has no exclusive item, and duplicate claims return `already_claimed` without mutation.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/lib/server/dangerousFishingBoss.test.ts`

- [x] **Step 3: Add schema and generate migration**

  Event columns: UUID/text ID, boss catalog ID, discoverer nullable FK, `maxStamina`, `stamina`, `status`, `spawnedAt`, `expiresAt`, `defeatedAt`. Contribution PK: `(eventId, userId)` with total contribution, successful attempts, first/last contribution timestamps, and nullable `rewardClaimedAt`. Add active/expiry and participant indexes. Run `npm run db:generate`, inspect SQL, snapshot, and journal.

- [x] **Step 4: Implement lock-safe boss service**

  Lock the player dangerous save before the event row; update the event with a guarded stamina expression and mark defeat once. Keep only the player's active boss encounter in savesKv. Reward claims add fishing coins, boss material to `character.v2.materials`, and joint-catch codex metadata in one transaction.

- [x] **Step 5: Run service and migration checks**

  Run: `npm test -- src/lib/server/dangerousFishingBoss.test.ts && npm run check-migrations`

- [x] **Step 6: Commit**

  ```bash
  git add src/db/schema.ts drizzle src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingBoss.test.ts
  git commit -m "feat: add cooperative giant fish service"
  ```

### Task 9: Giant-fish routes and asynchronous contribution UI

**Files:**
- Create: `src/app/api/v2/dangerous-fishing/boss/route.ts`
- Create: `src/lib/server/dangerousFishingBossRoute.test.ts`
- Create: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Create: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`
- Modify: `src/lib/server/dangerousFishingService.ts`
- Modify: `src/app/api/v2/dangerous-fishing/status/route.ts`
- Modify: `src/app/api/v2/dangerous-fishing/encounter/route.ts`
- Modify: `src/adventure/v2/useDangerousFishing.ts`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`

**Interfaces:**
- `GET /api/v2/dangerous-fishing/boss` → active/recent event, public stamina, expiry, personal contribution, eligibility, and claim state; no ranking list.
- `POST /api/v2/dangerous-fishing/boss` body `{ action: "start", eventId } | { action: "reel" | "give" | "brace", eventId, encounterId, revision } | { action: "claim", eventId }`.

- [x] **Step 1: Write failing real-route and UI tests**

  Assert unauthorized and expired errors, active event response, individual start/action, cumulative stamina reduction, preserved contribution after leaving, defeated-event claim, duplicate claim, discoverer marker, absence of contribution rankings, countdown copy, one-to-three-minute individual attempt controls, base eligibility after one success, and retry after a broken line.

- [x] **Step 2: Run tests and confirm RED**

  Run: `npm test -- src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/DangerousFishingBossPanel.test.tsx`

- [x] **Step 3: Implement routes, spawn hook, and panel**

  Call `maybeSpawnDangerousFishingBoss` only after a risk-4+ epic/legendary personal catch. Return spawn news in the encounter response. Poll the boss endpoint only while an event is active. Show public stamina, remaining time, personal contribution and claim tier, but no ranking.

- [x] **Step 4: Run all dangerous-waters tests**

  Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingEncounter.test.ts src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingShop.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

- [x] **Step 5: Commit**

  ```bash
  git add src/app/api/v2/dangerous-fishing src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx
  git commit -m "feat: expose cooperative giant fishing"
  ```

### Task 10: Final verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-13-dangerous-waters-fishing.md` only to mark completed checkboxes.

- [x] **Step 1: Run focused regression suites**

  Run ordinary fishing, marketplace, jobs, saves, and dangerous-waters suites together. Confirm zero failures and inspect warnings.

- [x] **Step 2: Run repository gates**

  ```bash
  npm test
  npm run lint
  npx tsc --noEmit
  npm run check-migrations
  npm run check-images
  npm run build
  ```

- [x] **Step 3: Review requirements and diff**

  Confirm ordinary fishing files changed only for navigation, no daily gate/new currency/durability/combat power exists, cargo loss cannot touch confirmed inventory, all mutations are idempotent, all surfaces are opaque, and giant-fish responses contain no ranking. Run `git diff --check`, `git status --short`, `git diff --stat`, and review every modified file.

- [x] **Step 4: Commit checklist completion**

  ```bash
  git add docs/superpowers/plans/2026-08-13-dangerous-waters-fishing.md
  git commit -m "docs: complete dangerous fishing plan"
  ```

- [x] **Step 5: Report without deploying**

  Provide the implementation branch, commits, test/build evidence, migration number, user-visible entry path, and explicitly state that no environment was deployed.
