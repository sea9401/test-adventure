import { db } from "@/db";
import {
  DUNGEON_THEME_VISIBILITY_SAVE_KEY,
  normalizeHiddenThemeStarts,
} from "@/adventure/v2/dungeonThemeVisibility";
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
    DUNGEON_THEME_VISIBILITY_SAVE_KEY,
    null,
  );
  return Response.json({
    ok: true,
    hiddenThemeStarts:
      raw == null ? null : normalizeHiddenThemeStarts(raw),
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
    !("hiddenThemeStarts" in body) ||
    !Array.isArray(body.hiddenThemeStarts)
  ) {
    return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const hiddenThemeStarts = normalizeHiddenThemeStarts(body.hiddenThemeStarts);
  await upsertSave(
    db,
    userId,
    DUNGEON_THEME_VISIBILITY_SAVE_KEY,
    hiddenThemeStarts,
  );
  return Response.json({ ok: true, hiddenThemeStarts });
}
