// 길드 엠블럼 아이콘 — phosphor 컴포넌트 매핑(클라 전용). 데이터/검증은 guild-emblems.ts.
// "use client" 컴포넌트(V2GuildHome·ContinentMap)에서만 import. 서버 라우트는 import 금지.
//
// 판타지 깃발/문장(heraldry) 컨셉. key 는 guild-emblems.ts GUILD_EMBLEM_LIST 와 1:1.

import {
  Sword,
  Axe,
  Knife,
  Hammer,
  Shield,
  Crown,
  CastleTurret,
  Skull,
  Cross,
  Anchor,
  Sailboat,
  Horse,
  Bird,
  Mountains,
  TreeEvergreen,
  Flame,
  Lightning,
  Sun,
  Moon,
  Star,
  Diamond,
  Spade,
  Feather,
  FlagBanner,
} from "@phosphor-icons/react";
import {
  GUILD_EMBLEM_LIST,
  DEFAULT_GUILD_EMBLEM_KEY,
  type GuildEmblemMeta,
} from "./guild-emblems";

const ICON_BY_KEY: Record<string, typeof Sword> = {
  sword: Sword,
  axe: Axe,
  knife: Knife,
  hammer: Hammer,
  shield: Shield,
  crown: Crown,
  castle: CastleTurret,
  skull: Skull,
  cross: Cross,
  anchor: Anchor,
  sailboat: Sailboat,
  horse: Horse,
  bird: Bird,
  mountains: Mountains,
  tree: TreeEvergreen,
  flame: Flame,
  lightning: Lightning,
  sun: Sun,
  moon: Moon,
  star: Star,
  diamond: Diamond,
  spade: Spade,
  feather: Feather,
  flag: FlagBanner,
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
