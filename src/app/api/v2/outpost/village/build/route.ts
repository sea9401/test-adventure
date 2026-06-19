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
  INITIAL_UNLOCKED_SLOTS,
} from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/build — body { outpostId, name }
// 점령한 빈 공터에 마을을 세운다 — 이름만 정한다(생산 종류는 칸을 해금할 때 칸마다 고른다).
//   마스터/부마스터 전용. 건설 직후엔 빈 판(0칸) — 첫 칸부터 골드로 해금한다(unlock-slot).
//   - 마을 없음 → 새로 건설(village 단계, 이름만).
//   - 마을 있고 이름 없음(옛 lazy 생성분) → 이름만 채워 건설.
//   - 이미 이름 있음 → 409 already_built (개명은 /rename).
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
        if (village.name != null) {
          return {
            status: 409,
            body: { ok: false as const, error: "already_built" },
          };
        }
        // 이름 없는 옛 row — 이름만 채워 건설(기존 판/슬롯 보존).
        village = { ...village, name };
      } else {
        village = {
          outpostId,
          guildId,
          tier: "village",
          name,
          productionKind: null,
          unlockedSlots: INITIAL_UNLOCKED_SLOTS,
          slotKinds: {},
          jobs: {},
        } satisfies VillageRow;
      }
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: {
          ok: true as const,
          name: village.name,
          tier: village.tier,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
