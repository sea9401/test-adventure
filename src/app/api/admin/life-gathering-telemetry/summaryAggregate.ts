import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import type { LifeGatheringActivity } from "@/lib/server/lifeGatheringTelemetry";

type NumericAggregate = number | string;

export type LifeActivitySummaryRow = {
  eventType: string;
  attempts: NumericAggregate;
  successes: NumericAggregate;
  uniqueUsers: NumericAggregate;
};

export type LifeSourceSummaryRow = {
  eventType: string;
  sourceId: string;
  sourceName: string | null;
  attempts: NumericAggregate;
  successes: NumericAggregate;
};

export type LifeMaterialSummaryRow = {
  eventType: string;
  materialId: string;
  materialName: string | null;
  quantity: NumericAggregate;
  primary: boolean;
};

export type LifeDailySummaryRow = {
  eventType: string;
  day: string;
  attempts: NumericAggregate;
  successes: NumericAggregate;
  primaryQuantity: NumericAggregate;
  bonusQuantity: NumericAggregate;
};

export type LifeUserSummaryRow = {
  activity: string;
  userId: string;
  gameName: string | null;
  attempts: NumericAggregate;
  successes: NumericAggregate;
  quantity: NumericAggregate;
  activeMinutes: NumericAggregate;
  avgIntervalSec: NumericAggregate;
  intervalStddevSec: NumericAggregate;
};

export type LifeGatheringSummaryRows = {
  activityRows: LifeActivitySummaryRow[];
  sourceRows: LifeSourceSummaryRow[];
  materialRows: LifeMaterialSummaryRow[];
  dailyRows: LifeDailySummaryRow[];
  userRows: LifeUserSummaryRow[];
};

const ACTIVITIES = ["fishing", "woodcutting", "mining", "farming"] as const;

function activityOf(value: string): LifeGatheringActivity | null {
  return ACTIVITIES.find((activity) => value.includes(`life.${activity}.`)) ?? null;
}

function countOf(value: NumericAggregate): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function metricOf(value: NumericAggregate): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rate(successes: number, attempts: number): number {
  return attempts > 0 ? Math.round((successes / attempts) * 10_000) / 100 : 0;
}

export function aggregateLifeGatheringSummary(rows: LifeGatheringSummaryRows) {
  const activities = ACTIVITIES.map((activity) => {
    const activityRow = rows.activityRows.find(
      (row) => activityOf(row.eventType) === activity,
    );
    const attempts = countOf(activityRow?.attempts ?? 0);
    const successes = countOf(activityRow?.successes ?? 0);
    const uniqueUsers = countOf(activityRow?.uniqueUsers ?? 0);
    const materials = rows.materialRows
      .filter((row) => activityOf(row.eventType) === activity)
      .map((row) => ({
        materialId: row.materialId,
        quantity: countOf(row.quantity),
        primary: row.primary,
        name:
          row.materialName?.trim() ||
          V2_MATERIALS[row.materialId]?.name ||
          row.materialId,
      }))
      .sort(
        (a, b) =>
          Number(b.primary) - Number(a.primary) ||
          b.quantity - a.quantity ||
          a.name.localeCompare(b.name, "ko"),
      );
    const daily = new Map<
      string,
      {
        attempts: number;
        successes: number;
        primaryQuantity: number;
        bonusQuantity: number;
      }
    >();
    for (const row of rows.dailyRows) {
      if (activityOf(row.eventType) !== activity) continue;
      const current = daily.get(row.day) ?? {
        attempts: 0,
        successes: 0,
        primaryQuantity: 0,
        bonusQuantity: 0,
      };
      current.attempts += countOf(row.attempts);
      current.successes += countOf(row.successes);
      current.primaryQuantity += countOf(row.primaryQuantity);
      current.bonusQuantity += countOf(row.bonusQuantity);
      daily.set(row.day, current);
    }
    const primaryQuantity = [...daily.values()].reduce(
      (sum, row) => sum + row.primaryQuantity,
      0,
    );
    const bonusQuantity = [...daily.values()].reduce(
      (sum, row) => sum + row.bonusQuantity,
      0,
    );

    return {
      activity,
      attempts,
      successes,
      failures: Math.max(0, attempts - successes),
      successRate: rate(successes, attempts),
      uniqueUsers,
      primaryQuantity,
      bonusQuantity,
      sources: rows.sourceRows
        .filter((row) => activityOf(row.eventType) === activity)
        .map((row) => {
          const sourceAttempts = countOf(row.attempts);
          const sourceSuccesses = countOf(row.successes);
          return {
            sourceId: row.sourceId,
            name: row.sourceName?.trim() || row.sourceId,
            attempts: sourceAttempts,
            successes: sourceSuccesses,
            failures: Math.max(0, sourceAttempts - sourceSuccesses),
            successRate: rate(sourceSuccesses, sourceAttempts),
          };
        })
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      materials,
      daily: [...daily.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, value]) => ({ day, ...value })),
      topUsers: rows.userRows
        .filter((row) => activityOf(`life.${row.activity}.attempt`) === activity)
        .map((row) => ({
          userId: row.userId,
          gameName: row.gameName,
          attempts: countOf(row.attempts),
          successes: countOf(row.successes),
          quantity: countOf(row.quantity),
          activeMinutes: Math.round(metricOf(row.activeMinutes)),
          avgIntervalSec: Math.round(metricOf(row.avgIntervalSec) * 10) / 10,
          intervalStddevSec:
            Math.round(metricOf(row.intervalStddevSec) * 10) / 10,
        }))
        .sort(
          (a, b) =>
            b.quantity - a.quantity ||
            b.successes - a.successes ||
            b.attempts - a.attempts,
        )
        .slice(0, 10),
    };
  });

  return {
    totals: {
      attempts: activities.reduce((sum, row) => sum + row.attempts, 0),
      successes: activities.reduce((sum, row) => sum + row.successes, 0),
      failures: activities.reduce((sum, row) => sum + row.failures, 0),
      primaryQuantity: activities.reduce(
        (sum, row) => sum + row.primaryQuantity,
        0,
      ),
      bonusQuantity: activities.reduce(
        (sum, row) => sum + row.bonusQuantity,
        0,
      ),
    },
    activities,
  };
}
