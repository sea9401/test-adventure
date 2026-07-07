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
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import {
  isValidVillageName,
  INITIAL_UNLOCKED_SLOTS,
  VILLAGE_BUILD_GOLD_COST,
} from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileBuild } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/build — body { outpostId, name }
// 점령한 빈 공터에 마을을 세운다 — 이름만 정한다.
//   마스터/관리자 전용. 건설에 길드 금고 골드 1천만 소모. 건설 직후엔 빈 판(0칸) — 현재
//   마을별 1칸을 골드로 해금(unlock-slot)한다.
//   - 마을 없음 → 새로 건설(이름만, 1천만 골드 차감).
//   - 마을 있고 이름 없음(옛 lazy 생성분) → 이름만 채워 건설(무료, 기존 판 보존).
//   - 이미 이름 있음 → 409 already_built (개명은 /rename).
// lock 순서: 점령행 → 마을 → 길드 자원(골드 풀). 타 라우트 공통.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";

  // 타일 정착지(tile:col,row) — 이름은 개척(found) 때 정한 이름을 재사용(건설 단계 이름 입력 없음).
  //   생산 시스템(솔로/길드)으로 위임. 카탈로그 거점은 아래에서 이름을 받아 건설.
  if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
    return tileBuild(userId, outpostId);
  }

  const rawName = typeof body.name === "string" ? body.name : "";
  if (!outpostId || !isValidVillageName(rawName)) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  const name = rawName.trim();

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 마을 건설 = 마스터/관리자 전용(관리 탭).
      if (!(await isGuildMasterOrManager(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }
      const existing = await lockVillage(tx, outpostId);
      if (existing) {
        const village = normalizeVillageOwner(existing, guildId);
        if (village.name != null) {
          return {
            status: 409,
            body: { ok: false as const, error: "already_built" },
          };
        }
        // 이름 없는 옛 row — 이름만 채워 건설(무료, 기존 판/슬롯 보존).
        await upsertVillage(tx, { ...village, name });
        return {
          status: 200,
          body: { ok: true as const, name, tier: village.tier },
        };
      }
      // 새 마을 — 건설 비용(길드 금고 골드) 차감.
      const res = await lockGuildResources(tx, guildId);
      if (res.gold < VILLAGE_BUILD_GOLD_COST) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            cost: VILLAGE_BUILD_GOLD_COST,
          },
        };
      }
      const village = {
        outpostId,
        guildId,
        ownerUserId: null,
        tier: "village",
        name,
        productionKind: null,
        unlockedSlots: INITIAL_UNLOCKED_SLOTS,
        slotKinds: {},
        buildings: {},
        jobs: {},
      } satisfies VillageRow;
      await upsertVillage(tx, village);
      await upsertGuildResources(tx, guildId, {
        gold: res.gold - VILLAGE_BUILD_GOLD_COST,
      });
      return {
        status: 200,
        body: { ok: true as const, name: village.name, tier: village.tier },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
