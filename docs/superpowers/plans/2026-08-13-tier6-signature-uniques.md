# Tier 6 Signature Uniques Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 18 non-set Tier 6 signature uniques with seven composable combat mechanics, depth-targeted Sky Rift drops, and Expedition-weighted rare drops.

**Architecture:** Catalog entries continue to use `SignatureEffect`, extended with one discriminated `tier6_unique` branch. A new pure `tier6UniqueEffects.ts` module owns optional combat resources and converts typed combat events into commands; PvE and PvP adapters apply those commands through existing damage, DoT, shield, MP, and log paths. Drop rolls remain independent of existing equipment rolls, and Expedition reuses its existing `pendingEquipment` array.

**Tech Stack:** TypeScript 5, React 19, Next.js 16 App Router route handlers, Vitest 4, existing deterministic battle engines and JSON save parsing.

## Global Constraints

- Add exactly 18 items: 12 Sky Rift hunting uniques and 6 Storm Expedition uniques.
- New items have `rarity: "unique"`, `noDrop: true`, and no `setId` or `setTags`.
- No class gate, unique equip cap, pity, fragment exchange, owned-item preference, or duplicate protection.
- Hunting total chances by depth are 73–74 `0.00005`, 75–76 `0.000075`, 77–78 `0.0001`; each depth has exactly two equally weighted items.
- Expedition route unique chances are guardian `0.0015` and final boss `0.004`; final cross pool is `0.002`; heart unique is `0.0005`.
- Storm Contract doubles only route and cross unique rolls. Heart unique remains `0.0005`.
- Different unique mechanics may chain; only self-recursion, generated-MP recursion, generated-DoT immediate detonation, and bonus-action recursion are blocked.
- PvE and PvP use the same coefficients. Existing combat without new unique mechanics remains unchanged.
- Reuse `SURFACE_CARD` and `SURFACE_INSET`; do not add transparent content surfaces or new image assets.
- Do not deploy.

---

## File Map

- `src/adventure/data/v2/v2EquipmentTypes.ts`: catalog-facing Tier 6 mechanic type.
- `src/adventure/data/v2/v2Equipment.ts`: public mirrored type and generated tooltip text.
- `src/adventure/data/v2/v2EquipmentCatalog.ts`: 18 catalog entries.
- `src/adventure/data/v2/buildTags.ts`: automatic tags for new mechanic branches.
- `src/adventure/data/v2/dungeonUniqueDrops.ts`: six depth-specific hunting pools.
- `src/adventure/data/v2/stormExpeditionRewards.ts`: three independent Expedition unique rolls.
- `src/adventure/v2/combat/tier6UniqueEffects.ts`: pure runtime resources, events, commands, recursion metadata, and formatters.
- `src/adventure/v2/combat/engineState.ts`: optional PvE runtime state and replay snapshot shape.
- `src/adventure/v2/combat/engine.ts`, `engine.playerPhase.ts`, `engine.enemyPhase.ts`: PvE hooks and legacy/live parity.
- `src/adventure/v2/combat/engine-pvp.ts`, `engine.pvpPhase.ts`: PvP hooks and state mirror.
- `src/adventure/v2/combat/engine.atb.ts`, `engine.pvp-atb.ts`: resource snapshots on HP-bar log entries.
- `src/app/api/v2/storm-expedition/route.ts`: mint and persist all independent unique results.
- `src/adventure/v2/V2StormExpeditionView.tsx`: exact unique probability preview and multi-drop result.
- `src/adventure/battle/BattleLogList.tsx`: compact resource chips in HP snapshots.
- Tests stay beside each unit; no database migration is needed.

---

### Task 1: Catalog Types, Labels, and 18 Non-Set Items

**Files:**
- Modify: `src/adventure/data/v2/v2EquipmentTypes.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/buildTags.ts`
- Test: `src/adventure/data/v2/v2Equipment.test.ts`
- Test: `src/adventure/data/v2/buildTags.test.ts`

**Interfaces:**
- Produces: `Tier6UniqueMechanic`, `Tier6UniqueSignatureEffect`, `SignatureEffect` branch `{ trigger: "tier6_unique"; mechanic; label }`.
- Produces: 18 stable `V2EquipmentId` keys consumed by Tasks 2–3.

- [ ] **Step 1: Write failing catalog contract tests**

