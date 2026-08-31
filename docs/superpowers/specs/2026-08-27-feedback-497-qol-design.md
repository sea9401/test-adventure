# Feedback #497 Convenience Improvements Design

## Goal

Address all four requests in feedback #497 without changing combat balance:

1. Keep hunting-ground visibility settings across devices.
2. Show guild dining effects and their remaining time alongside cooking food effects.
3. Show SP costs for inspectable job skills in the advancement roadmap.
4. Let combat patterns compare poison and bleed by remaining damage-trigger count as well as stacks.

No deployment is part of this work.

## Hunting-ground visibility sync

Keep the current immediate UI behavior and local cache. Add a versioned server save key and an authenticated GET/PATCH endpoint dedicated to dungeon-theme visibility.

On mount, the client applies the locally cached hidden theme start depths, then requests the server setting. If the server has a setting, it becomes authoritative and refreshes the local cache. If no server setting exists, the client seeds it with the local value. A local edit made while the request is in flight must not be overwritten by the late response.

Normalize persisted values to unique non-negative integer theme start depths. The UI ignores identifiers that do not correspond to a current theme. A network failure leaves local behavior intact and does not block changing the setting.

## Guild dining effect display

Extend the main character-state response with an optional `activeGuildDiningEffect`. Build it from the existing weekly guild dining user save using the same week, guild, and expiry normalization as the dining hall. Return only an unexpired effect and include its menu name, effect kind, bonus percentages, and expiry.

Display the effect in the compact character summary beside the existing cooking food and adventure-support effects. Selecting it opens the same style of opaque detail card and shows:

- the dining menu name;
- the hunt, life, or combined experience bonus;
- a live remaining-time label;
- the absolute expiry time.

When the effect expires while displayed, remove its summary badge and close its detail card. This is a presentation change only; existing guild dining reward calculations remain authoritative and unchanged.

## Advancement roadmap SP costs

Keep the current inspection gate: skill details are visible for the current job, previously visited jobs, and unlocked jobs, while locked unvisited jobs remain hidden.

Within each inspectable representative-skill detail, show `SP n` using the existing `spCostOf` calculation. Add the chip in the roadmap detail rather than globally changing `SkillEffectChips`, avoiding duplicate SP labels on the learn and loadout screens.

## Combat-pattern remaining-count conditions

Extend `enemy_status` conditions with a metric that distinguishes `stacks` from `remainingTurns`. Missing metrics in old saved patterns normalize to `stacks`, preserving all existing behavior.

The UI offers the following operations:

- poison and bleed: stack at least, stack at most, no stacks, remaining count at least, remaining count at most, and no remaining count;
- magic vulnerability and frost chill: the existing stack operations only.

"Remaining count" means the number of future DoT damage triggers. An inactive DoT has zero remaining triggers. Values are normalized to bounded non-negative integers.

Extend the shared pattern evaluation context with enemy poison and bleed remaining turns. PvE and PvP engines populate these fields from their authoritative active DoT records before evaluating a player pattern. Condition evaluation selects either stacks or remaining turns according to the normalized metric.

## Compatibility and failure handling

- Existing dungeon visibility local values remain usable and seed a new server preference only when the account has no saved value.
- Malformed or obsolete dungeon identifiers are ignored.
- Expired or malformed guild dining effects are omitted from character state.
- Existing combat patterns without a metric remain stack-based.
- Unknown or unavailable remaining-count values evaluate as zero.
- No combat damage, DoT duration, guild bonus, job unlock, or SP-cost formula changes are included.

## Verification

Add regression coverage for:

- visibility endpoint authentication, normalization, read, and write behavior;
- client local/server synchronization, first-time seeding, and in-flight edit protection;
- active and expired guild dining effects in character state;
- compact summary badge, details, countdown, and expiry removal;
- roadmap SP costs for inspectable jobs and continued hiding for locked unvisited jobs;
- backward normalization of old stack-based pattern conditions;
- poison and bleed remaining-count comparisons for at least, at most, and none;
- PvE and PvP pattern selection using authoritative remaining DoT turns.

Run the focused Vitest suites, TypeScript checking, and linting before completion. Do not deploy.
