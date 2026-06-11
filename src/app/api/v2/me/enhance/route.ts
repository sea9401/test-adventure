import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  isUnique,
  parseEquipmentSave,
  removeInstance,
  V2_EQUIPMENT,
} from "@/adventure/data/v2/v2Equipment";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  ENHANCE_DEMOTE_FROM_LEVEL,
  ENHANCE_FEED_MIN_LEVEL,
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_UNIQUE_COST_MULT,
  demoteEnhance,
  enhanceChoiceProfile,
  enhanceGoldCost,
  enhanceStoneCost,
  enhanceSuccessPct,
  type EnhanceChoice,
} from "@/adventure/data/v2/v2Enhance";

// POST /api/v2/me/enhance — 장비 개체 강화 1회 시도. 설계: docs/v2-equipment-enhance-plan.md
//
// body: { iid: string, stone?: "red" | "blue" | "none", feedIid?: string }
//   stone   — 선택 부스터(없으면/"none" = 골드만 기본 강화 +1%p·성공률 −15%p).
//             붉은(+3%p·−10%p) / 푸른(+2%p·보정 없음). 매 회 선택.
//   feedIid — 같은 id 의 다른 보유 개체(미장착·미잠금)를 먹이면 그 회차 강화석 면제(골드만).
//             돌 미사용(골드만) 모드에선 의미가 없어 거부(개체 보호).
//
// 비용: 강화석 enhanceStoneCost(level)·골드 enhanceGoldCost(power, level), 유니크 ×2.
// 성공: enhance {level+1, bonusPct+돌 보너스}.
// 실패: 재료 소실 + 현재 레벨 ≥ ENHANCE_DEMOTE_FROM_LEVEL(6) 이면 강화 −1 하락(파괴 없음).
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
  const stone: EnhanceChoice =
    body.stone === "red" || body.stone === "blue"
      ? body.stone
      : body.stone == null || body.stone === "none"
        ? "none"
        : "invalid" as never;
  const feedIid =
    typeof body.feedIid === "string" && body.feedIid.length > 0
      ? body.feedIid
      : null;
  if (!iid || (stone as string) === "invalid") {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  if (feedIid === iid) {
    return Response.json({ ok: false, error: "bad_feed" }, { status: 400 });
  }
  // 골드만 모드에서 먹이 — 면제할 강화석이 없어 개체만 날아감. 거부(보호).
  if (feedIid && stone === "none") {
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

    // 비용 — 강화석(골드만 모드 0·먹이면 면제)·골드. 유니크 ×2. 위력은 개체 굴림 기준.
    const uniqueMult = isUnique(item) ? ENHANCE_UNIQUE_COST_MULT : 1;
    const stoneId =
      stone === "none" ? null : ENHANCE_STONE_MATERIAL_ID[stone];
    const stoneCost =
      stone === "none" || feed ? 0 : enhanceStoneCost(level) * uniqueMult;
    const basePower = inst.roll?.power ?? item.power;
    const goldCost = enhanceGoldCost(basePower, level) * uniqueMult;

    const mats = { ...(charSave.materials ?? {}) };
    const haveStones = stoneId
      ? Math.max(0, Math.floor(Number(mats[stoneId]) || 0))
      : 0;
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
    if (stoneCost > 0 && stoneId) {
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
    let nextEnhance: typeof inst.enhance = inst.enhance;
    let demoted = false;
    if (success) {
      nextEnhance = {
        level: level + 1,
        bonusPct:
          (inst.enhance?.bonusPct ?? 0) + enhanceChoiceProfile(stone).bonusPct,
      };
      nextOwned = nextOwned.map((o) =>
        o.iid === iid ? { ...o, enhance: nextEnhance } : o,
      );
    } else if (inst.enhance && level >= ENHANCE_DEMOTE_FROM_LEVEL) {
      // 고강 실패 — 1단계 하락(보너스는 평균 비례 차감). 파괴 없음.
      demoted = true;
      nextEnhance = demoteEnhance(inst.enhance);
      nextOwned = nextOwned.map((o) =>
        o.iid === iid
          ? nextEnhance
            ? { ...o, enhance: nextEnhance }
            : { ...o, enhance: undefined }
          : o,
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
        demoted,
        itemId: inst.id,
        enhance: nextEnhance ?? null,
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

  // 고강 자랑 피드 — tx 커밋 후 부수효과. 자랑거리(unique_drop 동류)라 shareFeed
  // opt-out 존중(force 아님). 전광판 묶음(WAR_FEED_TYPES)에 포함돼 티커에도 흐른다.
  const fb = result.body as {
    ok?: boolean;
    success?: boolean;
    enhance?: { level: number } | null;
  };
  if (fb.ok && fb.success && (fb.enhance?.level ?? 0) >= ENHANCE_FEED_MIN_LEVEL) {
    const itemId = (result.body as { itemId?: string }).itemId;
    if (itemId) {
      await insertFeedEntry(userId, "enhance_high", {
        itemId,
        level: fb.enhance!.level,
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
