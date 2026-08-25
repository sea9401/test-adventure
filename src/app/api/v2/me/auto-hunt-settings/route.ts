import { db } from "@/db";
import {
  AUTO_HUNT_STOP_SAVE_KEY,
  normalizeAutoHuntStopConfig,
} from "@/adventure/v2/autoHuntStopPolicy";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave, upsertSave } from "@/lib/server/savesKv";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await readSave<unknown>(
    db,
    userId,
    AUTO_HUNT_STOP_SAVE_KEY,
    null,
  );
  return Response.json({
    ok: true,
    config: raw == null ? null : normalizeAutoHuntStopConfig(raw),
  });
}

export async function PATCH(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (
    body == null ||
    typeof body !== "object" ||
    !("config" in body) ||
    body.config == null ||
    typeof body.config !== "object"
  ) {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const config = normalizeAutoHuntStopConfig(body.config);
  await upsertSave(db, userId, AUTO_HUNT_STOP_SAVE_KEY, config);
  return Response.json({ ok: true, config });
}
