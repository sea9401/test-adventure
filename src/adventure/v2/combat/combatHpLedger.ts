import type { CombatDiagnosticRow } from "./combatDiagnostics";

export type CombatHpBaseline = { target: string; initialHp: number; finalHp: number };

/** Diagnostic accounting only: a zero residual is not a coverage guarantee.
 * Costs, max-HP transformations and boss resets need their own adjustment model.
 * Never clamp expected HP: it would hide duplicate overkill/recovery records.
 */
export function reconcileCombatHp(rows: readonly CombatDiagnosticRow[], baselines: readonly CombatHpBaseline[]) {
  const targets = new Set<string>();
  for (const baseline of baselines) {
    if (!baseline.target.trim() || targets.has(baseline.target) ||
        ![baseline.initialHp, baseline.finalHp].every((hp) => Number.isFinite(hp) && hp >= 0)) {
      throw new Error("Invalid or duplicate HP baseline");
    }
    targets.add(baseline.target);
  }
  const totals = new Map<string, { damage: number; healing: number; survivalRestoration: number }>();
  for (const row of rows) {
    const field = row.metric === "hp_damage" ? "damage" : row.metric === "healing" ? "healing"
      : row.metric === "survival_restoration" ? "survivalRestoration" : undefined;
    if (!field) continue;
    if (!Number.isFinite(row.total) || row.total < 0) throw new Error("Invalid HP metric total");
    const total = totals.get(row.target) ?? { damage: 0, healing: 0, survivalRestoration: 0 };
    total[field] += row.total;
    if (!Number.isFinite(total[field])) throw new Error("HP metric sum overflow");
    totals.set(row.target, total);
  }
  return baselines.map((baseline) => {
    const total = totals.get(baseline.target) ?? { damage: 0, healing: 0, survivalRestoration: 0 };
    const expectedHp = baseline.initialHp - total.damage + total.healing + total.survivalRestoration;
    const residual = baseline.finalHp - expectedHp;
    if (!Number.isFinite(expectedHp) || !Number.isFinite(residual)) throw new Error("HP ledger overflow");
    return { ...baseline, ...total, expectedHp, residual, balanced: Math.abs(residual) <= 1e-7 };
  });
}
