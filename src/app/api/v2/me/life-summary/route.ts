import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { lifeSummaryFromSaves } from "@/adventure/v2/lifeSummary";

const CRAFTING_SAVE_KEY = "crafting.v2";
const LIFE_SUMMARY_SAVE_KEYS = [
  FARM_SAVE_KEY,
  WOODCUTTING_LOG_KEY,
  MINING_LOG_KEY,
  FISHING_PROGRESS_KEY,
  FISHING_CODEX_KEY,
  COOKING_SAVE_KEY,
  CRAFTING_SAVE_KEY,
] as const;

// GET /api/v2/me/life-summary — 생활 기록 화면 전용 경량 집계.
// 전투·장비 상태를 만들지 않고 생활 저장값만 한 번에 읽는다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:life-summary",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, [...LIFE_SUMMARY_SAVE_KEYS]),
      ),
    );
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return Response.json({
    ok: true,
    summary: lifeSummaryFromSaves({
      farmRaw: byKey.get(FARM_SAVE_KEY),
      woodcuttingRaw: byKey.get(WOODCUTTING_LOG_KEY),
      miningRaw: byKey.get(MINING_LOG_KEY),
      fishingRaw: byKey.get(FISHING_PROGRESS_KEY),
      fishingCodexRaw: byKey.get(FISHING_CODEX_KEY),
      cookingRaw: byKey.get(COOKING_SAVE_KEY),
      craftingRaw: byKey.get(CRAFTING_SAVE_KEY),
    }),
  });
}
