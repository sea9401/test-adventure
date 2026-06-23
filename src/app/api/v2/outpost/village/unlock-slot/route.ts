import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  canUnlockSlot,
  isValidProductionKind,
} from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileUnlockSlot } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/unlock-slot — body { outpostId, kind }
// 판의 다음 칸을 길드 금고 골드로 열고, 그 칸에서 키울 종류(crop|ore|fish)를 고른다(영구).
//   마스터/부마스터 전용. 첫 칸은 무료(기본 제공), 둘째 칸부터 5천만 골드에서 칸마다 누진.
//   판이 꽉 차면 at_max(단계 업그레이드로).
// lock 순서: 점령행 → 마을 → 길드 자원(골드 풀). 타 라우트 공통(단일 길드 자원 row).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  if (!outpostId) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  // 칸에서 키울 종류를 해금과 함께 고른다.
  if (!isValidProductionKind(body.kind)) {
    return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const kind = body.kind;

  if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
    return tileUnlockSlot(userId, outpostId, kind);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 칸 해금 = 마스터/부마스터 전용(관리 탭).
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
      // 건설(이름)된 마을만 — 빈 공터는 먼저 /build.
      if (village.name == null) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      const res = await lockGuildResources(tx, guildId);
      const check = canUnlockSlot(village.tier, village.unlockedSlots, res.gold);
      if (!check.ok) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: check.atMax ? "at_max" : "insufficient_gold",
            cost: check.cost,
          },
        };
      }
      // 다음 칸을 열고 종류를 고정 + 길드 골드 차감.
      const newSlot = village.unlockedSlots;
      village.unlockedSlots += 1;
      village.slotKinds = { ...village.slotKinds, [newSlot]: kind };
      const remaining = res.gold - check.cost;
      await upsertVillage(tx, village);
      await upsertGuildResources(tx, guildId, { gold: remaining });
      return {
        status: 200,
        body: {
          ok: true as const,
          unlockedSlots: village.unlockedSlots,
          slotKinds: village.slotKinds,
          gold: remaining,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
