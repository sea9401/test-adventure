import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  SETTLEMENT_MATERIAL_ID,
  WALL_REPAIR_KIT_ID,
  WALL_REPAIR_KIT_COST,
} from "@/adventure/data/v2/settlementMaterials";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// POST /api/v2/me/repair-kit-combine — 통나무 N + 철광석 N → 성벽 수리 키트 1개.
//   결정론·무료(골드 없음). 재련석 조합 라우트 패턴 미러. body 없음.
//   락: character.v2 (materials 만 변경). 게이트: V2_SETTLEMENT_WARFARE.

type CharSave = { materials?: Record<string, number>; [k: string]: unknown };

export async function POST() {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const timberId = SETTLEMENT_MATERIAL_ID.timber;
  const oreId = SETTLEMENT_MATERIAL_ID.ironOre;
  const needTimber = WALL_REPAIR_KIT_COST[timberId];
  const needOre = WALL_REPAIR_KIT_COST[oreId];

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const mats = { ...(charSave.materials ?? {}) };
    const haveTimber = Math.max(0, Math.floor(Number(mats[timberId]) || 0));
    const haveOre = Math.max(0, Math.floor(Number(mats[oreId]) || 0));
    if (haveTimber < needTimber || haveOre < needOre) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_material" as const,
          needTimber,
          needOre,
        },
      };
    }

    // 통나무·철광석 차감(0 이면 키 제거) + 키트 1개 적립.
    const timberLeft = haveTimber - needTimber;
    if (timberLeft > 0) mats[timberId] = timberLeft;
    else delete mats[timberId];
    const oreLeft = haveOre - needOre;
    if (oreLeft > 0) mats[oreId] = oreLeft;
    else delete mats[oreId];
    const haveKits = Math.max(
      0,
      Math.floor(Number(mats[WALL_REPAIR_KIT_ID]) || 0),
    );
    mats[WALL_REPAIR_KIT_ID] = haveKits + 1;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: mats,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        timberLeft,
        oreLeft,
        kits: mats[WALL_REPAIR_KIT_ID],
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
