// 광장 게시판 글 제약 — 클라/서버 공통.
export const BULLETIN_MAX_LENGTH = 4000;
// 공지(notice)는 운영자 전용 안내라 본문을 더 길게 허용(점검·업데이트 안내가 길어짐).
// 일반 유저 글(free/guide)은 BULLETIN_MAX_LENGTH 유지 — bulletinMaxLength() 로 분기.
// 항상 BULLETIN_MAX_LENGTH 이상으로 유지(공지가 일반 글보다 짧으면 안 됨).
export const BULLETIN_NOTICE_MAX_LENGTH = 6000;
export const BULLETIN_TITLE_MAX_LENGTH = 50;
export const BULLETIN_RATE_LIMIT_MS = 60_000; // 1분에 1개
export const BULLETIN_FETCH_LIMIT = 50;

// 댓글 — 본문 200자, 1분에 1개 (글 작성보다 빈도 ↑ 일 거 같지만 같은 정책으로 시작).
export const BULLETIN_COMMENT_MAX_LENGTH = 200;
export const BULLETIN_COMMENT_RATE_LIMIT_MS = 10_000; // 10초에 1개

// 카테고리 — 일반 유저는 free/guide 만 작성 가능, notice 는 admin 전용 (서버 검증).
// 추가/순서 변경 시 BULLETIN_CATEGORY_LABELS 와 DB 의 category 컬럼 호환만 유지하면 됨.
export const BULLETIN_CATEGORIES = ["notice", "free", "guide"] as const;
export type BulletinCategory = (typeof BULLETIN_CATEGORIES)[number];

// 카테고리별 본문 최대 길이 — 공지만 더 길게(BULLETIN_NOTICE_MAX_LENGTH), 그 외는 기본.
export function bulletinMaxLength(category: BulletinCategory): number {
  return category === "notice" ? BULLETIN_NOTICE_MAX_LENGTH : BULLETIN_MAX_LENGTH;
}

export const BULLETIN_CATEGORY_LABELS: Record<
  BulletinCategory,
  { name: string; description: string }
> = {
  notice: {
    name: "공지사항",
    description: "운영자가 작성하는 안내 — 점검·업데이트·이벤트 등.",
  },
  free: {
    name: "자유게시판",
    description: "잡담·인사·자랑·일기 등 자유롭게.",
  },
  guide: {
    name: "공략·팁",
    description: "빌드·사냥터·퀘스트 공략 등 정보 공유.",
  },
};

export function isBulletinCategory(v: unknown): v is BulletinCategory {
  return (
    typeof v === "string" &&
    (BULLETIN_CATEGORIES as readonly string[]).includes(v)
  );
}

// 일반 유저가 직접 작성할 수 있는 카테고리. notice 는 admin 만.
export const USER_WRITABLE_CATEGORIES: ReadonlyArray<BulletinCategory> = [
  "free",
  "guide",
];
