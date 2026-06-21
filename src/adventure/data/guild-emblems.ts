// 길드 엠블럼 카탈로그 — 프리셋 phosphor 아이콘. 길드 창설/관리 선택 UI + 지도 마커 렌더가 공유.
// 커스텀 업로드 대신 프리셋(검수/스토리지 불필요). 키는 guilds.emblem(text)에 저장.

import {
  Sword,
  Shield,
  Crown,
  Skull,
  Star,
  Anchor,
  Heart,
  Moon,
  Sun,
  Leaf,
  PawPrint,
  Bird,
  Fish,
  Tree,
  Eye,
  Ghost,
  Hammer,
  Feather,
  Snowflake,
  Drop,
  Lightning,
  Flag,
  Flower,
  Crosshair,
} from "@phosphor-icons/react";

export type GuildEmblem = { key: string; label: string; Icon: typeof Sword };

// 표시 순서 = 선택 그리드 순서.
export const GUILD_EMBLEMS: readonly GuildEmblem[] = [
  { key: "sword", label: "검", Icon: Sword },
  { key: "shield", label: "방패", Icon: Shield },
  { key: "crown", label: "왕관", Icon: Crown },
  { key: "skull", label: "해골", Icon: Skull },
  { key: "star", label: "별", Icon: Star },
  { key: "anchor", label: "닻", Icon: Anchor },
  { key: "heart", label: "하트", Icon: Heart },
  { key: "moon", label: "달", Icon: Moon },
  { key: "sun", label: "태양", Icon: Sun },
  { key: "leaf", label: "잎", Icon: Leaf },
  { key: "paw", label: "발자국", Icon: PawPrint },
  { key: "bird", label: "새", Icon: Bird },
  { key: "fish", label: "물고기", Icon: Fish },
  { key: "tree", label: "나무", Icon: Tree },
  { key: "eye", label: "눈", Icon: Eye },
  { key: "ghost", label: "유령", Icon: Ghost },
  { key: "hammer", label: "망치", Icon: Hammer },
  { key: "feather", label: "깃털", Icon: Feather },
  { key: "snowflake", label: "눈송이", Icon: Snowflake },
  { key: "drop", label: "물방울", Icon: Drop },
  { key: "lightning", label: "번개", Icon: Lightning },
  { key: "flag", label: "깃발", Icon: Flag },
  { key: "flower", label: "꽃", Icon: Flower },
  { key: "crosshair", label: "조준", Icon: Crosshair },
] as const;

export const GUILD_EMBLEM_BY_KEY: Record<string, typeof Sword> =
  Object.fromEntries(GUILD_EMBLEMS.map((e) => [e.key, e.Icon]));

// 엠블럼 미설정(또는 알 수 없는 키) 길드 거점의 기본 아이콘.
export const DEFAULT_GUILD_EMBLEM_KEY = "flag";

export function isValidGuildEmblem(key: unknown): key is string {
  // Object.hasOwn — "toString"/"constructor" 등 프로토타입 키가 통과하지 않게(key in obj 금지).
  return typeof key === "string" && Object.hasOwn(GUILD_EMBLEM_BY_KEY, key);
}

// 키 → 아이콘 컴포넌트. 미설정/미지 키는 기본 엠블럼(깃발). 지도·UI 공용.
export function guildEmblemIcon(
  key: string | null | undefined,
): typeof Sword {
  return key && Object.hasOwn(GUILD_EMBLEM_BY_KEY, key)
    ? GUILD_EMBLEM_BY_KEY[key]
    : GUILD_EMBLEM_BY_KEY[DEFAULT_GUILD_EMBLEM_KEY];
}
