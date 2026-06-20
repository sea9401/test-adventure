import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { FISH } from "@/adventure/data/v2/fish";
import { MULTTAE_BY_ID } from "@/adventure/data/v2/multtae";
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
import {
  TREASURE_FRAGMENTS_KEY,
  FISHING_FRAGMENT_DROP_CHANCE,
  addFragments,
  parseTreasureFragments,
  rollFragmentDrop,
} from "@/adventure/v2/treasureFragments";

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

    // 보물 탐사 — 챔질 성공 시 낮은 확률로 지도 조각 드랍(주 경로). 굴림은 100% 서버.
    // 드랍 났을 때만 키를 잠그고 누적(매 캐스팅 잠금 회피). 조각 소비(발굴)는 PR-3.
    const fragmentDrop = rollFragmentDrop(Math.random, FISHING_FRAGMENT_DROP_CHANCE);
    let fragmentsTotal = 0;
    if (fragmentDrop > 0) {
      const frags = parseTreasureFragments(
        await lockSaveForUpdate(tx, userId, TREASURE_FRAGMENTS_KEY, {}),
      );
      const nextFrags = addFragments(frags, fragmentDrop);
      await upsertSave(tx, userId, TREASURE_FRAGMENTS_KEY, nextFrags);
      fragmentsTotal = nextFrags.fragments;
    }

    return {
      caught: true as const,
      fishId: session.fishId,
      size: session.size,
      isNewSpecies,
      isPersonalBest,
      prevBest,
      codexCount: countDiscoveredFish(next),
      fragmentDrop,
      fragmentsTotal,
    };
  });

  if (!result.caught) {
    return Response.json({ ok: true, caught: false, reason: result.reason });
  }
  const fish = FISH[result.fishId];
  // 물때 한정 특별 손님이면 그 물때 정보를 동봉(결과 오버레이 "○○ 물때의 손님" 표시용).
  const mt = fish.condition ? MULTTAE_BY_ID.get(fish.condition) : undefined;
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
    special: mt ? { id: mt.id, label: mt.label, emoji: mt.emoji } : undefined,
    // 보물 탐사 — 이번 챔질에서 지도 조각이 떨어졌는지 + 누적(0 = 안 떨어짐).
    fragmentDrop: result.fragmentDrop,
    fragmentsTotal: result.fragmentsTotal,
  });
}
