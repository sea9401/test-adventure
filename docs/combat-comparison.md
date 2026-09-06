# Local combat comparison

This tool compares explicit derived combat snapshots. It does not load player
accounts, connect to a DB, change equipment, tune balance or deploy anything.

```bash
env NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx tsx scripts/compare-combat-builds.ts scripts/fixtures/combat-comparison.example.json
```

Set these three flags to the environment being investigated, not blindly to the
example values. The example is synthetic: B merely has higher attack. It is not
an equal-investment equipment comparison or evidence for buffing any class.

## Input

The file contains `trials` (1–1,000), unsigned 32-bit `seedBase`, 2–8 named
`builds` with derived `PlayerCombat` snapshots and optional `skills`, and a
`target`. PvE target: `{kind: "pve", monster, context?}`. PvP target:
`{kind: "pvp", player, skills?, damageMultiplier?, sustainMultiplier?}`.
Use matching content multipliers when comparing arena/friendly/boss behavior.
PvE context supports boss/depth/turn-limit/skill-force/damage-meter options but
does not accept arbitrary callbacks. Both modes use automatic basic action
selection plus supplied active skill configuration; they do not consume potions.

For gear comparisons, first derive A and B with the existing pure combat derivation
using the same level, profession, allocations and mastery; vary only the intended
equipment/skill choices. Feed the resulting snapshots to this tool. It deliberately
does not infer or fabricate a player's unavailable settings.

## Output and reproduction

The report includes Git revision, dirty-worktree marker, algorithm version,
effective runtime flags, input snapshots and every seed's outcome/turns/remaining
HP. Each build starts each trial with the same seed and independent copies.
Different actions consume different numbers of random values: paired starting
streams do not guarantee event-by-event paired rolls.

Reproduce with the same source/data revision, flags and `report.input`; use a
clean committed tree for durable records. Dirty reports are exploratory and cannot
be recreated from HEAD alone. The CLI attaches the current revision automatically.
For one detailed replay, call `resolveBattle` or `resolveBattlePvP` with matching
inputs, `random: seededCombatRandom(run.seed)` and `logMode: "full"`.

Remaining HP is not cumulative damage/healing. PvP draws include timeout/guard
cases without classifying their cause. Optional diagnostic aggregates are
available as described below; they do not cover every special-effect pathway.

## Optional diagnostics (second through fourth passes)

Set `diagnostics: true` in the input JSON, or use:

```bash
env NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx tsx scripts/compare-combat-builds.ts scripts/fixtures/combat-diagnostics.example.json
```

This synthetic example differs only in starting MP: build B has zero. It tests
the explanation mechanism, not equipment balance. The default remains disabled;
normal API responses and replay entries are unchanged. Each trial adds compact
`diagnostics` rows (`metric`, `source`, `target`, `total`, `count`). No event list
is retained and no additional random rolls are performed for diagnosis.

Metric definitions:

- `resolved_damage`: damage routed to HP after the instrumented mitigation and
  shields, before overkill clamping. Not pre-mitigation damage.
- `hp_damage`: the above capped at pre-hit HP, before survival restoration.
  This is damage, not final net HP loss; recovery/restoration are separate rows.
- `healing`: actual capped recovery at the listed recovery sites, not overheal.
- `survival_restoration`: HP restored/preserved above the nonnegative incoming
  HP result by instrumented berserker/endurance guards. Separate from healing;
  coverage is partial, so it does not make every damage total a net HP ledger.
- `skill_cast`: committed casts at the shared cast-log boundary, even when log
  retention is disabled. Source is the skill ID and target is the casting actor.
- `shield_absorption`: actual intercepted damage, not shield creation, expiry,
  or mana-barrier durability spent. Mana shields intercept before body mitigation,
  so adding this to post-mitigation damage is not a raw-damage reconstruction.
