// 길드 엠블럼 아이콘 — phosphor 컴포넌트 매핑(클라 전용). 데이터/검증은 guild-emblems.ts.
// "use client" 컴포넌트(V2GuildHome·ContinentMap)에서만 import. 서버 라우트는 import 금지.

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
import {
  GUILD_EMBLEM_LIST,
  DEFAULT_GUILD_EMBLEM_KEY,
  type GuildEmblemMeta,
} from "./guild-emblems";

const ICON_BY_KEY: Record<string, typeof Sword> = {
  sword: Sword,
  shield: Shield,
  crown: Crown,
  skull: Skull,
  star: Star,
  anchor: Anchor,
  heart: Heart,
  moon: Moon,
  sun: Sun,
  leaf: Leaf,
  paw: PawPrint,
  bird: Bird,
  fish: Fish,
  tree: Tree,
  eye: Eye,
  ghost: Ghost,
  hammer: Hammer,
  feather: Feather,
  snowflake: Snowflake,
  drop: Drop,
  lightning: Lightning,
  flag: Flag,
  flower: Flower,
  crosshair: Crosshair,
};

export type GuildEmblem = GuildEmblemMeta & { Icon: typeof Sword };

// 선택 그리드용 — 데이터(순서·라벨) + 아이콘 컴포넌트.
export const GUILD_EMBLEMS: readonly GuildEmblem[] = GUILD_EMBLEM_LIST.map(
  (e) => ({ ...e, Icon: ICON_BY_KEY[e.key] }),
);

// 키 → 아이콘 컴포넌트. 미설정/미지 키는 기본 엠블럼(깃발). 지도·UI 공용.
export function guildEmblemIcon(key: string | null | undefined): typeof Sword {
  return key && Object.hasOwn(ICON_BY_KEY, key)
    ? ICON_BY_KEY[key]
    : ICON_BY_KEY[DEFAULT_GUILD_EMBLEM_KEY];
}
