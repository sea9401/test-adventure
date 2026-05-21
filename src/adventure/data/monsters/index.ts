export * from "./types";

import type { Monster } from "./types";
import { COAST_MONSTERS } from "./coast";
import { DRAGONSCALE_MONSTERS } from "./dragonscale";
import { HOMELAND_MONSTERS } from "./homeland";
import { MIDLANDS_MONSTERS } from "./midlands";
import { SKYTHRONE_MONSTERS } from "./skythrone";
import { STARLIT_MONSTERS } from "./starlit";
import { VOLCANIC_MONSTERS } from "./volcanic";

export const MONSTERS: Record<string, Monster> = {
  ...HOMELAND_MONSTERS,
  ...MIDLANDS_MONSTERS,
  ...VOLCANIC_MONSTERS,
  ...SKYTHRONE_MONSTERS,
  ...COAST_MONSTERS,
  ...DRAGONSCALE_MONSTERS,
  ...STARLIT_MONSTERS,
};

export const SPAR_DUMMY_ID = "훈련용 허수아비" as const;
