import { resolveCurrentOutpostId } from "@/adventure/data/v2/outpostGraph";
import { V2_TILE_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";

export type HuntCharacterSave = {
  stamina?: unknown;
  hp?: number;
  hpRegenSince?: number;
  level?: number;
  exp?: number;
  gold?: number;
  materials?: unknown;
  lastHuntedOutpost?: unknown;
  ejectedFrom?: unknown;
  rareMaps?: unknown;
  lastBattleAt?: number;
  atRiskGold?: number;
  lastHuntDepth?: number;
  frontierDepth?: number;
  lastVisitedOutpost?: { outpostId?: unknown; at?: unknown };
  tilePos?: { col?: unknown; row?: unknown; at?: unknown };
  [key: string]: unknown;
};

export function authoritativeCatalogOutpostId(
  character: HuntCharacterSave,
): string {
  const saved = character.lastVisitedOutpost?.outpostId;
  return resolveCurrentOutpostId(typeof saved === "string" ? saved : null);
}

export function authoritativeTileOutpostId(
  character: HuntCharacterSave,
): string | null {
  if (!V2_TILE_WARFARE) return null;
  const col = Number(character.tilePos?.col);
  const row = Number(character.tilePos?.row);
  return Number.isInteger(col) && Number.isInteger(row)
    ? tileOutpostId(col, row)
    : null;
}
