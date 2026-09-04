# Independent Skill Action Logs Design

## Goal

Every successful active-skill cast must render as exactly one independent battle action, even when the skill deals no direct damage. Its damage, recovery, shield, buff, debuff, status, and triggered effects remain inside that action card.

## Scope

- PvE player casts
- PvE monster casts in both ATB and legacy combat paths
- PvP casts for both sides
- Battle-log grouping and rendering
- Regression coverage for utility-only and ordinary damaging skills

Passive effects, equipment triggers, periodic status damage, and other reactions do not become skill action cards unless an active skill cast caused them.

## Audit Findings

The current renderer recognizes an action mainly from `player_attack` or `enemy_attack` text containing `!`. Damage, actual healing, mana recovery, guaranteed evasion, and iron-wall reflection usually produce such a row. The following successful casts can produce only `info` rows and therefore be attached to an earlier action or shown without an action card:

- shield-only skills such as 버티기, 결계, and 마나 보호막;
- pure stat and derived-stat buffs such as 함성 and 철포;
- DoT-only and debuff-only attacks, especially monster skills;
- pure hostile debuffs such as 봉마진;
- regeneration and combined utility skills;
- full-HP heals whose calculated cast produces no actual healing row;
- declaration, provoke, ward-refresh, and similar metadata-driven skills.

## Considered Approaches

1. Recognize specific Korean log text in the UI. This is small but couples rendering to every current skill effect and will miss future effects.
2. Promote the first effect row of each utility skill to an attack row. This avoids a new row but requires every engine branch to coordinate which effect is first and still fails when a cast has no visible numerical effect.
3. Add an explicit skill-cast marker and let the renderer merge it with an existing result row. This creates a stable engine-to-UI contract, covers zero-effect casts, and is independent of localized effect wording.

Approach 3 is selected.

## Data Contract

`BattleLogEntry` gains optional `skillCast` metadata containing the cast skill ID and display name. A successful cast emits one `info` marker before any cast effects. The marker carries the normal actor metadata (`turn`, and `side` where applicable) through existing ATB/PvP tagging.

The marker is presentation metadata. It must not count as a direct hit, status effect, or damage source and must not affect combat calculations.

## Rendering

`groupBattleLogActions` starts an action card when it sees a skill-cast marker. If a normal action result for the same skill follows, that result replaces the marker as the card headline while keeping already collected calculations and effects. Multi-hit damage continues to merge under the resulting headline. If no normal result follows, the synthesized `<skill>!` headline remains and effect rows provide the visible result.

Starting a new skill-cast marker always flushes the previous action, so several fast utility casts within one ATB display window remain separate.

## Testing

- A marker followed by shield information renders one 버티기 action card.
- A 명상 result followed by a later 버티기 marker renders two cards, not one combined card.
- A marker followed by a normal damaging result merges into one card, preserving multi-hit behavior.
- Representative PvE player, PvE monster, and PvP successful casts emit markers.
- Existing battle-log and combat suites remain green.

## Compatibility

Existing stored logs without `skillCast` continue through the legacy heuristics unchanged. New logs use the explicit contract. No database migration is required because battle-log entries are JSON-compatible and the field is optional.
