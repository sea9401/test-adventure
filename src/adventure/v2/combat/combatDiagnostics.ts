import { distributeV2DotTicks, type V2DotTick } from "./combatDots";
/** Local, synchronous opt-in aggregation. Never hold this scope across await. */
export type CombatMetric = "hp_damage" | "resolved_damage" | "healing" | "shield_absorption" | "skill_gate" | "skill_cast" | "survival_restoration";
export type CombatDiagnosticRow = { metric: CombatMetric; source: string; target: string; total: number; count: number };
export type CombatDiagnostics = ReturnType<typeof createCombatDiagnostics>;
let active: CombatDiagnostics | undefined;
const ignoreSkillGate = () => {};

export function createCombatDiagnostics() {
  const rows = new Map<string, CombatDiagnosticRow>();
  return {
    record(metric: CombatMetric, source: string, target: string, value: number) {
      if (!Number.isFinite(value) || value <= 0) return;
      const key = JSON.stringify([metric, source, target]);
      const old = rows.get(key);
      if (old) { old.total += value; old.count += 1; }
      else rows.set(key, { metric, source, target, total: value, count: 1 });
    },
    snapshot: () => Array.from(rows.values(), (row) => ({ ...row })),
  };
}

export function withCombatDiagnostics<T>(collector: CombatDiagnostics | undefined, run: () => T): T {
  const previous = active;
  active = collector;
  try { return run(); } finally { active = previous; }
}

export function recordCombatMetric(metric: CombatMetric, source: string, target: string, value: number): void {
  active?.record(metric, source, target, value);
}

/** HP-bound damage capped at pre-hit HP, before separate survival/restoration effects. */
export function recordCombatDamage(source: string, target: string, hpBefore: number, hpBound: number, shieldAbsorbed = 0): void {
  if (!active) return;
  recordCombatMetric("resolved_damage", source, target, hpBound);
  recordCombatMetric("hp_damage", source, target, Math.min(Math.max(0, hpBefore), hpBound));
  recordCombatMetric("shield_absorption", source, target, shieldAbsorbed);
}

export function recordCombatDotDamage(ticks: readonly V2DotTick[], target: string, hpBefore: number, hpBound: number, absorbed = 0): void {
  if (!active) return;
  for (const tick of distributeV2DotTicks(ticks, hpBound)) recordCombatMetric("resolved_damage", tick.tag, target, tick.damage);
  for (const tick of distributeV2DotTicks(ticks, Math.min(Math.max(0, hpBefore), hpBound))) recordCombatMetric("hp_damage", tick.tag, target, tick.damage);
  recordCombatMetric("shield_absorption", "dot", target, absorbed);
}

/** Per-resolver deduplication, not a final cast counter. No allocation when disabled. */
export function skillGateRecorder(actor?: string) {
  if (!active) return ignoreSkillGate;
  const seen = new Set<string>();
  return (skill: string, reason: string) => {
    const key = JSON.stringify([skill, reason]);
    if (seen.has(key)) return;
    seen.add(key);
    recordCombatMetric("skill_gate", skill, actor ? `${actor}:${reason}` : reason, 1);
  };
}