- `skill_gate`: observed selector evaluations. Source is a skill ID (or a role/
  alternate-pair label for a failed pattern condition); target is `actor:reason`.
  Reasons include `mp`, `cooldown`, `condition`, `proc`, `resource`, `effect`,
  `inactive`, `selected`. Standalone resolver calls without an actor omit that
  prefix. Repeated checks of the same reason deduplicate within one evaluation.

`selected` is NOT a final cast counter: forced/modified skill calculations can
evaluate more than once per action. Lower-priority candidates skipped by short
circuiting are not retroactively evaluated. A cooldown reason uses the actual
post-tick cooldown. No claim is made about a gate that was never reached.

Current calculation-site coverage:

- PvE/PvP primary basic attacks; direct player skill hits by skill ID, including
  multi-hit skills; PvE enemy direct-hit path (`enemy_direct`). Basic damage is
  the existing basic-action bundle, including bonuses folded into that damage.
- Tagged poison/bleed/burn ticks in legacy PvE, ATB PvE and PvP. DoT HP totals
  are proportionally allocated with the engine's integer remainder policy.
- PvE helper-based extra/counter damage (`extra`), not all special-effect damage.
- Periodic `regen`, primary-hit lifesteal and bloodfeast, and direct active-skill
  healing. Other healing paths are not implied by these categories.
- Normal/mana shields on the primary instrumented hits and mana shields on DoTs.
- Tier6 unique fixed/magic damage and capped healing, including venom burst.
- PvE/PvP sword-shadow delayed damage and on-hit reflection; PvE rune/martial
  counters; PvP helper extra attacks. Shadow handling now has its own module.
- PvE enchantment/passive regeneration and skill regeneration. Periodic PvE
  recovery now has its own module with existing exports preserved.
- Dodge reflection and PvP rune/martial/dodge counters; actual capped potion,
  evasion-action, dodge, extra-hit lifesteal, skill-regen and bleed-tick recovery.
- Enemy active-skill damage, reflection and self-healing in legacy and ATB PvE.
- Berserker hostile-damage helpers and standard manual endurance sites in
  basic attacks, skills, DoTs and reflection across legacy PvE, ATB PvE and PvP.

The report explicitly says `diagnosticCoverage.complete: false`. Remaining paths
include special effects such as PvP freeze burst, boss-specific HP damage/reset
paths, HP costs and maximum-HP transforms. AP adapters currently receive empty
fired-skill lists; they were audited, not reactivated or counted as covered.
Tier6 command coverage does not imply every other gear family. Missing
rows mean zero OR an uncovered path, not proof that an effect failed. These
partial sums must not be used as a complete combat balance verdict. Use the
full replay and coverage list together when investigating an individual case.

### HP reconciliation

Diagnostic trials also include `hpLedger` for both sides (`player`/`enemy` in
PvE, `p1`/`p2` in PvP). Each entry reports input `initialHp`, actual `finalHp`,
`damage`, `healing`, `survivalRestoration`, `expectedHp`, `residual` and `balanced`.

`expectedHp = initialHp - damage + healing + survivalRestoration`;
`residual = finalHp - expectedHp`. Expected HP is deliberately not clamped, so
duplicate damage is not hidden at zero HP. `balanced` permits floating-point
roundoff up to 1e-7. Shield absorption and resolved damage are not counted again.
Missing recovery and duplicate damage are independently tested as discrepancies.

The baseline is the supplied input HP, not a captured post-initialization HP.
Initial HP transformations, HP costs and boss resets require explicit adjustment
support before using this ledger for those cases. A residual can mean incomplete
instrumentation, not necessarily a gameplay bug. Zero residual can hide offsetting
omissions and is not proof of exhaustive coverage. Normal comparisons omit it.

## Catalog venom loadout probe

```bash
env NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx tsx scripts/compare-venom-loadouts.ts
```

