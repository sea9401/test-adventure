// 전체 소식(서버 피드) 제약 — 클라/서버 공통.
//
// 채팅과 분리된 "전광판" — 서버 전체에 흘러가는 자랑거리(유실된 명품 획득, 걸작 제작 성공).
// 모험탭 하단 패널에서 최근 FEED_FETCH_LIMIT 개만 노출. append-only — insert 시 FEED_MAX_ROWS
// 초과분을 잘라낸다(cron 없음).

// GET /api/feed 가 돌려주는 최근 항목 수. 패널이 한 번에 보여주는 상한.
export const FEED_FETCH_LIMIT = 20;

// DB 에 유지하는 최대 행 수 — insert 마다 초과분 trim. 활동량 변동에 강하도록 기간이 아닌 행 수 기준.
export const FEED_MAX_ROWS = 500;

// 같은 유저+type 디바운스 — 이 시간 안에 동일 종류 항목이 이미 있으면 새 항목을 만들지 않는다.
// 연달아 터뜨려도 도배되지 않게.
export const FEED_DEBOUNCE_MS = 60_000;

// 클라이언트 패널 폴링 주기.
export const FEED_POLL_MS = 30_000;

// 피드 항목 종류. outpost_* 3종 = 전쟁 사건(docs/v2-war-visibility-plan.md PR-3) —
// 공적 행위라 shareFeed opt-out 을 무시하고 기록된다(insertFeedEntry force).
export const FEED_TYPES = [
  "unique_drop",
  "masterpiece",
  "outpost_capture",
  "outpost_siege",
  "outpost_eject",
] as const;
export type FeedType = (typeof FEED_TYPES)[number];

// 전쟁 사건 묶음 — GET /api/feed?types=war 서버 필터 + 전광판 티커(WarTicker) 소비.
// 서버 필터인 이유: FEED_FETCH_LIMIT 안에서 자랑거리 도배에 전쟁 사건이 밀려나는 것 방지.
export const WAR_FEED_TYPES: readonly FeedType[] = [
  "outpost_capture",
  "outpost_siege",
  "outpost_eject",
];

// 전광판(티커) 표시 범위 — 이 시간 안의 전쟁 사건만 순환. 0건이면 띠 자체를 숨긴다
// (빈 전광판이 "전쟁 없음"을 광고하는 역효과 방지).
export const WAR_TICKER_WINDOW_H = 24;

// type 별 payload. 아이템/거점 이름은 클라에서 카탈로그로 해석 — id 만 저장.
// 길드명은 시점 스냅샷 문자열(클라에 길드 카탈로그가 없음).
export type FeedPayload =
  | { itemId: string } // unique_drop · masterpiece
  // outpost_capture — 함락/점령. lostToNpc=true 면 NPC 정기공격에 점령이 무너진 것
  // (actor = 잃은 점령자). 아니면 actor/guildName = 새 점령자.
  | { outpostId: string; guildName?: string | null; lostToNpc?: boolean }
  // outpost_siege — 성벽 타격(승리한 공성만). fortHp = 타격 후 잔량.
  | {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      guildName?: string | null;
    }
  // outpost_eject — 침입자 토벌. actor = 토벌자, targetName = 토벌당한 침입자.
  | { outpostId: string; targetName: string };

// 클라/서버가 주고받는 한 항목.
export type FeedEntry = {
  id: number;
  type: FeedType;
  actorName: string;
  payload: FeedPayload;
  createdAt: number; // epoch ms
};
