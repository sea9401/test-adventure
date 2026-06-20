import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  readVillagesOfGuild,
  readGuildSettlement,
  terrainTraitOf,
} from "@/lib/server/v2Settlement";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import {
  MAX_SLOTS_BY_TIER,
  harvestRemainingMs,
  isHarvestReady,
} from "@/adventure/data/v2/settlement";

// GET /api/v2/outpost/village — 내 길드의 마을 목록(슬롯 상태) + 정착지 재화 풀 + 길드 금고 골드.
//   길드 마을 페이지(UI) 가 소비. 읽기 전용 스냅샷(서버 시각 동봉, 클라 카운트다운 skew 보정).
//   gold = 칸 해금 비용(길드 골드)·resources = 단계 업그레이드 비용(생산 재화).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const out = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { villages: [], resources: {}, gold: 0 };
    }
    const [villages, resources, guildRes] = await Promise.all([
      readVillagesOfGuild(tx, guildId),
      readGuildSettlement(tx, guildId),
      readGuildResources(tx, guildId),
    ]);
    return {
      villages: villages.map((v) => ({
        outpostId: v.outpostId,
        name: v.name,
        tier: v.tier,
        trait: terrainTraitOf(v.outpostId),
        // 슬롯 판 — 해금된 칸 수 + 이 단계 해금 상한(maxSlots) + 칸별 종류. 화면은 항상 4×4(UI 상수).
        unlockedSlots: v.unlockedSlots,
        maxSlots: MAX_SLOTS_BY_TIER[v.tier],
        slotKinds: v.slotKinds,
        slots: Object.entries(v.jobs).map(([slot, job]) => ({
          slot: Number(slot),
          kind: job.kind,
          startedAt: job.startedAt,
          remainingMs: harvestRemainingMs(job, now),
          ready: isHarvestReady(job, now),
        })),
      })),
      resources,
      gold: guildRes.gold,
    };
  });
  return Response.json({ ok: true, serverNow: now, ...out });
}
