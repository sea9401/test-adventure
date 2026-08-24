import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { upsertSave } from "@/lib/server/savesKv";
import { normalizeAdventureHomePreferences } from "@/adventure/v2/adventureDashboard";
import {
  ADVENTURE_ACTIVITY_IDS,
  ADVENTURE_HOME_SAVE_KEY,
} from "@/lib/server/adventureDashboard";

export async function PATCH(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const input = await request.json().catch(() => null);
  if (input == null || typeof input !== "object") {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const preferences = normalizeAdventureHomePreferences(
    input,
    ADVENTURE_ACTIVITY_IDS,
  );
  await upsertSave(db, userId, ADVENTURE_HOME_SAVE_KEY, preferences);
  return Response.json({ ok: true, preferences });
}
