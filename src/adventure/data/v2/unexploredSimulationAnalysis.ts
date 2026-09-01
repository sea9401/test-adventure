import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import type { UnexploredPoolId } from "./unexploredMonsterPools";
import type { UnexploredSimulationDifficulty } from "./unexploredSimulationMonsters";
import { V2_SKILLS, type V2SkillsState } from "./v2Skills";

export type UnexploredRankCandidate = {
  opaqueKey: string;
  totalCumLevel: number;
  level: number;
  updatedAtMs: number;
};

export function rankUnexploredCandidates<
  T extends UnexploredRankCandidate,
>(candidates: readonly T[], limit: number = 30): T[] {
  return [...candidates]
    .sort(
      (left, right) =>
        right.totalCumLevel - left.totalCumLevel ||
        right.level - left.level ||
        left.updatedAtMs - right.updatedAtMs ||
        left.opaqueKey.localeCompare(right.opaqueKey),
    )
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function anonymousUnexploredRankLabel(zeroBasedIndex: number): string {
  return `${String(Math.max(0, Math.floor(zeroBasedIndex)) + 1).padStart(2, "0")}위`;
}

export type UnexploredOffenseAxis = "물리 우세" | "마법 우세" | "혼합";
export type UnexploredDefenseAxis =
  | "물리 방어"
  | "마법 방어"
  | "회피"
  | "균형";
export type UnexploredStatusAxis =
  | "중독"
  | "출혈"
  | "둔화"
  | "복합 상태"
  | "비상태";

export type UnexploredBuildClassification = {
  offense: UnexploredOffenseAxis;
  defense: UnexploredDefenseAxis;
  status: UnexploredStatusAxis;
  label: string;
};

type StatusKind = "poison" | "bleed" | "slow";

function scanStatusMechanics(
  value: unknown,
  found: Set<StatusKind>,
  seen: Set<object>,
): void {
  if (value == null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (record.kind === "dot" && record.tag === "poison") found.add("poison");
  if (record.kind === "dot" && record.tag === "bleed") found.add("bleed");
  if (record.kind === "enemyDebuff" && record.stat === "spd") {
    found.add("slow");
  }
  if (
    (typeof record.frostChillGain === "number" && record.frostChillGain > 0) ||
    (typeof record.freezeDamagePct === "number" && record.freezeDamagePct > 0) ||
    (typeof record.freezeDelayPct === "number" && record.freezeDelayPct > 0) ||
    (typeof record.freezeRetainStacks === "number" &&
      record.freezeRetainStacks > 0)
  ) {
    found.add("slow");
  }

  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const item of nested) scanStatusMechanics(item, found, seen);
    } else {
      scanStatusMechanics(nested, found, seen);
    }
  }
}

function statusAxis(skills: V2SkillsState): UnexploredStatusAxis {
  const found = new Set<StatusKind>();
  for (const skillId of skills.equipped) {
    scanStatusMechanics(V2_SKILLS[skillId], found, new Set<object>());
  }
  if (found.size > 1) return "복합 상태";
  if (found.has("poison")) return "중독";
  if (found.has("bleed")) return "출혈";
  if (found.has("slow")) return "둔화";
  return "비상태";
}

export function classifyUnexploredBuild(
  combat: PlayerCombat,
  skills: V2SkillsState,
): UnexploredBuildClassification {
  const atk = Math.max(0, combat.atk);
  const magicAtk = Math.max(0, combat.magicAtk ?? 0);
  const offense: UnexploredOffenseAxis =
    atk > 0 && atk >= magicAtk * 1.2
      ? "물리 우세"
      : magicAtk > 0 && magicAtk >= atk * 1.2
        ? "마법 우세"
        : "혼합";

  const def = Math.max(0, combat.def);
  const magicDef = Math.max(0, combat.magicDef ?? combat.def);
  const evasion = Math.max(0, combat.evaRating ?? combat.evasionPct);
  const defense: UnexploredDefenseAxis =
    evasion >= Math.max(def, magicDef)
      ? "회피"
      : def >= magicDef * 1.2
        ? "물리 방어"
        : magicDef >= def * 1.2
          ? "마법 방어"
          : "균형";
  const status = statusAxis(skills);
  return {
    offense,
    defense,
    status,
    label: `${offense} · ${defense} · ${status}`,
  };
}

export type UnexploredRateMode = "base" | "stats" | "mechanics";

export type UnexploredRateRow = {
  playerIndex: number;
  difficulty: UnexploredSimulationDifficulty;
  mode: UnexploredRateMode;
  poolId: UnexploredPoolId | null;
  job: string;
  buildLabel: string;
  wins: number;
  total: number;
};

export type UnexploredRateSummary = {
  wins: number;
  total: number;
  ratePct: number;
  samplePlayers: number;
  minPct: number;
  p25Pct: number;
  medianPct: number;
  p75Pct: number;
  maxPct: number;
  playersAtLeast20Pct: number;
  playersAtLeast40Pct: number;
  playersAtLeast70Pct: number;
};

function ratePct(wins: number, total: number): number {
  return total > 0 ? (wins / total) * 100 : 0;
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * ratio),
  );
  return sorted[index];
}

export function summarizeUnexploredRates(
  rows: readonly UnexploredRateRow[],
): UnexploredRateSummary {
  let wins = 0;
  let total = 0;
  const playerTotals = new Map<number, { wins: number; total: number }>();
  for (const row of rows) {
    const rowWins = Math.max(0, Math.floor(row.wins));
    const rowTotal = Math.max(rowWins, Math.floor(row.total));
    wins += rowWins;
    total += rowTotal;
    const current = playerTotals.get(row.playerIndex) ?? { wins: 0, total: 0 };
    current.wins += rowWins;
    current.total += rowTotal;
    playerTotals.set(row.playerIndex, current);
  }
  const playerRates = [...playerTotals.values()]
    .filter((rate) => rate.total > 0)
    .map((rate) => ratePct(rate.wins, rate.total));
  return {
    wins,
    total,
    ratePct: ratePct(wins, total),
    samplePlayers: playerRates.length,
    minPct: percentile(playerRates, 0),
    p25Pct: percentile(playerRates, 0.25),
    medianPct: percentile(playerRates, 0.5),
    p75Pct: percentile(playerRates, 0.75),
    maxPct: percentile(playerRates, 1),
    playersAtLeast20Pct: playerRates.filter((rate) => rate >= 20).length,
    playersAtLeast40Pct: playerRates.filter((rate) => rate >= 40).length,
    playersAtLeast70Pct: playerRates.filter((rate) => rate >= 70).length,
  };
}

export type UnexploredRateGroup<T extends string> = {
  key: T;
  summary: UnexploredRateSummary;
};

export function groupUnexploredRates<T extends string>(
  rows: readonly UnexploredRateRow[],
  keyOf: (row: UnexploredRateRow) => T,
): UnexploredRateGroup<T>[] {
  const grouped = new Map<T, UnexploredRateRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([key, group]) => ({
    key,
    summary: summarizeUnexploredRates(group),
  }));
}
