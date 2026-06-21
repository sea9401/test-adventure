// 길드 엠블럼 — 데이터/검증만(서버 안전). 아이콘 컴포넌트는 guild-emblems-icons.ts(클라 전용).
// ⚠️ 서버 라우트(/api/v2/guild/emblem 등)가 import 하므로 phosphor-icons 등 클라 전용 모듈 import 금지.
//   (그러면 next build "collect page data" 단계에서 createContext is not a function 으로 빌드 실패.)

export type GuildEmblemMeta = { key: string; label: string };

// 표시 순서 = 선택 그리드 순서. 아이콘 매핑은 guild-emblems-icons.ts 가 같은 key 로 보강.
export const GUILD_EMBLEM_LIST: readonly GuildEmblemMeta[] = [
  { key: "sword", label: "검" },
  { key: "shield", label: "방패" },
  { key: "crown", label: "왕관" },
  { key: "skull", label: "해골" },
  { key: "star", label: "별" },
  { key: "anchor", label: "닻" },
  { key: "heart", label: "하트" },
  { key: "moon", label: "달" },
  { key: "sun", label: "태양" },
  { key: "leaf", label: "잎" },
  { key: "paw", label: "발자국" },
  { key: "bird", label: "새" },
  { key: "fish", label: "물고기" },
  { key: "tree", label: "나무" },
  { key: "eye", label: "눈" },
  { key: "ghost", label: "유령" },
  { key: "hammer", label: "망치" },
  { key: "feather", label: "깃털" },
  { key: "snowflake", label: "눈송이" },
  { key: "drop", label: "물방울" },
  { key: "lightning", label: "번개" },
  { key: "flag", label: "깃발" },
  { key: "flower", label: "꽃" },
  { key: "crosshair", label: "조준" },
];

// 엠블럼 미설정(또는 알 수 없는 키) 길드 거점의 기본 아이콘.
export const DEFAULT_GUILD_EMBLEM_KEY = "flag";

const GUILD_EMBLEM_KEYS: ReadonlySet<string> = new Set(
  GUILD_EMBLEM_LIST.map((e) => e.key),
);

export function isValidGuildEmblem(key: unknown): key is string {
  return typeof key === "string" && GUILD_EMBLEM_KEYS.has(key);
}
