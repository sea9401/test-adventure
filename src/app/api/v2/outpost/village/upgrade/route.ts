import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  lockGuildSettlement,
  upsertGuildSettlement,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import { canUpgrade, applyUpgradeCost } from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileUpgrade } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/upgrade — body { outpostId }
// 길드 재화로 마을 단계 업그레이드(마을→도시→대도시). 마스터/부마스터 전용. 현 판을 다 채워야 가능.
// lock 순서: 점령행 → 마을 → 길드 재화(타 라우트 공통).
// (마스터/부마스터 판정은 비잠금 read — FOR UPDATE 전이라 데드락 사이클 무관.)
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  if (!outpostId) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
    return tileUpgrade(userId, outpostId);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 단계 업그레이드 = 마스터/부마스터 전용(관리 탭).
      if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }
      const loaded = await lockVillage(tx, outpostId);
      if (!loaded) {
        return {
          status: 404,
          body: { ok: false as const, error: "no_village" },
        };
      }
      const village = normalizeVillageOwner(loaded, guildId);
      const resources = await lockGuildSettlement(tx, guildId);
      const check = canUpgrade(village.tier, village.unlockedSlots, resources);
      if (!check.ok || !check.next) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: !check.next
              ? "max_tier"
              : check.needSlots
                ? "need_slots"
                : "insufficient",
            missing: check.missing,
          },
        };
      }
      const nextResources = applyUpgradeCost(village.tier, resources);
      village.tier = check.next;
      await upsertVillage(tx, village);
      await upsertGuildSettlement(tx, guildId, nextResources);
      return {
        status: 200,
        body: { ok: true as const, tier: village.tier, resources: nextResources },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
