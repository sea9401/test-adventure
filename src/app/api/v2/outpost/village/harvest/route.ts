import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  lockGuildSettlement,
  upsertGuildSettlement,
  normalizeVillageOwner,
  terrainTraitOf,
} from "@/lib/server/v2Settlement";
import { isHarvestReady, harvestYield } from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/harvest — body { outpostId, slot }
// 완료된 생산 슬롯을 수확 → 산출물을 길드 정착지 재화 풀에 적립, 슬롯 비움(재큐 필요).
// lock 순서: 마을(outpost_villages) → 길드 재화(v2_guild_resources). 일관 유지.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; slot?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const slot =
    typeof body.slot === "number" && Number.isInteger(body.slot)
      ? body.slot
      : -1;
  if (!outpostId || slot < 0) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = Date.now();
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
      // 점령 이관됐으면 정규화(작물 비움 → 아래 no_job).
      const village = normalizeVillageOwner(loaded, guildId);
      const job = village.jobs[String(slot)];
      if (!job) {
        return { status: 404, body: { ok: false as const, error: "no_job" } };
      }
      if (!isHarvestReady(job, now)) {
        return {
          status: 409,
          body: { ok: false as const, error: "not_ready" },
        };
      }
      const amount = harvestYield(job, terrainTraitOf(outpostId), now);
      const resources = await lockGuildSettlement(tx, guildId);
      resources[job.kind] = (resources[job.kind] ?? 0) + amount;
      delete village.jobs[String(slot)];
      await upsertVillage(tx, village);
      await upsertGuildSettlement(tx, guildId, resources);
      return {
        status: 200,
        body: {
          ok: true as const,
          harvested: { kind: job.kind, amount },
          jobs: village.jobs,
          resources,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
