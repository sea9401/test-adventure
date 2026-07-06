import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  TREASURE_SESSION_KEY,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
} from "@/adventure/v2/treasureDig";
import {
  TREASURE_FRAGMENTS_KEY,
  FRAGMENTS_PER_MAP,
  parseTreasureFragments,
  spendOneMap,
} from "@/adventure/v2/treasureFragments";

// POST /api/v2/treasure/open — 지도 조각 K개를 소비해 발굴 지점을 연다.
//
// 매장지·골동품(희귀도·보존상태)은 여기서 서버가 굴려 세션에 박제한다. 응답엔 비밀(매장지/
// 골동품)을 절대 싣지 않는다 — 심도/전리품 공개 뷰만. 이미 진행 중인 발굴이 있으면 조각 소비 없이
// 그 공개 뷰를 돌려준다(resume). 락 순서: treasure-fragments → treasure-session
// (조각 row 를 직렬화 지점으로 — 본문 주석 참고).
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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
    // 진행 중 세션 = 이미 조각을 낸 발굴. 새로 열지 않고 그대로 이어준다.
    if (existing) {
      return {
        ok: true as const,
        resumed: true as const,
        site: toPublicSite(existing),
      };
    }

    const spent = spendOneMap(frags);
    if (!spent) {
      return {
        ok: false as const,
        error: "not_enough_fragments" as const,
        fragments: frags.fragments,
        needed: FRAGMENTS_PER_MAP,
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
    };
  });

  if (!result.ok) {
    return Response.json(result, { status: 409 });
  }
  return Response.json(result);
}