Add arrays for the 12 hunting IDs and 6 Expedition IDs, then assert exact count, Tier 16, unique rarity, `noDrop`, absent `setTags`, copied base stat budget, and expected mechanic.

```ts
const HUNT_T6_UNIQUES = [
  "v2_sky_sig_collapse_armor",
  "v2_sky_sig_antigravity_ring",
  "v2_sky_sig_bloodline_greatsword",
  "v2_sky_sig_scar_counter_gloves",
  "v2_sky_sig_horizon_bow",
  "v2_sky_sig_windless_boots",
  "v2_sky_sig_venom_dagger",
  "v2_sky_sig_corrosion_ring",
  "v2_sky_sig_overload_staff",
  "v2_sky_sig_reverse_gloves",
  "v2_sky_sig_dawn_chalice",
  "v2_sky_sig_unity_cloak",
] as const;

for (const id of [...HUNT_T6_UNIQUES, ...EXPEDITION_T6_UNIQUES]) {
  const item = V2_EQUIPMENT[id];
  expect(item).toMatchObject({ tier: 16, rarity: "unique", noDrop: true });
  expect(item.setTags).toBeUndefined();
  expect(item.signature?.trigger).toBe("tier6_unique");
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/buildTags.test.ts`

Expected: FAIL because the new IDs and `tier6_unique` branch do not exist.

- [ ] **Step 3: Add the discriminated mechanic branch to both public type mirrors**

Define the exact mechanic IDs and numeric fields once in each mirrored type file.

```ts
export type Tier6UniqueMechanic =
  | "gravity_reprisal" | "gravity_feedback"
  | "bleed_burst" | "bleed_aftermath"
  | "pursuit_mark" | "shadow_echo"
  | "venom_burst" | "venom_balance"
  | "arcane_overload" | "arcane_feedback"
  | "sanctuary_reserve" | "mechanic_unity"
  | "shield_conversion" | "gale_circuit" | "status_mana_return"
  | "triphase_link" | "storm_confluence" | "dominant_heart";

export type Tier6UniqueSignatureEffect = {
  trigger: "tier6_unique";
  mechanic: Tier6UniqueMechanic;
  label: string;
};
```

Keep existing legacy properties compatible by defining `SignatureEffect` as the existing legacy shape unioned with `Tier6UniqueSignatureEffect`. Update `signatureLabel` with exhaustive mechanic copy from the approved design; no fallback such as “special effect” is allowed.

- [ ] **Step 4: Add all 18 catalog entries**

Copy exact base `power`, `weight`, `options`, `concept`, and `weaponType` from the mapping in the design spec. Do not copy `setTags`. Use the stable IDs from Step 1 and these names:

```ts
const names = [
  "붕괴성의 흉갑", "반중력 인장", "혈맥 절단검", "상흔의 계수기",
  "지평선 추적궁", "무풍의 잔영화", "독왕의 양면침", "부식의 저울",
  "뇌정 과부하핵", "역류 도체장갑", "새벽 저장성배", "합일의 망토",
  "부유성채의 동력갑", "칼바람의 무한궤도", "귀환뇌명의 반지",
  "삼상 접속장갑", "폭풍 합류의 목걸이", "맥동하는 폭풍심장",
];
```

Each entry receives only its `tier6_unique` mechanic signature plus `rarity: "unique"` and `noDrop: true`.

- [ ] **Step 5: Teach build-tag inference the new mechanics**

Map gravity/shield/sanctuary to tank-heal-shield, bleed and pursuit to physical/crit, venom to poison/dot, overload and mana return to magic/resource, shadow and gale to evasion/speed, and cross/heart mechanics to `signature` plus the axes they actually touch.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/buildTags.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/adventure/data/v2/v2EquipmentTypes.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/buildTags.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/buildTags.test.ts
git commit -m "feat: add tier 6 signature unique catalog"
```

---

### Task 2: Depth-Targeted Sky Rift Unique Drops

**Files:**
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.ts`
- Test: `src/adventure/data/v2/dungeonUniqueDrops.test.ts`
- Test: `src/adventure/data/v2/levelDesignSim.test.ts`

**Interfaces:**
- Consumes: hunting item IDs from Task 1.
- Produces: six `BandUniquePool` entries used unchanged by `rollBandUniqueDrop` and the codex.

