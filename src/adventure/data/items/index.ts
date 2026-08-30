export * from "./types";

import { STARTER_ITEMS } from "./starter";
import { SKY_ITEMS } from "./sky";
import { STARLIT_ITEMS } from "./starlit";
import { HIDDEN_ITEMS } from "./hidden";
import { MIDGAME_ITEMS } from "./midgame";
import { COASTAL_ITEMS } from "./coastal";
import { WESTERN_ITEMS } from "./western";
import { DRAGONSCALE_ITEMS } from "./dragonscale";

export const ITEMS = {
  ...STARTER_ITEMS,
  ...SKY_ITEMS,
  ...STARLIT_ITEMS,
  ...HIDDEN_ITEMS,
  ...MIDGAME_ITEMS,
  ...COASTAL_ITEMS,
  ...WESTERN_ITEMS,
  ...DRAGONSCALE_ITEMS,
} as const;

export type ItemId = keyof typeof ITEMS;
