import type { BattleLogEntry } from "../v2/combat/engineState";

/** Only explicit, outgoing extra damage belongs in an action's damage total. */
export function additionalActionDamage(
  entry: BattleLogEntry,
  actor: "player" | "enemy",
): number | null {
  if (entry.kind === "hp_bar") return null;
  if (entry.kind !== `${actor}_attack` || entry.effect === "status_damage") return null;
  if (entry.additionalHpDamage != null) {
    return Number.isFinite(entry.additionalHpDamage) && entry.additionalHpDamage >= 0
      ? entry.additionalHpDamage
      : null;
  }
  // Old PvP pursuit text is PRE barrier/shield damage, unlike the direct hit rows.
  if (entry.side != null) return null;
  if (entry.effect !== "extra_damage" && !entry.text.startsWith("[교차·추격]")) return null;
  const match = entry.text.match(/^(?:\[[^\]]+\]\s*)*([\d,]+)\s*추가 피해[.!]?$/);
  if (!match) return null;
  const damage = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(damage) ? damage : null;
}

/** Preserve the logged duration, not an invented remaining-state countdown. */
export function compactDurationEffect(body: string): string | null {
  const match = body.match(/^(.*?)\s*\((?:(적|자신)\s*행동\s*(\d+)회|(\d+)행동)\)[.!]?$/);
  if (!match) return null;
  const duration = match[4] ? `${match[4]}행동` : `${match[2]} ${match[3]}행동`;
  return `${match[1].trim()} · ${duration}`;
}
