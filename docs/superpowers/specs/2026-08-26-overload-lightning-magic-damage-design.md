# Overload Lightning Magic Damage Design

## Context

`뇌정 과부하핵` grants one overload per MP actually spent and fires `과부하
낙뢰` for 140% of the player's magic attack whenever overload reaches 100.
The reducer currently emits every Tier 6 signature attack as `damage_fixed`.
Both adapters therefore subtract the lightning amount directly from HP without
checking magic defense or ordinary damage-reduction layers.

The equipment and original feature specification describe the proc as a
magic-attack-scaled lightning strike, not fixed damage. Other mechanics that
are intentionally fixed explicitly say so.

## Goal

Treat only `과부하 낙뢰` as guaranteed-hit magic damage. Its raw amount remains
`floor(magicAtk * 1.4)` per 100 overload, but defensive layers reduce the amount
before HP is lost.

## Scope

- Change the overload command from fixed damage to a distinct magic-damage
  command.
- Preserve every other Tier 6 signature damage command as fixed damage.
- Preserve overload gain, multiple threshold triggers, feedback MP refund,
  status refund, dominant-heart scaling, and recursion guards.
- Clarify the equipment mechanic copy by naming the result as magic damage.
- Do not deploy, change maintenance state, or alter unrelated combat balance.

## Damage model

### Shared command

The pure Tier 6 reducer emits `damage_magic` with the pre-mitigation amount.
The command is not a skill cast: it cannot miss, crit, consume an action, or
trigger direct-hit and skill-cast effects. It does not receive skill-specific
damage bonuses. Its defensive classification is magic.

A pair of small pure helpers accepts primitive values and applies the common ordering:

1. clamp raw damage and effective magic defense;
2. apply the existing player-to-target `damageBetween` magic-defense formula;
3. apply ordinary damage-taken reduction when the target supports it; and
4. separately apply the surface damage multiplier, such as the arena multiplier,
   after any adapter-specific ward layer.

Each positive stage retains the existing one-damage floor.

### PvE

The PvE adapter derives enemy magic defense from `enemy.magicDef`, falling back
to `enemy.def`. Active Tier 6 magic-defense debuffs and the attacker's permanent
magic-defense reduction use the same capped reduction formula as direct magic
skills. The resulting damage is then removed from enemy HP.

PvE monsters currently have no general direct-damage reduction layer separate
from defense, so no new monster-only reduction field is introduced.

### PvP

The PvP adapter applies the same effective magic-defense calculation, followed
by the defender's existing general damage-taken reduction and the battle's
damage multiplier. The strike also follows the existing hostile magic damage
defenses in this order:

1. magic barrier partitions the raw strike;
2. body damage passes through magic defense and general reduction;
3. triple-ward stability and then the magic ward may reduce the body result;
4. the PvP or arena damage multiplier applies;
5. the ordinary combat shield absorbs remaining HP-bound damage; and
6. existing berserker and endurance survival handling runs.

This keeps the guaranteed proc behavior while making defensive magic and
damage-reduction builds effective against it.

## Cross-mechanic accounting

`삼상 접속장갑` stores 10% of damage caused by overload lightning. Because the
reducer cannot know the target's defenses, overload no longer records that link
from its raw command amount. After an adapter resolves the actual damage, it
feeds the applied amount back through the existing signature-damage link event.
Consequently sanctuary storage and subsequent cross-mechanic effects use the
post-mitigation damage rather than the raw 140% value.

## Logging and copy

Combat logs identify the result as `마법 피해`, while fixed signature attacks
retain `추가 피해`. Existing magic-barrier, ward, shield, and survival logs keep
their established behavior where the adapter already exposes them.

The item mechanic copy becomes `MP 100 소모마다 마법공격력 140%의 마법 피해를 주는
과부하 낙뢰`.

## Verification

Regression tests must prove observable outcomes:

- the pure reducer emits `damage_magic` for overload and still emits fixed
  damage for unrelated mechanics;
- a high-magic-defense PvE enemy takes less overload damage than a zero-defense
  enemy;
- PvE magic-defense reduction affects the result exactly once;
- PvP magic defense, general damage reduction, and arena scaling all lower the
  result in the documented order;
- PvP magic barrier, triple ward, and combat shield intercept the strike;
- multiple 100-overload thresholds still produce multiple strikes and feedback
  refunds; and
- cross-mechanic sanctuary storage uses actual post-mitigation damage.
