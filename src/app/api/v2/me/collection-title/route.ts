import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate } from "@/lib/server/savesKv";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { countCollectedPassives } from "@/adventure/data/v2/v2JobCodex";
import {
  COLLECTION_SHOP_TITLES,
  collectionTitleCost,
  totalCollectionSpend,
  isCollectionShopTitle,
} from "@/adventure/data/v2/v2CollectionTitles";
import { TITLES } from "@/adventure/data/titles";
import {
  grantTitleIfMissingInTx,
  ownedTitleIdsOf,
} from "@/lib/server/grantTitle";

// 수집 칭호 상점(A 메타 — 소비형 수집 포인트 sink). 수집 포인트로 비파워 prestige 칭호 구매.
//   포인트 풀은 프리셋 슬롯과 공유(totalCollectionSpend). 등급(collectionRank)은 누적 기준이라
//   구매해도 안 떨어진다. 구매한 칭호는 adventure-log.v2 의 titles 에 영구 등록(grantTitle).

// 상점 현황(파생) — 품목 목록(보유 여부 포함) + 수집 포인트/잔액.
function shopStateOf(skills: V2SkillsState, ownedTitleIds: readonly string[]) {
  const owned = new Set(ownedTitleIds);
  const lifetime = countCollectedPassives(skills.learned);
  const spent = totalCollectionSpend(
    skills.loadoutPresetSlotsBought ?? 0,
    ownedTitleIds,
  );
  return {
    titles: COLLECTION_SHOP_TITLES.map((t) => {
      const def = TITLES[t.id];
      return {
        id: t.id,
        name: def?.name ?? t.id,
        description: def?.description ?? "",
        cost: t.cost,
        owned: owned.has(t.id),
      };
    }),
    collectionPoints: lifetime,
    collectionPointsSpent: spent,
    collectionPointsAvailable: Math.max(0, lifetime - spent),
  };
}

// GET — 상점 품목/포인트 현황(읽기 전용).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, ["skills.v2", "adventure-log.v2"]),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const skills = parseV2SkillsState(byKey.get("skills.v2"));
  const ownedTitleIds = ownedTitleIdsOf(byKey.get("adventure-log.v2"));
  return Response.json({ ok: true, ...shopStateOf(skills, ownedTitleIds) });
}

// POST — { action: "buy", titleId }.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; titleId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.action !== "buy") {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const titleId = typeof body.titleId === "string" ? body.titleId : "";
  if (!isCollectionShopTitle(titleId)) {
    return Response.json({ ok: false, error: "bad_title" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서 skills.v2 → adventure-log.v2 (프리셋 라우트와 동일 — 같은 포인트 풀 race 방지).
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const ownedTitleIds = ownedTitleIdsOf(
      await lockSaveForUpdate(tx, userId, "adventure-log.v2", {}),
    );

    if (ownedTitleIds.includes(titleId)) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_owned" as const },
      };
    }
    const cost = collectionTitleCost(titleId);
    const lifetime = countCollectedPassives(skills.learned);
    const available = Math.max(
      0,
      lifetime - totalCollectionSpend(skills.loadoutPresetSlotsBought ?? 0, ownedTitleIds),
    );
    if (available < cost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_points" as const,
          need: cost,
          have: available,
        },
      };
    }

    await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    // 구매 후 상태 — 방금 산 칭호 포함.
    const nextOwned = [...ownedTitleIds, titleId];
    return {
      status: 200,
      body: { ok: true as const, ...shopStateOf(skills, nextOwned) },
    };
  });

  return Response.json(result.body, { status: result.status });
}
