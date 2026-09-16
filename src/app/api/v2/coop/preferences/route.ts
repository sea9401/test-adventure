import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { upsertSave } from "@/lib/server/savesKv";
import { COOP_PREFERENCES_KEY, readCoopPreferences } from "@/lib/server/coopPreferences";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...await readCoopPreferences(db, userId) });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { autoFreeSupport?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body.autoFreeSupport !== "boolean") {
    return Response.json({ ok: false, error: "bad_support_setting" }, { status: 400 });
  }
  const preferences = { autoFreeSupport: body.autoFreeSupport };
  await upsertSave(db, userId, COOP_PREFERENCES_KEY, preferences);
  return Response.json({ ok: true, ...preferences });
}
