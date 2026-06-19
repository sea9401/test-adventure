import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  readVillagesOfGuild,
  readGuildSettlement,
  terrainTraitOf,
} from "@/lib/server/v2Settlement";
import {
  MAX_SLOTS_BY_TIER,
  GRID_COLS_BY_TIER,
  harvestRemainingMs,
  isHarvestReady,
} from "@/adventure/data/v2/settlement";

// GET /api/v2/outpost/village — 내 길드의 마을 목록(슬롯 상태) + 정착지 재화 풀.
//   길드 마을 페이지(UI) 가 소비. 읽기 전용 스냅샷(서버 시각 동봉, 클라 카운트다운 skew 보정).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const out = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { villages: [], resources: {} };
    }
    const [villages, resources] = await Promise.all([
      readVillagesOfGuild(tx, guildId),
      readGuildSettlement(tx, guildId),
    ]);
    return {
      villages: villages.map((v) => ({
        outpostId: v.outpostId,
        name: v.name,
        productionKind: v.productionKind,
        tier: v.tier,
        trait: terrainTraitOf(v.outpostId),
        // 슬롯 판 — 해금된 칸 수 + 단계 판 크기(마을 2×2·도시 3×3). UI 가 그리드 렌더·칸 해금 표시.
        unlockedSlots: v.unlockedSlots,
        maxSlots: MAX_SLOTS_BY_TIER[v.tier],
        gridCols: GRID_COLS_BY_TIER[v.tier],
        slots: Object.entries(v.jobs).map(([slot, job]) => ({
          slot: Number(slot),
          kind: job.kind,
          startedAt: job.startedAt,
          remainingMs: harvestRemainingMs(job, now),
          ready: isHarvestReady(job, now),
        })),
      })),
      resources,
    };
  });
  return Response.json({ ok: true, serverNow: now, ...out });
}