- [ ] **Step 1: Write failing depth and probability tests**

```ts
const expected = new Map([
  [73, { chance: 0.00005, ids: ["v2_sky_sig_collapse_armor", "v2_sky_sig_antigravity_ring"] }],
  [74, { chance: 0.00005, ids: ["v2_sky_sig_bloodline_greatsword", "v2_sky_sig_scar_counter_gloves"] }],
  [75, { chance: 0.000075, ids: ["v2_sky_sig_horizon_bow", "v2_sky_sig_windless_boots"] }],
  [76, { chance: 0.000075, ids: ["v2_sky_sig_venom_dagger", "v2_sky_sig_corrosion_ring"] }],
  [77, { chance: 0.0001, ids: ["v2_sky_sig_overload_staff", "v2_sky_sig_reverse_gloves"] }],
  [78, { chance: 0.0001, ids: ["v2_sky_sig_dawn_chalice", "v2_sky_sig_unity_cloak"] }],
]);
```

Assert pool lookup, failure immediately above chance, first/second ID selection, duplicate eligibility, and `chanceMult` application.

- [ ] **Step 2: Run RED test**

Run: `npm test -- src/adventure/data/v2/dungeonUniqueDrops.test.ts`

Expected: FAIL because 73–78 is currently one empty pool.

- [ ] **Step 3: Replace the empty Sky Rift band with six single-depth pools**

Keep existing common armor and depth-78 weapon rolls unchanged. Reuse `rollBandUniqueDrop` so hunt API acquisition, codex recording, feed broadcast, and batch summaries continue through existing paths.

- [ ] **Step 4: Update level-design expectations**

At each Sky Rift depth, assert expected “any unique” wins as `1 / chance` and specific wins as `2 / chance`; do not change other bands.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/adventure/data/v2/dungeonUniqueDrops.test.ts src/adventure/data/v2/levelDesignSim.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/adventure/data/v2/dungeonUniqueDrops.ts src/adventure/data/v2/dungeonUniqueDrops.test.ts src/adventure/data/v2/levelDesignSim.test.ts
git commit -m "feat: add targeted sky rift unique drops"
```

---

### Task 3: Independent Storm Expedition Unique Rolls

**Files:**
- Modify: `src/adventure/data/v2/stormExpeditionRewards.ts`
- Test: `src/adventure/data/v2/stormExpeditionRewards.test.ts`
- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Create: `src/app/api/v2/storm-expedition/route.test.ts`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Test: `src/adventure/v2/V2StormExpeditionView.test.tsx`

**Interfaces:**
- Consumes: six Expedition IDs from Task 1.
- Produces: `StormExpeditionUniqueRule`, `STORM_EXPEDITION_UNIQUE_LOOT`, and `rollStormExpeditionUniqueLoot(routeId, encounterKind, rng, { uniqueChanceMultiplier })`.
- Produces result `{ routeUniqueId, crossUniqueId, heartUniqueId, uniqueIds }`.

- [ ] **Step 1: Write failing pure-roll tests**

Test guardian route success at `<0.0015`, final route at `<0.004`, final cross at `<0.002` with equal two-item selection, and heart at `<0.0005`. Assert non-final encounters never consume cross/heart RNG. Assert multiplier 2 applies to route/cross and not heart.

```ts
expect(STORM_EXPEDITION_UNIQUE_LOOT).toEqual({
  guardianRouteChance: 0.0015,
  finalRouteChance: 0.004,
  finalCrossChance: 0.002,
  finalHeartChance: 0.0005,
});
```

- [ ] **Step 2: Run RED test**

Run: `npm test -- src/adventure/data/v2/stormExpeditionRewards.test.ts`

Expected: FAIL because the unique roller is absent.

- [ ] **Step 3: Implement independent pure rolls**

Use route mapping `wreckage → v2_storm_sig_wreckage_power_armor`, `gale → v2_storm_sig_gale_orbit_boots`, `thunder → v2_storm_sig_thunder_return_ring`; cross pool contains triphase gloves and confluence necklace; heart is the heart necklace. Always return arrays without deduplication or owned checks.

- [ ] **Step 4: Write failing route-handler integration tests**

Mock the unique roller to return all three final IDs. Assert normal mode mints all three, appends them with the ordinary equipment to `pendingEquipment`, claims all on clear, and records all unique acquisitions. Assert practice mode neither rolls nor mints them.

- [ ] **Step 5: Integrate the route handler**

After `rollStormExpeditionLoot`, call the unique roller with `uniqueChanceMultiplier` derived from accepted Storm Contract. Mint every returned ID with `mintRolledEquipInstance`, append to existing `pendingEquipment`, and return `droppedUniqueEquipment: V2EquipInstance[]`. No save schema field is added.

- [ ] **Step 6: Add exact probability and multi-drop UI tests**

Verify guardian preview shows route unique 0.15% (0.3% contracted), final preview shows route 0.4%, cross 0.2%, heart 0.05%, and heart remains 0.05% under contract. Verify result loot rows include ordinary plus all unique drops.

- [ ] **Step 7: Implement the UI using opaque surfaces**

Expose unique rules in `statusBody`, extend `ExpeditionStatus`, and render dedicated “유니크” lines inside the existing `SURFACE_INSET` preview. Pass `[...(droppedEquipment ? [droppedEquipment] : []), ...(droppedUniqueEquipment ?? [])]` to `LootRows`.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `npm test -- src/adventure/data/v2/stormExpeditionRewards.test.ts src/app/api/v2/storm-expedition/route.test.ts src/adventure/v2/V2StormExpeditionView.test.tsx`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/adventure/data/v2/stormExpeditionRewards.ts src/adventure/data/v2/stormExpeditionRewards.test.ts src/app/api/v2/storm-expedition/route.ts src/app/api/v2/storm-expedition/route.test.ts src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx
git commit -m "feat: add storm expedition unique rewards"
```

