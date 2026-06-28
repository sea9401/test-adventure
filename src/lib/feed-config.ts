// 전체 소식(서버 피드) 제약 — 클라/서버 공통.
//
// 채팅과 분리된 "전광판" — 서버 전체에 흘러가는 자랑거리(유실된 명품 획득, 걸작 제작 성공).
// 모험탭 하단 패널에서 최근 FEED_FETCH_LIMIT 개만 노출. append-only — insert 시 보관기간
// 초과분을 잘라낸다(cron 없음, lazy trim).

// GET /api/feed 가 돌려주는 최근 항목 수. 패널이 한 번에 보여주는 상한.
export const FEED_FETCH_LIMIT = 50;

// DB 보관 기간 — insert 마다 이보다 오래된 행 trim(시간 기준, 사용자 결정 2026-06-13).
// (옛 FEED_MAX_ROWS=500 행 수 캡 대체 — 분류별 열람을 위해 3개월 치 보존.)
export const FEED_RETENTION_MS = 90 * 24 * 3_600_000;

// 같은 유저+type 디바운스 — 이 시간 안에 동일 종류 항목이 이미 있으면 새 항목을 만들지 않는다.
// 연달아 터뜨려도 도배되지 않게.
export const FEED_DEBOUNCE_MS = 5_000;

// 클라이언트 패널 폴링 주기.
export const FEED_POLL_MS = 30_000;

// 피드 항목 종류. outpost_* 3종 = 전쟁 사건(docs/v2-war-visibility-plan.md PR-3).
// (옛 shareFeed opt-out/force 구분은 제거 — 모든 종류가 항상 기록된다.)
export const FEED_TYPES = [
  "unique_drop",
  "masterpiece",
  "outpost_capture",
  "outpost_siege",
  "outpost_eject",
  "enhance_high",
  "enhance_destroy",
  "rare_map_drop",
  "coop_summon",
  "coop_kill",
  "fishing_big_catch",
  "newcomer",
] as const;
export type FeedType = (typeof FEED_TYPES)[number];

// 전광판 묶음 — GET /api/feed?types=war 서버 필터 + 전광판 티커(WarTicker) 소비.
// 전쟁 사건 + 서버 명물(고강 +9 이상 성공/파괴). 서버 필터인 이유: FEED_FETCH_LIMIT 안에서
// 자랑거리 도배에 밀려나는 것 방지.
export const WAR_FEED_TYPES: readonly FeedType[] = [
  "outpost_capture",
  "outpost_siege",
  "outpost_eject",
  "enhance_high",
  "enhance_destroy",
  // 보스/희귀 사건 — 드물어 도배 위험 없고 서버 전체에 알릴 만한 "사건"이라 전광판에 합류.
  //   coop_summon/kill=협동 보스, rare_map_drop=레어맵 발견, fishing_big_catch=낚시 대물.
  //   ⚠️ unique_drop 은 의도적으로 제외 — 빈도가 높아 전광판 도배(아래 FEED_CATEGORY 주석 참고).
  "coop_summon",
  "coop_kill",
  "rare_map_drop",
  "fishing_big_catch",
  // newcomer = 전쟁 사건은 아니지만 "서버 전체에 알리는 한 줄"이라 같은 상단 전광판에 태운다
  // (enhance_high 가 전쟁 아님에도 여기 묶인 것과 같은 취지 — 전광판 = 서버 공지 묶음).
  "newcomer",
];

// 전광판(티커) 표시 범위 — 이 시간(분) 안의 사건만 순환. 0건이면 띠 자체를 숨긴다
// (빈 전광판이 "사건 없음"을 광고하는 역효과 방지).
//   "최근 서버 사건"을 계속 흐르게 하는 띠. 옛 5분 윈도우는 저활동 구간에서 0건이라 거의
//   항상 비어 "안 뜬다"는 제보(2026-06-28). 폭주 방지(2026-06-22 결정)는 시간이 아니라
//   개수 상한(WAR_TICKER_MAX_ITEMS)으로 옮기고, 윈도우는 넉넉히(저활동에도 보이게) 잡는다.
export const WAR_TICKER_WINDOW_MIN = 24 * 60; // 24h — "최근" 범위(이보다 오래된 건 제외)

