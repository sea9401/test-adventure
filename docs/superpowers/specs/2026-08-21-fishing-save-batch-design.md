# Fishing Save Batch Design

## Context

One successful fishing reel currently performs separate `FOR UPDATE` reads and
upserts for session, anti-macro, activity guard, streak, stock, progression,
character, proficiency, codex, daily challenges, wallet, and workshop state.
Production samples measured about 55 database statements per successful reel
after all supporting systems are included.

The shared `lockSavesForUpdate` and `upsertSaves` primitives already provide
deterministic multi-key locking and one-statement final writes.

## Goal

Reduce reel-owned `saves_kv` round trips without changing catch judgment,
anti-abuse state, rewards, lock safety, or response data.

## Design

The transaction keeps the existing user-row activity lock. It then loads saves in
coherent lock groups:

1. Fishing activity group: session, anti-macro, activity guard, streak, stock,
   and fishing progression. These keys are only mutated by life/fishing flows
   that use the same user activity lock, so sorted multi-key locking is safe.
2. Character/proficiency group after the dining-effect operation, preserving the
   current cross-domain order.
3. Codex remains at its current point after repeat-quest rollover.
4. Daily challenge and wallet are locked together in sorted order after title
   handling, matching challenge-claim ordering.
5. Workshop remains at its current late point.

All reel-owned changes are accumulated in a request-local object and flushed with
one `upsertSaves` call. Failed catches flush the consumed session, anti-macro,
guard, and reset streak before returning. No-session, stale-session, and
auto-active exits perform no writes.

Supporting helpers that write their own domain tables or saves—life-field
progress, dining effects, repeat quests, titles, referrals, and codex mastery—keep
their existing transaction behavior.

## Error and concurrency behavior

- Session consumption remains atomic with every success or failure state change.
- A thrown downstream error rolls back the final save batch and all supporting
  writes together.
- Each touched save version increments once, matching the previous final-state
  semantics.
- Missing keys continue to use the same parser fallbacks.

## Testing

- Existing real-route fishing tests continue to verify rewards and state.
- The save mock records multi-key locks and bulk writes.
- A successful catch proves one reel-owned bulk write contains every changed key.
- A failed catch proves one bulk write contains exactly the consumed-session and
  anti-abuse/streak changes.
- Stale and auto-active exits prove no reel-owned bulk write occurs.
- Focused tests, TypeScript, lint, and `git diff --check` gate the change.
