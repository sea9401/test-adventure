import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
  type VillageRow,
} from "@/lib/server/v2Settlement";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  isValidVillageName,
  isValidProductionKind,
  INITIAL_UNLOCKED_SLOTS,
} from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/build — body { outpostId, name, kind }
// 점령한 빈 공터에 마을을 세운다 — 이름 + 특화 생산 종류(crop|ore|fish)를 함께 정한다.
//   종류는 영구(개명은 /rename 으로 가능하지만 종류 변경은 없음). 건설 완료 = name + productionKind.
//   - 마을 없음 → 새로 건설(village 단계, name+kind).
//   - 마을 있고 미완(이름 또는 종류 없음·옛 lazy 생성분) → 빠진 것만 채워 건설 완료(소급).
//   - 이미 완성(이름+종류) → 409 already_built (개명은 /rename, 종류 변경 없음).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; name?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const rawName = typeof body.name === "string" ? body.name : "";
  if (!outpostId || !isValidVillageName(rawName)) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  if (!isValidProductionKind(body.kind)) {
    return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const name = rawName.trim();
  const kind = body.kind;

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 마을 건설 = 마스터/부마스터 전용(관리 탭).
      if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }
      let village = await lockVillage(tx, outpostId);
      if (village) {
        village = normalizeVillageOwner(village, guildId);
        if (village.name != null && village.productionKind != null) {
          return {
            status: 409,
            body: { ok: false as const, error: "already_built" },
          };
        }
        // 미완(이름 또는 종류 빠짐) — 빠진 것만 채운다(기존 값 보존).
        village = {
          ...village,
          name: village.name ?? name,
          productionKind: village.productionKind ?? kind,
        };
      } else {
        village = {
          outpostId,
          guildId,
          tier: "village",
          name,
          productionKind: kind,
          unlockedSlots: INITIAL_UNLOCKED_SLOTS,
          jobs: {},
        } satisfies VillageRow;
      }
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: {
          ok: true as const,
          name: village.name,
          productionKind: village.productionKind,
          tier: village.tier,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
