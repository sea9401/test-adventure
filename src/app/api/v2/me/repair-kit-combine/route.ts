import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  SETTLEMENT_MATERIAL_ID,
  WALL_REPAIR_KIT_ID,
  WALL_REPAIR_KIT_COST,
} from "@/adventure/data/v2/settlementMaterials";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// POST /api/v2/me/repair-kit-combine — 통나무 N + 철광석 N → 성벽 수리 키트 1개.
//   결정론. 골드 비용 COMBINE_GOLD_COST(조합 공통). 재련석 조합 라우트 패턴 미러. body 없음.
//   락: character.v2 (materials + gold 변경). 게이트: V2_SETTLEMENT_WARFARE.

type CharSave = {
  materials?: Record<string, number>;
  gold?: number;
  bankedGold?: number;
  [k: string]: unknown;
};

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

    // 골드 비용 — 코어루프 on 이면 은행 우선 차감(재련석 조합과 동일).
    const haveGold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const spend = spendGold(haveGold, bankedGold, COMBINE_GOLD_COST);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost: COMBINE_GOLD_COST,
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
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      materials: mats,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        timberLeft,
        oreLeft,
        kits: mats[WALL_REPAIR_KIT_ID],
        goldCost: COMBINE_GOLD_COST,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