---

### Task 4: Pure Tier 6 Mechanic Runtime

**Files:**
- Create: `src/adventure/v2/combat/tier6UniqueEffects.ts`
- Create: `src/adventure/v2/combat/tier6UniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Consumes: `SignatureEffect[]` containing `tier6_unique` branches.
- Produces: `Tier6UniqueRuntimeState`, `Tier6UniqueEvent`, `Tier6UniqueCommand`, `initialTier6UniqueRuntime`, `resolveTier6UniqueEvent`, `tier6ResourceSnapshot`.

- [ ] **Step 1: Write failing state and recursion tests**

Cover initial optional state, finite clamping, direct versus generated origins, deterministic command order, and the rule that a command generated by mechanic X cannot re-enter X for the same source event.

```ts
export type Tier6EventOrigin = {
  actionId: number;
  eventId: number;
  generatedBy?: Tier6UniqueMechanic;
  bonusAction?: boolean;
};

expect(resolveTier6UniqueEvent(signatures, state, {
  kind: "signature_damage",
  mechanic: "shadow_echo",
  damage: 450,
  origin: { actionId: 3, eventId: 7, generatedBy: "shadow_echo" },
}).commands).toEqual([]);
```

- [ ] **Step 2: Run RED test**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Define optional runtime state**

```ts
export type Tier6UniqueRuntimeState = {
  gravityReprisal: number;
  pursuitMarks: number;
  shadowEchoes: number;
  arcaneOverload: number;
  sanctuaryReserve: number;
  unityMechanics: Tier6CoreMechanic[];
  galeEvents: Array<"hit" | "crit" | "dodge">;
  heartCounts: Partial<Record<Tier6CoreMechanic, number>>;
  dominantMechanic: Tier6CoreMechanic | null;
  nextDirectDamagePct: number;
  nextHealPct: number;
  nextShieldPct: number;
};
```

Add optional `tier6Uniques?: Tier6UniqueRuntimeState` to `BattleStacks` and `PvPSideStacks`. Initialize it only when at least one new mechanic is equipped, preserving old object shapes otherwise.

- [ ] **Step 4: Implement and test the seven core mechanics**

Use typed events for shield break/gain, direct hit, dodge, MP spent, heal calculated, and HP threshold. Emit commands for fixed damage, DoT consume/reapply, DEF/MDEF debuff, shield/heal/MP, resource changes, and extra actions. Tests must assert the exact approved coefficients: 35%, 20%/5%, 70% plus one bleed, five marks/60%, three echoes/45%, five poison/75% plus half reapply, 100 overload/140%, 30% reserve/35% threshold/60% cap.

- [ ] **Step 5: Implement and test the six Expedition/cross mechanics**

Test shield conversion 10% and double conversion above 20% max HP, three distinct gale events, 8%/16% paid-MP return, triphase resource links, confluence 12% stacks capped at five, and dominant heart lock after the first mechanic to reach three with 35% scaling.

- [ ] **Step 6: Add command and snapshot formatters**

Commands must carry `label`, `mechanic`, and numeric result so adapters do not reconstruct copy. `tier6ResourceSnapshot` returns only non-zero/active fields for log UI.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/adventure/v2/combat/tier6UniqueEffects.ts src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine-pvp.ts
git commit -m "feat: add tier 6 unique combat runtime"
```

