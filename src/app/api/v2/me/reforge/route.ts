import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
} from "@/adventure/data/v2/v2Equipment";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  canReforge,
  reforgeGoldCost,
  rollItemStats,
  rollQualityPct,
} from "@/adventure/data/v2/v2EquipVariance";

// POST /api/v2/me/reforge — 장비 개체의 옵션 굴림을 1회 재시도(항상 적용 = 도박).
// 엔드게임 "재고(stock) 골드 sink". body: { iid: string }
//
// 비용(reforgeGoldCost·카탈로그 위력 기준·유니크 ×2)을 결과와 무관하게 선차감한 뒤
// rollItemStats(드랍과 동일 분포)로 굴림을 다시 생성해 **무조건 덮어쓴다**(되돌림 없음).
// 강화 레벨·장착 슬롯·잠금은 불변(재련 ≠ 강화). 결과 굴림은 기존 드랍 범위 안이라
// 신규 파워 천장 없음(파워크립 0). 락 순서: character.v2 → equipment.v2 (강화 라우트와 동일).

type CharSave = {
  gold?: number;
  bankedGold?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  if (!iid) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipRaw);

    const inst = owned.find((o) => o.iid === iid);
    if (!inst) {
      return {
        status: 404,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const item = V2_EQUIPMENT[inst.id];
    if (!item) {
      return {
        status: 404,
        body: { ok: false as const, error: "unknown_item" as const },
      };
    }
    // 굴림 없는 상점 정가템·변동 0 아이템은 재련 불가(골드만 날림 방지).
    if (!canReforge(item, inst.roll)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_reforgeable" as const },
      };
    }

    // 비용 — 카탈로그 위력 기준 고정(유니크 ×2). 도박이라 결과 무관 선차감.
    const goldCost = reforgeGoldCost(item);
    const haveGold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const spend = spendGold(haveGold, bankedGold, goldCost);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost,
        },
      };
    }

    // 굴림 재생성 — 드랍과 동일 분포. 서버 권위(Math.random). 항상 적용.
    const oldRoll = inst.roll;
    const oldQuality = rollQualityPct(item, oldRoll);
    const newRoll = rollItemStats(item, Math.random);
    const newQuality = rollQualityPct(item, newRoll);

    const nextOwned = owned.map((o) =>
      o.iid === iid ? { ...o, roll: newRoll } : o,
    );

    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: inst.id,
        goldCost,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
        oldRoll,
        newRoll,
        oldQuality,
        newQuality,
        // 굴림 품질이 올랐는지 — UI 강조용. 동률/하락이면 false.
        improved:
          oldQuality != null && newQuality != null && newQuality > oldQuality,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
