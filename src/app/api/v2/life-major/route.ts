// GET  /api/v2/life-major — 생활 전공·명장 단계 현황
// POST /api/v2/life-major — { major, minor } 전공 지정·변경(처음 채우기 무료, 변경은 30일 쿨다운)

import { db } from "@/db";
import {
  assignLifeMajors,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorNextChangeAt,
  lifeMajorView,
  parseLifeMajorState,
  type LifeMajorActivity,
} from "@/adventure/v2/lifeMajor";
import { ensureUser } from "@/lib/server/ensureUser";
import { readLifeLevels } from "@/lib/server/lifeMajor";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [levels, raw, character] = await Promise.all([
    readLifeLevels(db, userId),
    readSave(db, userId, LIFE_MAJOR_SAVE_KEY, {}),
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
  ]);
  return Response.json({
    ok: true,
    ...lifeMajorView(parseLifeMajorState(raw), levels, character.materials ?? {}),
  });
}

function slot(value: unknown): LifeMajorActivity | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? (value as LifeMajorActivity) : undefined;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-major",
    userLimit: 20,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
  const major = slot(record?.major);
  const minor = slot(record?.minor);
  if (major === undefined || minor === undefined) {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const levels = await readLifeLevels(tx, userId);
    const state = parseLifeMajorState(await lockSaveForUpdate(tx, userId, LIFE_MAJOR_SAVE_KEY, {}));
    const assigned = assignLifeMajors(state, { major, minor }, levels, now);
    if ("error" in assigned) {
      return { ok: false as const, error: assigned.error, nextChangeAt: lifeMajorNextChangeAt(state) };
    }
    await upsertSave(tx, userId, LIFE_MAJOR_SAVE_KEY, assigned.state);
    const character = await readSave<{ materials?: Record<string, unknown> }>(tx, userId, "character.v2", {});
    return {
      ok: true as const,
      view: lifeMajorView(assigned.state, levels, character.materials ?? {}),
    };
  });
  if (!result.ok) {
    const status = result.error === "invalid_activity" ? 400 : 409;
    return Response.json(result, { status });
  }
  return Response.json(result);
}
