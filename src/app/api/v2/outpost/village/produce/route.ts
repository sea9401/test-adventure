import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import { tryStartProduction } from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/produce — body { outpostId, slot }
// 마을 빈 슬롯에 생산 작업을 시작한다. 생산 종류는 마을 특화(productionKind, 건설 시 선택)로 고정 —
//   슬롯마다 고르지 않는다. 건설(이름+종류) 후에야 가능(미완은 not_built).
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
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      // 점령 이관됐으면 현 길드 소유로 정규화(이전 길드 작물 비움). 이름·종류는 유지(건설됨).
      const village = normalizeVillageOwner(loaded, guildId);
      // 건설(이름+특화 종류) 후에야 생산 가능 — 빈 공터/미완은 먼저 건설(/build).
      if (village.name == null || village.productionKind == null) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      const started = tryStartProduction(
        village.jobs,
        village.unlockedSlots,
        slot,
        village.productionKind,
        now,
      );
      if (!started.ok) {
        return {
          status: started.error === "slot_busy" ? 409 : 400,
          body: { ok: false as const, error: started.error },
        };
      }
      village.jobs = started.jobs;
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: {
          ok: true as const,
          tier: village.tier,
          jobs: village.jobs,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