// 전광판에 동시에 흘리는 최대 사건 수 — 사건이 쏟아져도 띠가 끝없이 길어지지 않게 최신 N개만.
//   (옛 좁은 시간 윈도우가 하던 폭주 방지 역할을 개수 상한으로 대체.)
export const WAR_TICKER_MAX_ITEMS = 10;

// === 분류(카테고리) — 패널의 분류별 보기 탭 + GET /api/feed?category= 서버 필터 ===
// 전광판 묶음(WAR_FEED_TYPES — enhance_high 포함)과 별개: 이쪽은 열람용 의미 분류.
// 유니크 드랍(unique_drop)은 어느 분류에도 안 넣는다 — 빈도가 높아 획득 칩을 도배하던
// 것을 "전체"에서만 보이게(사용자 결정 2026-06-13). 강화는 획득에서 분리.
export const FEED_CATEGORIES = ["acquisition", "enhance", "war", "boss"] as const;
export type FeedCategory = (typeof FEED_CATEGORIES)[number];

export const FEED_CATEGORY_TYPES: Record<FeedCategory, readonly FeedType[]> = {
  // 획득 — 걸작 제작/레어맵 발견(희귀 사건만 — 유니크 드랍 제외).
  acquisition: ["masterpiece", "rare_map_drop"],
  // 강화 — 고강(+9 이상) 성공/파괴.
  enhance: ["enhance_high", "enhance_destroy"],
  // 전쟁 — 거점 점령/공성/침입자 토벌.
  war: ["outpost_capture", "outpost_siege", "outpost_eject"],
  // 보스 — 협동 보스 소환/처치.
  boss: ["coop_summon", "coop_kill"],
};

export const FEED_CATEGORY_LABEL: Record<FeedCategory, string> = {
  acquisition: "획득",
  enhance: "강화",
  war: "전쟁",
  boss: "보스",
};

export function parseFeedCategory(v: unknown): FeedCategory | null {
  return typeof v === "string" &&
    (FEED_CATEGORIES as readonly string[]).includes(v)
    ? (v as FeedCategory)
    : null;
}

// type 별 payload. 아이템/거점 이름은 클라에서 카탈로그로 해석 — id 만 저장.
// 길드명은 시점 스냅샷 문자열(클라에 길드 카탈로그가 없음).
export type FeedPayload =
  | { itemId: string } // unique_drop · masterpiece
  // outpost_capture — 함락/점령. lostToNpc=true 면 NPC 정기공격에 점령이 무너진 것
  // (actor = 잃은 점령자). 아니면 actor/guildName = 새 점령자.
  // treasuryGold — 점령 시 자동 회수한 거점 금고 총액(잭팟 표기, 0/없으면 생략).
  | {
      outpostId: string;
      guildName?: string | null;
      lostToNpc?: boolean;
      treasuryGold?: number;
    }
  // outpost_siege — 성벽 타격(승리한 공성만). fortHp = 타격 후 잔량.
  | {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      guildName?: string | null;
    }
  // outpost_eject — 침입자 토벌. actor = 토벌자, targetName = 토벌당한 침입자.
  | { outpostId: string; targetName: string }
  // enhance_high — 고강(ENHANCE_FEED_MIN_LEVEL 이상) 강화 성공 / enhance_destroy — 같은 레벨대
  //   파괴(개체 소멸). level = 성공=달성 레벨·파괴=잃은 개체 레벨. 장비 이름은 클라가 카탈로그 해석.
  | { itemId: string; level: number }
  // rare_map_drop — 레어맵 발견(유니크보다 희귀한 사건). 이름은 클라가 RARE_MAP_KINDS 해석.
  // coop_summon · coop_kill — 협동 보스 소환/처치. 이름은 클라가 COOP_BOSSES 해석.
  | { kind: string }
  // fishing_big_catch — 낚시 대물(종 크기 상위 구간 + 개인 신기록). 어종명은 클라가 FISH 해석.
  | { fishId: string; size: number }
  // newcomer — 새 모험가 합류(첫 캐릭터 생성). 닉네임은 actorName 에 스냅샷되므로 payload 는 비움.
  | { newcomer: true };

// 클라/서버가 주고받는 한 항목.
export type FeedEntry = {
  id: number;
  type: FeedType;
  actorName: string;
  payload: FeedPayload;
  createdAt: number; // epoch ms
};
