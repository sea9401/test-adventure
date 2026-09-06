# Arena query performance

Continue the existing isolated performance branch. Keep the combat speed/balance formulas and existing combat optimization and stage instrumentation.

The arena state and tournament routes already resolve the season but ensureArenaTournament resolves it again (UPDATE + SELECT). Accept an optional request-local resolved season and pass it from both routes. Never cache the season across requests.

Before taking locks, read only the persisted bracket. If its status is completed or not_enough_players, return created=false and processedMatches=0. Both existing freeze and advance functions already return without mutation for these states. Otherwise retain the transaction and re-read under the existing season and tournament locks; an unlocked read must never authorize a mutation. Missing and active tournaments retain self-healing and reward semantics. Read errors propagate.

Alternatives: time-based caching risks delaying matches; removing self-healing risks cron failures. A terminal-state read avoids both. Active tournaments incur one extra SELECT but callers reusing the season save two commands. Completed state requests reduce the observed 11 commands to 6. This is a command-count expectation, not measured production latency.

Tests cover terminal results without transactions, active/missing locked fallback, concurrent completion, season reuse, non-tournament phase, and read errors. No response fields removed, deployment, merge, or push.
