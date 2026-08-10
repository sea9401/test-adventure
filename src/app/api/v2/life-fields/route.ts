import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  LIFE_FIELD_SPOT_IDS,
  lifeFieldEnvironmentForecast,
  lifeFieldEnvironmentSnapshot,
  type LifeFieldActivity,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  abandonLifeFieldTraceInTx,
  readLifeFieldProgress,
  readLifeFieldState,
} from "@/lib/server/lifeFieldProgress";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import {
  buildLifeFieldCodexPayload,
  buildLifeFieldEnvironmentPayload,
  parseLifeFieldView,
} from "./lifeFieldView";

const ACTIVITIES = ["fishing", "woodcutting", "mining"] as const;

function isLifeFieldActivity(value: unknown): value is LifeFieldActivity {
  return ACTIVITIES.includes(value as LifeFieldActivity);
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const view = parseLifeFieldView(req.url);
  if (view == null) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const now = Date.now();
  if (view.kind === "environment") {
    const [features, state] = await Promise.all([
      readLifeFieldFeatureSettings(),
      readLifeFieldState(db, userId),
    ]);
    return Response.json(
      buildLifeFieldEnvironmentPayload({
        now,
        features,
        activity: view.activity,
        spotId: view.spotId,
        trace: state.traces[view.activity],
      }),
    );
  }

  const [features, progress] = await Promise.all([
    readLifeFieldFeatureSettings(),
    readLifeFieldProgress(db, userId, now),
  ]);
  if (view.kind === "codex") {
    return Response.json(
      buildLifeFieldCodexPayload({ now, features, progress }),
    );
  }
  const environments = features.environmentEnabled
    ? Object.fromEntries(
        ACTIVITIES.map((activity) => [
          activity,
          Object.fromEntries(
            LIFE_FIELD_SPOT_IDS[activity].map((spotId) => [
              spotId,
              {
                current: lifeFieldEnvironmentSnapshot(
                  activity,
                  spotId,
                  now,
                ),
                next: lifeFieldEnvironmentForecast(activity, spotId, now),
              },
            ]),
          ),
        ]),
      )
    : null;

  return Response.json({
    ok: true,
    serverNow: now,
    features,
    environments,
    summary: progress.summary,
    daily: progress.daily,
    traces: progress.state.traces,
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-fields:abandon",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    activity?: unknown;
  } | null;
  if (
    body?.action !== "abandon_trace" ||
    !isLifeFieldActivity(body.activity)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const activity = body.activity;
  const result = await db.transaction((tx) =>
    abandonLifeFieldTraceInTx(tx, userId, activity),
  );
  return Response.json({
    ok: true,
    abandoned: result.abandoned,
    trace: result.state.traces[activity] ?? null,
  });
}
