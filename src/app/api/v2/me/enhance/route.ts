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
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  ENHANCE_FEED_MIN_LEVEL,
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_STONE_REQUIRED_FROM,
  ENHANCE_UNIQUE_COST_MULT,
  demoteEnhance,
  enhanceBonusPct,
  enhanceGoldCost,
  enhanceOutcomeRow,
  enhanceStoneCost,
  rollEnhanceOutcome,
  type EnhanceChoice,
} from "@/adventure/data/v2/v2Enhance";
import {
  checkUserRateLimit,
  userRateLimitResponse,
} from "@/lib/server/userRateLimit";

// POST /api/v2/me/enhance — 장비 개체 강화 1회 시도. 설계: docs/v2-equipment-enhance-plan.md
//
// body: { iid: string, stone?: "red" | "blue" | "none", feedIid?: string }
//   stone   — 골드만("none"/생략, +7까지) 또는 돌. **+8부터(레벨 ≥7 시도)는 돌 필수.**
//             🔴 붉은 = 성공 +15%p(파괴 불변 — 도박) / 🔵 푸른 = 파괴→하락 전환+하락 −10%p.
//   feedIid — 같은 id 의 다른 보유 개체(미장착·미잠금)를 먹이면 그 회차 강화석 면제.
//             골드만 모드에선 의미가 없어 거부(개체 보호).
//
// 결과(4종, enhanceOutcomeRow): 성공(+1·구간 보너스) / 유지 / 하락(−1) / 파괴(개체 소멸).
// 비용: 강화석 enhanceStoneCost(level)·골드 enhanceGoldCost(제곱 램프), 유니크 ×2 —
// 성공/실패 무관 선차감.
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
  const rateLimit = checkUserRateLimit({
    userId,
    action: "v2:me:enhance",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return userRateLimitResponse(rateLimit.retryAfterSec);
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
    // 고강(+8부터) 돌 필수 — 골드만으로는 +7 이 천장(돌 = 고강 입장권).
    if (level >= ENHANCE_STONE_REQUIRED_FROM && stone === "none") {
      return {
        status: 400,
        body: { ok: false as const, error: "stone_required" as const },
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
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
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

    // 차감(성공/실패 무관) — 실패 = 재료만 소실.
    if (stoneCost > 0 && stoneId) {
      const left = haveStones - stoneCost;
      if (left > 0) mats[stoneId] = left;
      else delete mats[stoneId];
    }
    const nextGold = spend.gold;
    const nextBankedGold = spend.bankedGold;

    // 결과 롤 — 서버 권위. 4결과(성공/유지/하락/파괴).
    const outcomeRow = enhanceOutcomeRow(level, stone);
    const outcome = rollEnhanceOutcome(level, stone, Math.random);

    let nextOwned = owned;
    if (feed) {
      const removed = removeInstance(owned, feed.iid);
      nextOwned = removed.owned;
    }
    let nextEnhance: typeof inst.enhance = inst.enhance;
    let nextEquipped = equipped;
    if (outcome === "success") {
      nextEnhance = {
        level: level + 1,
        bonusPct: enhanceBonusPct(level + 1),
      };
      nextOwned = nextOwned.map((o) =>
        o.iid === iid ? { ...o, enhance: nextEnhance } : o,
      );
    } else if (outcome === "demote" && inst.enhance) {
      nextEnhance = demoteEnhance(inst.enhance);
      nextOwned = nextOwned.map((o) =>
        o.iid === iid
          ? nextEnhance
            ? { ...o, enhance: nextEnhance }
            : { ...o, enhance: undefined }
          : o,
      );
    } else if (outcome === "destroy") {
      // 파괴 — 개체 소멸. 장착 중이었으면 슬롯 해제.
      const removed = removeInstance(nextOwned, iid);
      nextOwned = removed.owned;
      nextEnhance = undefined;
      const cleared = { ...equipped };
      for (const [slot, eqIid] of Object.entries(cleared)) {
        if (eqIid === iid) delete cleared[slot as keyof typeof cleared];
      }
      nextEquipped = cleared;
    }

    // 반복 퀘스트 신호 — 강화 시도 누적(성공/실패 무관). lock 순서: character →
    // equipment → adventure-log (hunt 의 character→…→adventure-log 와 정합).
    const logSave = await lockSaveForUpdate<{
      enhanceAttempts?: unknown;
      [k: string]: unknown;
    }>(tx, userId, "adventure-log.v2", {});
    await upsertSave(tx, userId, "adventure-log.v2", {
      ...logSave,
      enhanceAttempts: (Number(logSave.enhanceAttempts) || 0) + 1,
    });

    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: nextEquipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: nextGold,
      bankedGold: nextBankedGold,
      materials: mats,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        outcome,
        outcomeRow, // [성공, 유지, 하락, 파괴] % — UI 표시용
        // 하위 호환 표기 — success 플래그(UI/피드 분기 공용).
        success: outcome === "success",
        demoted: outcome === "demote",
        destroyed: outcome === "destroy",
        // 파괴 전광판용 — 잃은 개체의 강화 레벨(시도 전 레벨). enhance 는 파괴 시 null 이라 별도.
        fromLevel: level,
        itemId: inst.id,
        enhance: nextEnhance ?? null,
        stoneCost,
        goldCost,
        gold: nextGold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: nextBankedGold } : {}),
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

  // 고강 자랑 피드 — tx 커밋 후 부수효과. 자랑거리(unique_drop 동류)라 디바운스
  // opt-out 존중(force 아님). 전광판 묶음(WAR_FEED_TYPES)에 포함돼 티커에도 흐른다.
  const fb = result.body as {
    ok?: boolean;
    success?: boolean;
    destroyed?: boolean;
    fromLevel?: number;
    enhance?: { level: number } | null;
    itemId?: string;
  };
  if (fb.ok && fb.itemId) {
    // 성공 = 달성 레벨이 임계 이상. 파괴 = 잃은 개체가 같은 임계 이상(고강 손실도 사건).
    if (fb.success && (fb.enhance?.level ?? 0) >= ENHANCE_FEED_MIN_LEVEL) {
      await insertFeedEntry(userId, "enhance_high", {
        itemId: fb.itemId,
        level: fb.enhance!.level,
      });
    } else if (fb.destroyed && (fb.fromLevel ?? 0) >= ENHANCE_FEED_MIN_LEVEL) {
      await insertFeedEntry(userId, "enhance_destroy", {
        itemId: fb.itemId,
        level: fb.fromLevel!,
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
