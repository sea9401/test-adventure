import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
  fishingProgressionView,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";

// GET /api/v2/fishing/progression — 낚시터 본 화면용 진행도 스냅샷.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const progression = fishingProgressionView(
    parseFishingProgression(
      await readSave(db, userId, FISHING_PROGRESS_KEY, emptyFishingProgression()),
    ),
  );
  return Response.json({ ok: true, progression });
}
