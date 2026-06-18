import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
  type VillageRow,
} from "@/lib/server/v2Settlement";
import {
  tryStartProduction,
  PRODUCTION_KINDS,
  type ProductionKind,
} from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/produce — body { outpostId, slot, kind }
// 점령한 거점의 마을 빈 슬롯에 시간경과 생산 작업을 시작한다. 마을이 없으면 lazy 생성(마을 단계).
// (명시 건설/명명 흐름은 후속 PR — 지금은 점령지면 바로 생산.)
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; slot?: unknown; kind?: unknown };
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
  const kind = body.kind as ProductionKind;
  if (
    !outpostId ||
    slot < 0 ||
    typeof body.kind !== "string" ||
    !(PRODUCTION_KINDS as string[]).includes(kind)
  ) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = Date.now();
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      let village = await lockVillage(tx, outpostId);
      if (!village) {
        // lazy 생성 — 점령지에 첫 생산 시 마을(village 단계) 자동 발생.
        village = {
          outpostId,
          guildId,
          tier: "village",
          name: null,
          jobs: {},
        } satisfies VillageRow;
      } else {
        // 점령 이관됐으면 현 길드 소유로 정규화(이전 길드 작물 비움).
        village = normalizeVillageOwner(village, guildId);
      }
      const started = tryStartProduction(
        village.jobs,
        village.tier,
        slot,
        kind,
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
