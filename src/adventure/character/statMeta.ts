import {
  Brain,
  HandFist,
  HeartStraight,
  Lightning,
  Star,
  Wind,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { StatKey } from "@/adventure/data/stats";

export const STAT_ICONS: Record<StatKey, PhosphorIcon> = {
  str: HandFist,
  dex: Lightning,
  vit: HeartStraight,
  spd: Wind,
  luk: Star,
  int: Brain,
};

export const STAT_ICON_COLORS: Record<StatKey, string> = {
  str: "text-rose-500",
  dex: "text-amber-400",
  vit: "text-emerald-500",
  spd: "text-sky-500",
  luk: "text-yellow-500",
  int: "text-indigo-500",
};

export const ZERO_ALLOCATED: Record<StatKey, number> = {
  str: 0,
  dex: 0,
  vit: 0,
  spd: 0,
  luk: 0,
  int: 0,
};
