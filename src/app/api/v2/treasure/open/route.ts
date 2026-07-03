import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { maxGuildSettlementBuildingLevel } from "@/lib/server/settlementBuildingLevels";
import {
  TREASURE_SESSION_KEY,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
} from "@/adventure/v2/treasureDig";
import {
  TREASURE_FRAGMENTS_KEY,
  FRAGMENTS_PER_MAP,
  fragmentsRequiredForMapWorkshopLevel,
  mapWorkshopFragmentDiscountPct,
  parseTreasureFragments,
  spendOneMapWithCost,
} from "@/adventure/v2/treasureFragments";

// POST /api/v2/treasure/open — 지도 조각을 소비해 발굴 지점을 연다.
// 길드 영지에 지도 제작소가 있으면 최고 레벨 기준으로 필요 조각 수를 줄인다.
//
// 매장지·골동품(희귀도·보존상태)은 여기서 서버가 굴려 세션에 박제한다. 응답엔 비밀(매장지/
// 골동품)을 절대 싣지 않는다 — 격자 공개 뷰만. 이미 진행 중인 발굴이 있으면 조각 소비 없이
// 그 공개 뷰를 돌려준다(resume). 락 순서: treasure-fragments → treasure-session
// (조각 row 를 직렬화 지점으로 — 본문 주석 참고).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:treasure:open",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    // 락 순서: treasure-fragments 를 먼저 잠가 동시 open 을 직렬화한다. (조각 row 는 발굴
    // 가능 수량일 때 반드시 존재 → 실제 row 락. 세션 row 는 아직 없을 수 있어 그 락만으론
    // 직렬화가 안 된다.) 그 다음 세션을 잠가 직전 커밋된 세션이 보이면 resume → 조각 이중
    // 소비·세션 덮어쓰기 방지.
    const frags = parseTreasureFragments(
      await lockSaveForUpdate(tx, userId, TREASURE_FRAGMENTS_KEY, {}),
    );
    const existing = parseTreasureSession(
      await lockSaveForUpdate(tx, userId, TREASURE_SESSION_KEY, {}),
    );
    const guildId = await getGuildId(tx, userId);
    const mapWorkshopLevel =
      guildId == null
        ? 0
        : await maxGuildSettlementBuildingLevel(tx, guildId, "map_workshop");
    const needed = fragmentsRequiredForMapWorkshopLevel(mapWorkshopLevel);
    const discountPct = mapWorkshopFragmentDiscountPct(mapWorkshopLevel);
    // 진행 중 세션 = 이미 조각을 낸 발굴. 새로 열지 않고 그대로 이어준다.
    if (existing) {
      return {
        ok: true as const,
        resumed: true as const,
        site: toPublicSite(existing),
        needed,
        baseNeeded: FRAGMENTS_PER_MAP,
        mapWorkshopLevel,
        discountPct,
      };
    }

    const spent = spendOneMapWithCost(frags, needed);
    if (!spent) {
      return {
        ok: false as const,
        error: "not_enough_fragments" as const,
        fragments: frags.fragments,
        needed,
        baseNeeded: FRAGMENTS_PER_MAP,
        mapWorkshopLevel,
        discountPct,
      };
    }
    await upsertSave(tx, userId, TREASURE_FRAGMENTS_KEY, spent);

    const session = rollNewSession({ siteId: randomUUID(), rng: Math.random, now });
    await upsertSave(tx, userId, TREASURE_SESSION_KEY, session);
    return {
      ok: true as const,
      resumed: false as const,
      site: toPublicSite(session),
      fragments: spent.fragments,
      needed,
      baseNeeded: FRAGMENTS_PER_MAP,
      mapWorkshopLevel,
      discountPct,
    };
  });

  if (!result.ok) {
    return Response.json(result, { status: 409 });
  }
  return Response.json(result);
}