---

### Task 5: PvE Combat Integration

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Test: `src/adventure/v2/combat/tier6UniquePve.test.ts`
- Test: `src/adventure/v2/combat/signatureEffects.test.ts`

**Interfaces:**
- Consumes: reducer interfaces from Task 4.
- Produces: live and legacy PvE event adapters; no route-specific logic.

- [ ] **Step 1: Write failing end-to-end PvE tests**

Create deterministic players with one or two new signatures and verify shield break/reprisal, bleed and poison basic-attack detonation, skill accumulation, pursuit, dodge echo, MP overload/refund, sanctuary emergency heal, cross links, extra-action recursion guard, and combat completion under `ATB_ACTION_GUARD`.

- [ ] **Step 2: Run RED test**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePve.test.ts`

Expected: FAIL because engine phases do not emit Tier 6 events.

- [ ] **Step 3: Add action/event origin plumbing**

Increment a combat-local action number on each real player action and sub-event number for each hit. Generated commands carry `generatedBy`; bonus actions set `bonusAction: true`. Do not add IDs to persisted character data.

- [ ] **Step 4: Hook defensive events**

In both enemy basic and enemy skill shield absorption paths, emit `shield_broken` only when shield changes from positive to zero. Route all player shield gains through a small adapter that emits `shield_gained`, ignoring same-origin feedback commands.

- [ ] **Step 5: Hook direct attacks and DoT consumption**

After direct damage and crit are known, emit one event per landed hit. Apply reducer commands through existing `applyV2DotsToTarget`, timed DEF debuff fields, and direct-damage death guards. Basic attacks may consume bleed/poison; skills only accumulate poison as specified.

- [ ] **Step 6: Hook MP spend and healing**

Emit MP events from actual paid cost before refunds. Treat refunded MP as generated. Feed every existing calculated/actual heal site into sanctuary storage and emergency consumption without changing `healToShield` behavior for old signatures.

- [ ] **Step 7: Append structured logs and resource snapshots**

Every command appends one `effect: "extra_damage"` or status/info entry. `engine.atb.ts` HP snapshots include `playerSignatureResources: tier6ResourceSnapshot(state.stacks.tier6Uniques)`.

- [ ] **Step 8: Run PvE and existing signature tests**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/atbSkillCast.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/signatureEffects.test.ts
git commit -m "feat: integrate tier 6 uniques into pve combat"
```

---

### Task 6: PvP Combat Parity

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Test: `src/adventure/data/v2/replayPayload.test.ts`
- Test: `src/adventure/v2/combat/tier6UniquePvp.test.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: Task 4 reducer and Task 5 adapter conventions.
- Produces: symmetric p1/p2 runtime state, commands, and snapshot perspective.

- [ ] **Step 1: Write failing mirrored PvP tests**

Run the same signature on p1 and p2 in swapped fixtures and assert equal damage, resource, MP, DoT, shield, and extra-action outcomes after perspective normalization. Include a two-player chain case and generated-command recursion case.

- [ ] **Step 2: Run RED test**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePvp.test.ts`

Expected: FAIL because PvP phases do not emit Tier 6 events.

- [ ] **Step 3: Mirror defensive and offensive adapters**

Initialize optional runtime state per side, emit the same events and apply the same commands using attacker/defender sides. Do not duplicate coefficients in PvP files; import the pure reducer.

- [ ] **Step 4: Preserve replay perspective**

Include player and enemy resource snapshots on PvP HP bars and swap them in `toPvpReplayPayloadForSide` with HP/MP when perspective is p2.

