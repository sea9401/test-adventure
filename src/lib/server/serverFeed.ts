// 전체 소식(서버 피드) 쓰기 — server_feed 테이블에 "자랑거리" 한 줄 append.
//
// 게임 로직 서버 코드(제작 라우트 / 위탁 사냥 collect / 클라가 보고하는 라이브 드랍)가 호출.
// 협동 보스의 채팅 broadcast 와 같은 "부수 효과" 취급 — 실패해도 본 작업은 성공해야 하므로
// 내부에서 try/catch + console.warn 으로 삼킨다. 호출부는 await insertFeedEntry(...) 만 하면 됨.
//
// 정책:
//   1) 디바운스 — 같은 유저+type 의 항목이 FEED_DEBOUNCE_MS 안에 있으면 건너뜀 (도배 방지).
//   2) actorName — users.gameName → character-profile.v2 의 name → "이름 없는 모험가" 스냅샷.
//   3) trim — insert 후 FEED_MAX_ROWS 초과분(가장 오래된 것부터) 삭제.
// (옛 송신자 opt-out(users.shareFeed)/force 는 제거 — 피드는 항상 기록, 사용자 결정 2026-06-13.
//  users.share_feed 컬럼은 inert 로 잔존 — 비파괴.)

import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, serverFeed, users } from "@/db/schema";
import {
  FEED_DEBOUNCE_MS,
  FEED_MAX_ROWS,
  type FeedPayload,
  type FeedType,
} from "@/lib/feed-config";

// 협동 보스 처치 broadcast 와 동일한 닉네임 해석 — gameName 우선, 없으면 profile 저장값.
async function resolveActorName(
  userId: string,
  gameName: string | null,
): Promise<string> {
  const fromGame = gameName?.trim();
  if (fromGame) return fromGame;
  const [profRow] = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
    )
    .limit(1);
  const n = (profRow?.value as { name?: unknown } | null)?.name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return "이름 없는 모험가";
}

// userId 만으로 표시 이름 해석 — 피드 actorName 과 동일 규칙(gameName → profile → 기본값)을
// 다른 서버 코드(사냥 세금 수취자 라벨 등)에서도 쓰도록 공개한 wrapper.
export async function resolveUserDisplayName(userId: string): Promise<string> {
  const [u] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return resolveActorName(userId, u?.gameName ?? null);
}

export async function insertFeedEntry(
  userId: string,
  type: FeedType,
  payload: FeedPayload,
): Promise<void> {
  try {
    const [u] = await db
      .select({ gameName: users.gameName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) return;

    const since = new Date(Date.now() - FEED_DEBOUNCE_MS);
    const [recent] = await db
      .select({ id: serverFeed.id })
      .from(serverFeed)
      .where(
        and(
          eq(serverFeed.userId, userId),
          eq(serverFeed.type, type),
          gt(serverFeed.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return;

    const actorName = await resolveActorName(userId, u.gameName);
    await db.insert(serverFeed).values({ userId, actorName, type, payload });

    // trim — 최신 FEED_MAX_ROWS 개만 남기고 그 이전 행 삭제.
    const [cut] = await db
      .select({ id: serverFeed.id })
      .from(serverFeed)
      .orderBy(desc(serverFeed.id))
      .offset(FEED_MAX_ROWS - 1)
      .limit(1);
    if (cut) await db.delete(serverFeed).where(lt(serverFeed.id, cut.id));
  } catch (err) {
    console.warn("[serverFeed] insert failed", err);
  }
}
