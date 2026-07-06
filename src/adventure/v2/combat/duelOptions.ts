import type { PvPResolveContext } from "./engine-pvp";

export function autoDuelContext(): Pick<PvPResolveContext, "pickAction" | "potions"> {
  return {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
  };
}