- [ ] **Step 5: Run focused PvP regressions**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/data/v2/replayPayload.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/battle/engine-pvp.test.ts
git commit -m "feat: mirror tier 6 uniques in pvp combat"
```

---

### Task 7: Resource Chips and Combat Log Readability

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Test: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Test: `src/adventure/data/v2/replayPayload.test.ts`

**Interfaces:**
- Consumes: `Tier6ResourceSnapshot` from Task 4 on optional HP-bar fields `playerSignatureResources` and `enemySignatureResources`.
- Produces: accessible compact chips; old replay entries remain valid.

- [ ] **Step 1: Write failing render and perspective tests**

Render an HP bar snapshot containing gravity, pursuit, echo, overload, sanctuary, unity, gale, and dominant-heart fields. Assert visible Korean labels and values, zero-value omission, mobile wrapping, and p2 replay swapping.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts`

Expected: FAIL because resource snapshot fields are not rendered or remapped.

- [ ] **Step 3: Extend the optional replay shape**

Add optional resource snapshots to only the `hp_bar` variant. Old logs without the fields must follow the exact existing render path.

- [ ] **Step 4: Render compact chips below HP/MP bars**

Use a wrapping row inside the existing opaque `SURFACE_INSET`. Show only active values, use text/icon color rather than container opacity, and provide an `aria-label` containing the full resource name and value.

- [ ] **Step 5: Expand pill colors for mechanic logs**

Give gravity/shield blue, bleed rose, pursuit/gale sky, echo violet, poison emerald, overload amber, sanctuary teal, and heart fuchsia labels while retaining the neutral fallback.

- [ ] **Step 6: Run tests**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/adventure/v2/combat/engineState.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.ts src/adventure/data/v2/replayPayload.test.ts
git commit -m "feat: show tier 6 unique combat resources"
```

---

### Task 8: Full Verification and Balance-Safety Simulation

**Files:**
- Create: `src/adventure/v2/combat/tier6UniqueSafety.test.ts`
- Modify: `docs/superpowers/specs/2026-08-13-tier6-signature-uniques-design.md` only if implementation names differ; functional requirements may not be weakened.

**Interfaces:**
- Consumes: completed Tasks 1–7.
- Produces: release-blocking structural safety checks, not automatic balance nerfs.

- [ ] **Step 1: Add deterministic structural simulations**

Build fixtures for each core unique alone, every documented support pair, 4+2 existing set mixes, and three high-chain combinations. Run at least 500 seeded battles per combination and assert:

```ts
expect(result.actions).toBeLessThan(ATB_ACTION_GUARD);
expect(Number.isFinite(result.finalState.playerHp)).toBe(true);
expect(Number.isFinite(result.finalState.enemyHp)).toBe(true);
expect(result.finalState.log.length).toBeLessThan(10_000);
```

Do not assert a maximum damage ratio; report it for later tuning.

- [ ] **Step 2: Run the focused Tier 6 suite**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/dungeonUniqueDrops.test.ts src/adventure/data/v2/stormExpeditionRewards.test.ts src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/v2/combat/tier6UniqueSafety.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS with no unhandled promise rejection or guard exhaustion.

- [ ] **Step 3: Run broad regressions**

Run: `npm test -- src/adventure/v2/combat src/adventure/battle src/adventure/data/v2 src/app/api/v2/storm-expedition`

Expected: PASS.

- [ ] **Step 4: Run static and asset checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/v2EquipmentTypes.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/dungeonUniqueDrops.ts src/adventure/data/v2/stormExpeditionRewards.ts src/adventure/v2/combat src/adventure/battle/BattleLogList.tsx src/adventure/v2/V2StormExpeditionView.tsx src/app/api/v2/storm-expedition/route.ts`

Run: `npm run check-images`

Expected: all commands exit 0; image check may print pre-existing orphan warnings but no missing reference error.

- [ ] **Step 5: Run production build**

Run: `npm run build`

Expected: Next.js 16.2.11 build completes successfully.

- [ ] **Step 6: Review the final diff for scope and secrets**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat HEAD~7..HEAD`

Expected: only Tier 6 unique, combat, drop, Expedition, UI, tests, and approved docs are present; no deployment files or unrelated working-tree changes.

- [ ] **Step 7: Commit verification additions**

```bash
git add src/adventure/v2/combat/tier6UniqueSafety.test.ts docs/superpowers/specs/2026-08-13-tier6-signature-uniques-design.md
git commit -m "test: verify tier 6 unique combinations"
```
