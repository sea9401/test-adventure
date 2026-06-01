import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { FISH } from "@/adventure/data/v2/fish";
import {
  FISHING_SESSION_KEY,
  judgeCatch,
  parseFishingSession,
} from "@/adventure/v2/fishingSession";
import {
  FISHING_CODEX_KEY,
  countDiscoveredFish,
  parseFishCodex,
  recordCatch,
} from "@/adventure/v2/fishingCodex";
import { currentFishingSeasonId } from "@/lib/server/fishing/season";
import { upsertFishingRecord } from "@/lib/server/fishing/records";

// POST /api/v2/fishing/reel — 챔질. body: { castId, reactionMs }.
//
// 세션을 잠가 검증·소비(한 캐스팅 = 한 번의 시도; 성공/실패 무관 소비 → replay 차단).
// 성공이면 cast 때 박제한 어획을 그대로 지급하고 낚시 도감(fishing-codex.v1)에 등록한다.
// 리더보드/코인은 후속 PR(PR-4·5).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const b = (body ?? {}) as { castId?: unknown; reactionMs?: unknown };
  if (typeof b.castId !== "string" || typeof b.reactionMs !== "number" || !Number.isFinite(b.reactionMs)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const castId = b.castId;
  const reactionMs = b.reactionMs;
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const session = parseFishingSession(
      await lockSaveForUpdate(tx, userId, FISHING_SESSION_KEY, {}),
    );
    // 열린 세션 없음 = cast 안 함 / 이미 소비됨.
    if (!session) return { caught: false as const, reason: "no_session" as const };
    // 새 캐스팅이 이 세션을 덮어썼다(다른 castId) — 현재 세션은 보존하고 거부.
    if (session.castId !== castId) {
      return { caught: false as const, reason: "stale" as const };
    }

    // castId 일치 → 판정하고 세션 소비(성공/실패 무관).
    await upsertSave(tx, userId, FISHING_SESSION_KEY, {});
    const judgment = judgeCatch({
      reactionMs,
      serverNow: now,
      biteAt: session.biteAt,
      expiresAt: session.expiresAt,
    });
    if (!judgment.caught) {
      return { caught: false as const, reason: judgment.reason };
    }

    // 도감 등록 — 같은 트랜잭션에서 코덱스 키를 잠그고 갱신.
    const codex = parseFishCodex(
      await lockSaveForUpdate(tx, userId, FISHING_CODEX_KEY, {}),
    );
    const prev = codex.fish[session.fishId];
    const prevBest = prev?.bestSize ?? 0;
    const isNewSpecies = !prev?.discovered;
    const isPersonalBest = session.size > prevBest;
    const next = recordCatch(codex, session.fishId, session.size, now);
    await upsertSave(tx, userId, FISHING_CODEX_KEY, next);

    // 주간 종별 기록 upsert(개인 최대어) — 같은 tx. 리더보드/정산(PR-5)의 원천.
    await upsertFishingRecord(
      tx,
      userId,
      currentFishingSeasonId(new Date(now)),
      session.fishId,
      session.size,
      new Date(now),
    );

    return {
      caught: true as const,
      fishId: session.fishId,
      size: session.size,
      isNewSpecies,
      isPersonalBest,
      prevBest,
      codexCount: countDiscoveredFish(next),
    };
  });

  if (!result.caught) {
    return Response.json({ ok: true, caught: false, reason: result.reason });
  }
  const fish = FISH[result.fishId];
  return Response.json({
    ok: true,
    caught: true,
    fishId: result.fishId,
    name: fish.name,
    tier: fish.tier,
    size: result.size,
    isNewSpecies: result.isNewSpecies,
    isPersonalBest: result.isPersonalBest,
    prevBest: result.prevBest,
    codexCount: result.codexCount,
  });
}
