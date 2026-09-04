export const GAME_RATING = Object.freeze({
  title: "무슨무슨게임",
  applicant: "무슨게임",
  platform: "PC/온라인 게임",
  genre: "롤플레잉",
  rating: "12세이용가",
  restrictionNotice: "12세 미만은 이용할 수 없습니다.",
  classificationNumber: "GC-CC-NP-260903-001",
  decisionDate: "2026.09.03",
  productionDate: "2026.08.07",
  firstPublicDate: "2026.08.01",
  producerRegistrationNumber: "제2026-000005호",
  distributorRegistrationNumber: "제2026-000001호",
  summary: "전투·생활 콘텐츠를 통해 캐릭터를 성장시키는 어드벤처 RPG",
  descriptor: "폭력성",
  descriptorReason: "경미한 폭력 표현 (무기와 붉은 선혈이 표현된 일러스트)",
  ratingImage: "/images/rating/12-plus.webp",
  descriptorImage: "/images/rating/violence.webp",
  decisionSearchUrl: "https://www.gcrb.or.kr/statistics/gameStatistics.aspx",
});

export const GAME_RATING_NOTICE_MS = 3_500;

const GAME_ENTRY_PATHS = ["/", "/sign-in", "/create"] as const;
const GAME_ROUTE_PREFIXES = [
  "/battle",
  "/character",
  "/feedback",
  "/guild",
  "/hidden",
  "/map",
  "/notifications",
  "/outpost",
  "/plaza",
  "/quests",
  "/settings",
  "/town",
] as const;

export function isGameEntryPath(pathname: string): boolean {
  if (GAME_ENTRY_PATHS.some((path) => pathname === path)) return true;
  return GAME_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
