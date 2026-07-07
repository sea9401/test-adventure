import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  BUILD_GOALS_SAVE_KEY,
  emptyBuildGoalsState,
  isV2BuildPresetId,
  parseBuildGoalsExport,
  parseBuildGoalsState,
  setBuildGoalActive,
  type V2BuildGoalsState,
} from "@/adventure/data/v2/buildPresets";

// GET /api/v2/me/build-goals — 장비 도감의 빌드 프리셋 목표 선택 현황.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const state = parseBuildGoalsState(
    await readSave(db, userId, BUILD_GOALS_SAVE_KEY, emptyBuildGoalsState()),
  );
  return Response.json({ ok: true, activePresetIds: state.activePresetIds });
}

// POST body: { presetId, active } — active=true 는 최근 목표로 앞으로 당기며 최대 3개 유지.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { presetId?: unknown; active?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!isV2BuildPresetId(body.presetId) || typeof body.active !== "boolean") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const presetId = body.presetId;
  const active = body.active;

  const result = await db.transaction(async (tx) => {
    const current = parseBuildGoalsState(
      await lockSaveForUpdate<V2BuildGoalsState>(
        tx,
        userId,
        BUILD_GOALS_SAVE_KEY,
        emptyBuildGoalsState(),
      ),
    );
    const next = setBuildGoalActive(current, presetId, active);
    await upsertSave(tx, userId, BUILD_GOALS_SAVE_KEY, next);
    return { ok: true as const, activePresetIds: next.activePresetIds };
  });

  return Response.json(result);
}

// PUT body: export payload or { activePresetIds } — 공유 코드 가져오기/전체 교체.
export async function PUT(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = null;
  }
  const next = parseBuildGoalsExport(body);
  if (!next) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  await upsertSave(db, userId, BUILD_GOALS_SAVE_KEY, next);
  return Response.json({ ok: true, activePresetIds: next.activePresetIds });
}
