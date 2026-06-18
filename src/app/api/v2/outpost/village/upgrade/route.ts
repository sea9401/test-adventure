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
import { canUpgrade, applyUpgradeCost } from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/upgrade — body { outpostId }
// 길드 재화로 마을 단계 업그레이드(마을→도시→대도시). 비용 차감 + 단계 상승.
// lock 순서: 마을 → 길드 재화(harvest 와 동일).
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

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
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
      const check = canUpgrade(village.tier, resources);
      if (!check.ok || !check.next) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: check.next ? "insufficient" : "max_tier",
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
