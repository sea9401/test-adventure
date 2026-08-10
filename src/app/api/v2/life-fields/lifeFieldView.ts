import {
  LIFE_FIELD_SPOT_IDS,
  lifeFieldEnvironmentForecast,
  lifeFieldEnvironmentSnapshot,
  type LifeFieldActivity,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import type { LifeFieldTrace } from "@/adventure/v2/lifeFieldRecords";
import type { readLifeFieldProgress } from "@/lib/server/lifeFieldProgress";
import type { LifeFieldFeatureSettings } from "@/lib/server/opsSettings";

export type LifeFieldView =
  | { kind: "full" }
  | { kind: "codex" }
  | {
      kind: "environment";
      activity: LifeFieldActivity;
      spotId: string;
    };

const ACTIVITIES = ["fishing", "woodcutting", "mining"] as const;

function isActivity(value: string | null): value is LifeFieldActivity {
  return ACTIVITIES.includes(value as LifeFieldActivity);
}

export function parseLifeFieldView(rawUrl: string): LifeFieldView | null {
  const params = new URL(rawUrl).searchParams;
  const view = params.get("view");
  if (view == null || view === "" || view === "full") {
    return { kind: "full" };
  }
  if (view === "codex") return { kind: "codex" };
  if (view !== "environment") return null;

  const activity = params.get("activity");
  const spotId = params.get("spotId");
  if (!isActivity(activity) || !spotId) return null;
  if (!LIFE_FIELD_SPOT_IDS[activity].includes(spotId as never)) return null;
  return { kind: "environment", activity, spotId };
}

export function buildLifeFieldEnvironmentPayload({
  now,
  features,
  activity,
  spotId,
  trace,
}: {
  now: number;
  features: LifeFieldFeatureSettings;
  activity: LifeFieldActivity;
  spotId: string;
  trace: LifeFieldTrace | null | undefined;
}) {
  return {
    ok: true as const,
    serverNow: now,
    features,
    environment: features.environmentEnabled
      ? {
          current: lifeFieldEnvironmentSnapshot(activity, spotId, now),
          next: lifeFieldEnvironmentForecast(activity, spotId, now),
        }
      : null,
    trace: trace ?? null,
  };
}

type LifeFieldProgress = Awaited<ReturnType<typeof readLifeFieldProgress>>;

export function buildLifeFieldCodexPayload({
  now,
  features,
  progress,
}: {
  now: number;
  features: LifeFieldFeatureSettings;
  progress: LifeFieldProgress;
}) {
  return {
    ok: true as const,
    serverNow: now,
    features,
    summary: progress.summary,
    daily: progress.daily,
    traces: progress.state.traces,
  };
}
