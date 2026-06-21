// 길드 색 팔레트 — 선착순 유니크 고유색. 데이터/검증만(서버 라우트 + UI + 지도 공용).
// ⚠️ React/phosphor 등 클라 전용 모듈 import 금지(서버 라우트가 import). hex 문자열만.

export type GuildColor = { key: string; label: string; hex: string };

// 또렷이 구분되는 16색(tailwind 500). 선택 그리드 순서.
export const GUILD_COLORS: readonly GuildColor[] = [
  { key: "red", label: "빨강", hex: "#ef4444" },
  { key: "orange", label: "주황", hex: "#f97316" },
  { key: "amber", label: "호박", hex: "#f59e0b" },
  { key: "yellow", label: "노랑", hex: "#eab308" },
  { key: "lime", label: "라임", hex: "#84cc16" },
  { key: "green", label: "초록", hex: "#22c55e" },
  { key: "teal", label: "청록", hex: "#14b8a6" },
  { key: "cyan", label: "사이언", hex: "#06b6d4" },
  { key: "sky", label: "하늘", hex: "#0ea5e9" },
  { key: "blue", label: "파랑", hex: "#3b82f6" },
  { key: "indigo", label: "남색", hex: "#6366f1" },
  { key: "violet", label: "보라", hex: "#8b5cf6" },
  { key: "purple", label: "자주", hex: "#a855f7" },
  { key: "fuchsia", label: "푸시아", hex: "#d946ef" },
  { key: "pink", label: "분홍", hex: "#ec4899" },
  { key: "rose", label: "로즈", hex: "#f43f5e" },
];

const COLOR_BY_KEY: ReadonlyMap<string, string> = new Map(
  GUILD_COLORS.map((c) => [c.key, c.hex]),
);

export function isValidGuildColor(key: unknown): key is string {
  return typeof key === "string" && COLOR_BY_KEY.has(key);
}

// 키 → hex. 미설정/미지 키는 null(지도에서 소유색으로 폴백).
export function guildColorHex(key: string | null | undefined): string | null {
  return (key && COLOR_BY_KEY.get(key)) ?? null;
}
