# Coop Session Payload Optimization Design

## Context

The cooperative boss detail screen polls `GET /api/v2/coop/[sessionId]` every
five seconds. The response currently embeds parsed replay payloads for up to ten
recent attacks even though most polls only need session HP, status, participant,
and attack-summary changes. Production samples measured the response at roughly
520 KB per request.

An authenticated attack-detail endpoint already exists at
`GET /api/v2/coop/[sessionId]/attacks/[attackId]`. It can be the single source of
truth for full replay retrieval.

## Goal

Keep cooperative boss status and attack summaries current while removing replay
JSON from the recurring detail poll. Fetch one replay only when the player opens
that attack's battle record.

## Non-goals

- No change to boss combat, rewards, participation, claim rules, or polling
  cadence in this workstream.
- No unauthenticated or cross-session replay access.
- No deployment, production data mutation, or maintenance-mode change.
- No replay-table retention or physical-space reclamation in this workstream.

## Considered approaches

### Keep replay data behind an `includeReplay` query parameter

This preserves one endpoint but leaves two response shapes on a large session
route and makes it easy for future callers to accidentally resume expensive
polling. It also cannot express fetching only one selected replay cleanly.

### Return truncated replay previews

This reduces bytes but still repeats serialization and transfer on every poll.
It also introduces a second replay representation that the UI must understand.

### Use the existing attack-detail endpoint on demand

Selected. The session endpoint returns lightweight attack summaries with stable
attack IDs. The UI requests the existing attack-detail endpoint only after a
player selects a battle record. This gives one authoritative full-replay path and
makes the recurring response size independent of battle-log length.

## API design

`GET /api/v2/coop/[sessionId]` keeps the current session, participant, claim, and
attack-summary fields. Each recent attack keeps its ID, attacker display data,
damage, boss HP transition, and creation time, but no longer contains `replay`.

`GET /api/v2/coop/[sessionId]/attacks/[attackId]` remains the full replay API.
The existing attack-log screen already calls this endpoint when it opens, so no
new client cache or request layer is introduced.

## Client data flow

The detail poll updates the session and lightweight attack list. Every returned
attack ID represents a persisted attack-log row, so its row remains an enabled
link. Selecting it navigates to the existing attack-log screen, which shows its
current loading and retry states while fetching the full replay.

## Compatibility and error handling

- The session route remains authenticated and continues enforcing participant or
  public-view visibility rules.
- The attack-detail route performs its current session/attack ownership checks.
- Missing, expired, malformed, or inaccessible replays produce the existing
  attack-detail error contract and do not poison the cache.
- Poll failures and replay-load failures remain independent.

## Testing

- A route test proves session responses contain attack summaries without a
  replay field and do not parse replay JSON.
- Attack-detail route tests continue proving authorized full-replay retrieval and
  access denial.
- A detail-view test proves recent attack rows remain enabled and navigate by
  attack ID without an embedded replay.
- Existing attack-log view behavior continues to provide loading, not-found, and
  retry states for the on-demand request.
- Focused tests run red then green, followed by TypeScript, lint, full Vitest,
  production build, module budgets, and `git diff --check` at the final gate.

## Rollout and observability

After deployment, compare the normalized cooperative-session route's average
response bytes and request latency with the pre-change sample. The expected
steady-state response should contain no replay-sized payload; full replay traffic
should move to the attack-detail operation and occur only on user interaction.
