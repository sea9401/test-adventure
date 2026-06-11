import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  isUnique,
  parseEquipmentSave,
  removeInstance,
  V2_EQUIPMENT,
} from "@/adventure/data/v2/v2Equipment";
import {
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_STONES,
  ENHANCE_UNIQUE_COST_MULT,
  enhanceGoldCost,
  enhanceStoneCost,
  enhanceSuccessPct,
  type EnhanceStoneId,
} from "@/adventure/data/v2/v2Enhance";

// POST /api/v2/me/enhance — 장비 개체 강화 1회 시도. 설계: docs/v2-equipment-enhance-plan.md
//
// body: { iid: string, stone: "red" | "blue", feedIid?: string }
//   stone   — 붉은(+3%p·성공률 −10%p) / 푸른(+2%p·보정 없음). 매 회 선택.
//   feedIid — 같은 id 의 다른 보유 개체(미장착·미잠금)를 먹이면 그 회차 강화석 면제(골드만).
//
// 비용: 강화석 enhanceStoneCost(level)·골드 enhanceGoldCost(power, level), 유니크 ×2.
// 성공: enhance {level+1, bonusPct+돌 보너스}. 실패: 재료만 소실(하락·파괴 없음).
// 락 순서: character.v2 → equipment.v2 (처분 라우트들과 동일).

type CharSave = {
  gold?: number;
  materials?: Record<string, number>;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { iid?: unknown; stone?: unknown; feedIid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  const stone =
    body.stone === "red" || body.stone === "blue"
      ? (body.stone as EnhanceStoneId)
      : null;
  const feedIid =
    typeof body.feedIid === "string" && body.feedIid.length > 0
      ? body.feedIid
      : null;
  if (!iid || !stone) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  if (feedIid === iid) {
    return Response.json({ ok: false, error: "bad_feed" }, { status: 400 });
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
    const level = inst.enhance?.level ?? 0;
    if (level >= ENHANCE_MAX_LEVEL) {
      return {
        status: 400,
        body: { ok: false as const, error: "max_level" as const },
      };
    }

    // 먹이 검증 — 같은 id·다른 개체·미장착·미잠금.
    let feed = null as (typeof owned)[number] | null;
    if (feedIid) {
      feed = owned.find((o) => o.iid === feedIid) ?? null;
      if (!feed || feed.id !== inst.id) {
        return {
          status: 400,
          body: { ok: false as const, error: "bad_feed" as const },
        };
      }
      if (Object.values(equipped).includes(feedIid) || feed.locked) {
        return {
          status: 400,
          body: { ok: false as const, error: "feed_in_use" as const },
        };
      }
    }

    // 비용 — 강화석(먹이면 면제)·골드. 유니크 ×2. 위력은 개체 굴림(없으면 카탈로그) 기준.
    const uniqueMult = isUnique(item) ? ENHANCE_UNIQUE_COST_MULT : 1;
    const stoneId = ENHANCE_STONE_MATERIAL_ID[stone];
    const stoneCost = feed ? 0 : enhanceStoneCost(level) * uniqueMult;
    const basePower = inst.roll?.power ?? item.power;
    const goldCost = enhanceGoldCost(basePower, level) * uniqueMult;

    const mats = { ...(charSave.materials ?? {}) };
    const haveStones = Math.max(0, Math.floor(Number(mats[stoneId]) || 0));
    const haveGold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    if (haveStones < stoneCost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_stone" as const,
          stoneCost,
        },
      };
    }
    if (haveGold < goldCost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost,
        },
      };
    }

    // 차감(성공/실패 무관) — 실패 = 재료만 소실.
    if (stoneCost > 0) {
      const left = haveStones - stoneCost;
      if (left > 0) mats[stoneId] = left;
      else delete mats[stoneId];
    }
    const nextGold = haveGold - goldCost;

    // 성공 롤 — 서버 권위.
    const successPct = enhanceSuccessPct(level, stone);
    const success = Math.random() * 100 < successPct;

    let nextOwned = owned;
    if (feed) {
      const removed = removeInstance(owned, feed.iid);
      nextOwned = removed.owned;
    }
    let nextEnhance = inst.enhance ?? { level: 0, bonusPct: 0 };
    if (success) {
      nextEnhance = {
        level: level + 1,
        bonusPct: nextEnhance.bonusPct + ENHANCE_STONES[stone].bonusPct,
      };
      nextOwned = nextOwned.map((o) =>
        o.iid === iid ? { ...o, enhance: nextEnhance } : o,
      );
    }

    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: nextGold,
      materials: mats,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        success,
        successPct,
        enhance: success ? nextEnhance : (inst.enhance ?? null),
        stoneCost,
        goldCost,
        gold: nextGold,
        stones: {
          red: Math.max(
            0,
            Math.floor(Number(mats[ENHANCE_STONE_MATERIAL_ID.red]) || 0),
          ),
          blue: Math.max(
            0,
            Math.floor(Number(mats[ENHANCE_STONE_MATERIAL_ID.blue]) || 0),
          ),
        },
        feedUsed: !!feed,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
