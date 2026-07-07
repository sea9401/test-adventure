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
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { canUnlockSlot } from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileUnlockSlot } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/unlock-slot — body { outpostId }
// 다음 건축물 슬롯을 길드 금고 골드로 연다. [PR-3] 슬롯 생산 폐지 — 종류 선택 없음.
//   마스터/관리자 전용. 슬롯마다 누진 골드(현재 1슬롯 정책이라 첫 슬롯만 사용). 가득 차면 at_max.
// lock 순서: 점령행 → 마을 → 길드 자원(골드 풀). 타 라우트 공통(단일 길드 자원 row).
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
    return tileUnlockSlot(userId, outpostId);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 건축물 슬롯 해금 = 마스터/관리자 전용(관리 탭).
      if (!(await isGuildMasterOrManager(tx, guildId, userId))) {
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
      // 다음 건축물 슬롯을 열고 길드 골드 차감.
      village.unlockedSlots += 1;
      const remaining = res.gold - check.cost;
      await upsertVillage(tx, village);
      await upsertGuildResources(tx, guildId, { gold: remaining });
      return {
        status: 200,
        body: {
          ok: true as const,
          unlockedSlots: village.unlockedSlots,
          gold: remaining,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
