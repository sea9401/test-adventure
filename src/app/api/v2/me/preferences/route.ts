import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  PREFERENCES_V2_KEY,
  parseV2Preferences,
} from "@/lib/server/v2Preferences";

// GET /api/v2/me/preferences — 현재 환경설정.
// POST { autoRepair: boolean } — 토글 저장.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, PREFERENCES_V2_KEY)))
      .limit(1)
  )[0];
  const prefs = parseV2Preferences(row?.value);
  return Response.json({ ok: true, ...prefs });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { autoRepair?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.autoRepair !== "boolean") {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const autoRepair = body.autoRepair;

  await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      PREFERENCES_V2_KEY,
      {},
    );
    await upsertSave(tx, userId, PREFERENCES_V2_KEY, { ...save, autoRepair });
  });

  return Response.json({ ok: true, autoRepair });
}