No env files, DB or live account data are loaded. Both examples use the pure
progression builder: LUK, depth 84, 500,000 career wins, cultivation enabled,
growth seed 20260906 and all gear +12. Both retain the same automatically chosen
LUK skills (not a player's custom pattern). Only the weapon changes from
`v2_storm_venom_dagger` to `v2_sky_sig_venom_dagger`. Their catalog base power and
options match; derived differences from losing six-set and gaining the unique
are intentional. This is not a claim about equal market prices.

Each pair uses 100 seeds starting at 20260906. Targets are the first catalog
monster at depth 84, an explicitly synthetic sustained probe of that monster
(HP ×100, ATK 1, other fields unchanged), and one fixed INT progression opponent.
PvE is capped at 200 engine turns; neither actor gets potions. The synthetic
probe is not a production boss or a measured raid result. The default PvP
multipliers are not a reconstruction of a particular friendly match.

The compact CLI report includes revision/dirty marker, progression, derived
loadouts, targets, flags and mean metrics. Rebuild cases at that clean revision
for the per-seed `compareCombatBuilds` report. Outcome and remaining HP are
authoritative for these simulations; partial metric sums are not universal DPS.

## Venom sensitivity matrix

```bash
env NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx tsx scripts/compare-venom-matrix.ts
```

This reuses the same progression/loadouts and sustained synthetic target, varying
only three selection patterns, physical defense 0/1000 and engine turn limits
20/120: 12 conditions × two builds × 100 paired seeds = 2,400 battles.

- `auto`: shared automatic LUK skill selection.
- `basic_only`: basic actions only, retaining the same learned/passive skills.
- `poison_cycle`: basic attack at five or more poison stacks; otherwise select
  learned `v2c_blackmoon_flurry`, subject to normal skill gates.

Both builds use the same pattern, not a separately optimized pattern. The unique
weapon consumes poison, so the same rule can produce different cast counts.
The target has HP 19,954,100 and ATK 1; other catalog fields remain except the
explicit defense/name overrides. It is not a real boss or a friendly PvP match.
The report includes flags, targets, mean net target HP loss, casts, poison/burst
damage, timeout counts and HP-ledger discrepancy counts. Engine turn limits are
not wall-clock seconds; timeouts are not actor deaths. The original three-case
probe remains unchanged. Record clean-revision results, not dirty exploratory
runs, before drawing a conditional conclusion.

## Engine contracts

- Full replay is still the default. Existing golden logs were not regenerated.
- Summary mode retains events during an action because boss mechanics read those
  event deltas. Completed history is released at the next outer loop boundary;
  final replay log is empty. `pickAction` must not depend on earlier log history
  in this mode. This is bounded retention, not zero event allocation.
- Offline hunt requests summary mode; online single/batch replays remain full.
- RNG scoping is synchronous and restores nested scopes with `finally`. Never
  add `await`/yield to an engine while relying on this scope. Public `resolveBattle`
  and `resolveBattlePvP` establish it; internal low-level helpers do not.
- Without an injected RNG, the existing Math.random stream and call order remain
  unchanged. No live seed persistence or historical replay backfill was added.
- Pure DoT helpers moved to `combatDots.ts`; `combatShared.ts` preserves exports.
  Shared hit distribution is in `hitDistribution.ts`, avoiding an import cycle.

## Local performance probe (2026-09-06)

ATB, player HP 1,000,000 / ATK 30 / DEF 10 / SPD 20,000 / 3 attacks;
target HP 10,000,000 / ATK 1 / DEF 5 / raw SPD 6. Seven batches of 20 battles
per mode with seeds 0–19, median per-battle wall time:

| Mode | Median ms | Returned log entries |
| --- | ---: | ---: |
| Full | 30.27 | 1,549 |
| Summary | 22.02 | 0 |

This synthetic long-fight case was about 27% faster, not an operational average.
Action callbacks saw up to 1,542 prior entries in full mode versus zero in summary;
events still exist during each action. Production benefit depends on whether the
offline path is enabled and actual fights. No production measurements or settings
were changed during this task.
