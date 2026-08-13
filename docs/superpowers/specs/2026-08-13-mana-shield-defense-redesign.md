# Mana Shield Defense Redesign

## Goal

Make the tier-2 mage passive `마나 실드` a dependable defense for fragile
caster builds without turning current MP into a second health bar or changing
the ordinary shield system. Intelligence and maximum MP investment must both
improve the result, and the mechanic must remain understandable in combat UI,
logs, skill text, and the manual.

## Scope

- Change only the passive mana shield activated by `v2c_caster_acumen`.
- Preserve ordinary shields, their formulas, and their existing damage-source
  coverage.
- Cover hostile direct damage, damage-over-time ticks, reflected damage,
  counterattack damage, and ordinary hostile status damage.
- Do not cover damage explicitly classified as fixed, execution, shield-
  bypassing, self-inflicted, or an HP cost.
- Do not consume current MP, regenerate mana-shield durability, or recalculate
  its combat-start values during a battle.
- No database or save migration is required.

## Combat-Start Stats

Use final combat-start INT and maximum MP. Define:

```text
effectiveInt = max(0, floor(INT) - 15)

maxDurability = floor(maxMP * 0.60 + effectiveInt * 2)
```

If `effectiveInt` or maximum MP is zero, the passive produces no mana shield.
The current and maximum durability start at `maxDurability` and remain based on
this snapshot for the entire battle. Current MP is irrelevant.

The share of pre-defense hostile damage assigned to the mana shield is:

```text
PvE absorbPct = 45% * effectiveInt / (effectiveInt + 250)
PvP absorbPct = 30% * effectiveInt / (effectiveInt + 250)
```

The reduction applied only to durability cost is:

```text
PvE efficiencyPct = 30% * maxDurability / (maxDurability + 1,500)
PvP efficiencyPct = 20% * maxDurability / (maxDurability + 1,500)
```

These are asymptotic caps, not immediately reachable flat bonuses. INT raises
the portion stopped per damage event and also contributes to durability;
maximum MP primarily raises durability and, through it, durability efficiency.

## Damage Partition and Ordering

For an eligible hostile damage event, partition the non-negative integer
pre-defense damage into two channels:

```text
targetShielded = floor(rawDamage * absorbPct / 100)
bodyRaw = rawDamage - targetShielded
durabilityCostRatio = 1 - efficiencyPct / 100
```

With sufficient durability, the mana shield prevents `targetShielded` HP
damage and spends `ceil(targetShielded * durabilityCostRatio)` durability.
With insufficient durability, it prevents only the greatest integer damage
amount affordable by the remaining durability. Durability reaches exactly
zero, and the rest becomes unmitigated spill damage. This prevents a
one-durability shield from granting a full-event reduction.

The two channels then resolve as follows:

```text
mana channel: raw share -> mana-shield efficiency -> durability
body channel: raw share -> existing defense/evasion/source mitigation
HP-bound direct damage: mitigated body + mana spill -> ordinary shield -> HP
```

Defense, magic defense, and evasion never reduce the mana channel or its
durability cost. Ordinary shields retain their current rules and do not gain
DoT, reflection, counterattack, or status-damage coverage. For eligible direct
damage, an ordinary shield may absorb the HP-bound body damage and any spill
from a depleted mana shield.

Damage already declared fixed, execution, shield-bypassing, self-inflicted, or
an HP cost skips mana-shield partitioning entirely and retains its existing
behavior.

## Shared Engine Boundary

Keep the new math in pure shared combat helpers rather than duplicating it in
PvE, PvP, DoT, reflection, and counterattack branches. The helpers have three
responsibilities:

1. Derive combat-start durability, absorb percentage, and efficiency percentage.
2. Partition an eligible raw damage event and settle durability, absorbed
   damage, spill damage, and the destroyed transition.
3. Make bypass classification explicit at each damage application site.

PvE and PvP consume the same helpers with their respective caps. Engine state
stores maximum/current durability and the snapshotted percentages. Optional
fields remain tolerant of older replay payloads and test fixtures; absence of a
mana shield must preserve the pre-change combat result.

## UI, Logs, and Manual

Retain the existing opaque UI surfaces and violet mana-shield durability bar.
Add the following combat-detail values when the passive is active:

- `마나 실드`: combat-start maximum durability
- `마나 실드 흡수율`: percentage of pre-defense eligible damage assigned to
  the mana channel
- `마나 실드 경감률`: reduction to durability cost for the assigned damage

The matchup summary must stop presenting mana shield as another multiplier
after defense/evasion. It instead explains that the displayed absorb percentage
is partitioned from pre-defense damage and that body damage receives the normal
defensive calculations.

Use logs that distinguish HP damage prevented from durability spent:

```text
[마나 실드] 피해 250 차단 · 내구도 200 소모 (남은 1,300)
[마나 실드 파괴] 내구도가 모두 소진되었다.
```

The skill description and combat/stat manual pages must state the formulas,
damage categories, bypass categories, current-MP behavior, combat-start
snapshot, ordinary-shield relationship, and PvE/PvP differences.

This establishes a documentation rule for future complex skills: when an
effect has a cap, formula, damage-category exception, ordering dependency,
resource snapshot, or PvE/PvP split that materially changes player decisions,
the manual must document it instead of relying only on a short skill tooltip.
As a bounded follow-up, the implementation plan will include producing an audit
list of existing skills that meet these criteria. Updating unrelated skill
balance is outside this design; missing manual explanations can be handled as a
separate documentation pass.

## Compatibility and Failure Safety

- Clamp raw damage, durability, absorb percentage, and efficiency percentage to
  safe non-negative ranges; percentages cannot exceed their mode cap.
- Use integer rounding explicitly so PvE and PvP results are deterministic.
- A missing new optional combat field falls back safely instead of breaking old
  replay rendering.
- A mana shield with zero durability or zero absorb percentage is inert.
- A damage event marked as bypassing the shield never consumes durability.
- No current MP, ordinary-shield value, character save, or database row is
  mutated by the new derivation itself.

## Verification

Write regression tests before engine changes for:

- the INT threshold, durability formula, growth curves, and PvE/PvP caps;
- sufficient, insufficient, one-point, and zero durability settlement;
- durability efficiency rounding and exact zero depletion;
- defense/evasion independence of the mana channel;
- direct damage with and without an ordinary shield;
- PvE and PvP parity apart from configured caps;
- DoT, reflection, counterattack, and ordinary status damage coverage;
- fixed, execution, shield-bypass, self-damage, and HP-cost exclusions;
- unchanged combat results when no mana shield is present;
- combat log, stat panel, matchup summary, skill description, and manual text;
- old replay/fixture rendering when new optional fields are absent.

Run focused tests first, followed by type checking, lint for changed TypeScript
files, the complete test suite, and the project-specific production build.
