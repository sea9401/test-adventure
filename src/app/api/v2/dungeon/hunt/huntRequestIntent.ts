import { db } from "@/db";
import { readSave } from "@/lib/server/savesKv";
import { isHuntStageDepth } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import {
  adventureSupportTier,
  maxHuntBatchForAdventureSupport,
} from "@/adventure/data/v2/adventureSupport";
import {
  HUNT_COOLDOWN_MODE,
  V2_UNEXPLORED,
} from "@/adventure/data/v2/coreLoopConfig";
import { validateDungeonHuntMode } from "@/lib/server/unexploredHunt";
import { normalizeHuntBattleCount } from "./huntRewards";
import { normalizeAutoHuntStopConfig } from "@/adventure/v2/autoHuntStopPolicy";
import {
  authoritativeCatalogOutpostId,
  authoritativeTileOutpostId,
  type HuntCharacterSave,
} from "./huntCharacter";

export const HUNT_DROP_FLOOR_CAP = 8 as DungeonFloorId;

export type HuntRequestIntent = {
  mode: "normal" | "unexplored";
  depth: number;
  dropFloor: DungeonFloorId;
  count: number;
  outpostId: string | null;
  lockedTileOutpostId: string | null;
  rareMapIid: string | null;
  autoStopConfig: ReturnType<typeof normalizeAutoHuntStopConfig>;
};

type HuntRequestBody = {
  floor?: unknown;
  mode?: unknown;
  outpostId?: unknown;
  count?: unknown;
  autoStopConfig?: unknown;
  rareMap?: unknown;
};

export async function parseHuntRequestIntent(
  req: Request,
  userId: string,
): Promise<
  | { ok: true; intent: HuntRequestIntent }
  | { ok: false; response: Response }
> {
  let body: HuntRequestBody;
  try {
    body = (await req.json()) as HuntRequestBody;
  } catch {
    return errorResponse("invalid_json", 400);
  }

  const modeValidation = validateDungeonHuntMode(body.mode, V2_UNEXPLORED);
  if (!modeValidation.ok) {
    return errorResponse(modeValidation.error, modeValidation.status);
  }
  const mode = modeValidation.mode;
  if (
    mode === "normal" &&
    (typeof body.floor !== "number" ||
      !Number.isInteger(body.floor) ||
      body.floor < 1)
  ) {
    return errorResponse("bad_intent", 400);
  }

  const depth = mode === "unexplored" ? 95 : (body.floor as number);
  const dropFloor = Math.min(depth, HUNT_DROP_FLOOR_CAP) as DungeonFloorId;
  const supportCharacter = await readSave<HuntCharacterSave>(
    db,
    userId,
    "character.v2",
    {},
  );
  const outpostId =
    mode === "unexplored"
      ? null
      : authoritativeCatalogOutpostId(supportCharacter);
  const lockedTileOutpostId =
    mode === "unexplored"
      ? null
      : authoritativeTileOutpostId(supportCharacter);
  const claimedOutpostId =
    typeof body.outpostId === "string" && body.outpostId.length > 0
      ? body.outpostId
      : null;
  if (
    mode === "normal" &&
    claimedOutpostId &&
    !OUTPOST_BY_ID.has(claimedOutpostId)
  ) {
    return errorResponse("bad_outpost", 400);
  }
  if (
    mode === "normal" &&
    claimedOutpostId &&
    claimedOutpostId !== outpostId
  ) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "location_mismatch", currentOutpostId: outpostId },
        { status: 409 },
      ),
    };
  }

  const rareMapIid =
    typeof body.rareMap === "string" && body.rareMap.length > 0
      ? body.rareMap
      : null;
  if (mode === "unexplored" && rareMapIid) {
    return errorResponse("rare_map_unavailable", 400);
  }
  const maxHuntBatch = maxHuntBatchForAdventureSupport(
    adventureSupportTier(supportCharacter.adventureSupport),
  );
  const requestedCount = Math.max(1, Math.floor(Number(body.count) || 1));
  if (!rareMapIid && !HUNT_COOLDOWN_MODE && requestedCount > maxHuntBatch) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "adventure_support_required",
          maxCount: maxHuntBatch,
        },
        { status: 403 },
      ),
    };
  }
  const count = normalizeHuntBattleCount(
    HUNT_COOLDOWN_MODE ? 1 : Math.min(maxHuntBatch, requestedCount),
    rareMapIid,
  );
  const autoStopConfig = normalizeAutoHuntStopConfig(body.autoStopConfig);
  if (mode === "normal" && !rareMapIid && !isHuntStageDepth(depth)) {
    return errorResponse("hunt_stage_only", 400);
  }

  return {
    ok: true,
    intent: {
      mode,
      depth,
      dropFloor,
      count,
      outpostId,
      lockedTileOutpostId,
      rareMapIid,
      autoStopConfig,
    },
  };
}

function errorResponse(
  error: string,
  status: number,
): { ok: false; response: Response } {
  return {
    ok: false,
    response: Response.json({ ok: false, error }, { status }),
  };
}
