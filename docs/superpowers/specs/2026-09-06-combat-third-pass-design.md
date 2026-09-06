# Third-pass combat diagnostics and controlled build comparison

User approved finishing missing diagnostics, distinguishing committed casts from
selector evaluations, and comparing representative builds. Work locally on the
existing isolated branch; no deployment, production reads, balance changes or
subagents. AGENTS authorizes continuous local implementation and commits.

Use the existing opt-in calculation-site collector. Replay-string parsing loses
numeric semantics; action-level HP differences lose simultaneous healing, so
neither is suitable as an authoritative damage source. Add missing hooks to
reflection, delayed sword-shadow release, unique-equipment commands and recovery
paths, with literal fixtures. Survival HP restoration is a separate metric from
ordinary healing. Audit uncovered special paths and keep completeness false
unless every pathway is verified; do not infer coverage from passing tests.

Count actual skill casts at the structured committed-cast boundary used by both
engines, before optional log retention. Resolver selections remain a separate
metric and may outnumber casts when internal calculations rerun.

Build representative venom six-piece and five-piece-plus-venom-burst-unique
snapshots from the real catalog and existing pure growth/derive pipeline. Fix
career wins, growth seed, enhancement level and skills, and vary only weapon.
Compare paired combat seeds against fixed PvE targets and a fixed PvP opponent.
Report inputs, revisions, flags, outcomes and limitations. These are controlled
catalog examples, not the original complainant's unavailable character save or
a universal balance verdict. Do not access operational accounts to fill gaps.
