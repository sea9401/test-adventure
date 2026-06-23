import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  readVillagesOfGuild,
  readVillage,
  readGuildSettlement,
  readSettlementResources,
  resolveTileSettlementOwner,
  terrainTraitOf,
  type VillageRow,
} from "@/lib/server/v2Settlement";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { readSave } from "@/lib/server/savesKv";
import {
  MAX_SLOTS_BY_TIER,
  harvestRemainingMs,
  isHarvestReady,
} from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import {
  isTileOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";

// 마을 행 → UI DTO(슬롯 카운트다운은 서버 시각 기준 remainingMs). 길드/타일 공통.
function villageDto(v: VillageRow, now: number) {
  return {
    outpostId: v.outpostId,
    name: v.name,
    tier: v.tier,
    trait: terrainTraitOf(v.outpostId),
    // 슬롯 판 — 해금 칸 수 + 이 단계 해금 상한(maxSlots) + 칸별 종류. 화면은 항상 3×3(UI 상수).
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
  };
}

// 솔로(무길드) 정착지의 가용 골드 = 플레이어 본인 골드 + 은행(슬롯 해금·건설 비용원).
function playerGold(save: Record<string, unknown>): number {
  const gold = Math.max(0, Math.floor(Number(save.gold) || 0));
  const banked = Math.max(0, Math.floor(Number(save.bankedGold) || 0));
  return gold + banked;
}

// GET /api/v2/outpost/village — 내 길드의 마을 목록(슬롯 상태) + 정착지 재화 풀 + 길드 금고 골드.
//   gold = 칸 해금 비용·resources = 단계 업그레이드 비용(생산 재화). 읽기 전용 스냅샷(서버 시각 동봉).
// ?outpostId=tile:col,row (V2_TILE_PRODUCTION) — 그 타일 정착지 1개 + 소유(길드/솔로)별 자원·골드 풀.
//   소유는 점령행 있으면 길드, 없으면 founder=솔로(마을 행이 아직 없어도 해석 — 건설 비용 표시용).
export async function GET(req?: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const qOutpost = req
    ? new URL(req.url).searchParams.get("outpostId")
    : null;

  // ── 타일 정착지 단건(소유별 풀) ──────────────────────────────────────────
  if (V2_TILE_PRODUCTION && qOutpost && isTileOutpostId(qOutpost)) {
    const pos = parseTileOutpostId(qOutpost);
    if (!pos) {
      return Response.json({ ok: true, serverNow: now, villages: [], resources: {}, gold: 0 });
    }
    const out = await db.transaction(async (tx) => {
      const owner = await resolveTileSettlementOwner(tx, pos.col, pos.row);
      if (!owner) return { villages: [], resources: {}, gold: 0 };
      const [village, resources] = await Promise.all([
        readVillage(tx, qOutpost),
        readSettlementResources(tx, owner),
      ]);
      const gold =
        owner.kind === "guild"
          ? (await readGuildResources(tx, owner.guildId)).gold
          : playerGold(
              await readSave<Record<string, unknown>>(
                tx,
                owner.userId,
                "character.v2",
                {},
              ),
            );
      return {
        villages: village ? [villageDto(village, now)] : [],
        resources,
        gold,
      };
    });
    return Response.json({ ok: true, serverNow: now, ...out });
  }

  // ── 길드 마을 목록(현행·byte-identical) ───────────────────────────────────
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
      villages: villages.map((v) => villageDto(v, now)),
      resources,
      gold: guildRes.gold,
    };
  });
  return Response.json({ ok: true, serverNow: now, ...out });
}
