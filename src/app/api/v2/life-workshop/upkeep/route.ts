// GET  /api/v2/life-workshop/upkeep — 채집지 정비 현황
// POST /api/v2/life-workshop/upkeep — { siteId } 그 채집지의 정비 단계를 한 단계 올린다.

import { db } from "@/db";
import {
  GatheringSiteUpkeepError,
  gatheringSiteEarnedTitleIds,
  isGatheringSiteId,
  upkeepGatheringSite,
} from "@/adventure/v2/gatheringSiteUpkeep";
import { LIFE_MAJOR_SAVE_KEY } from "@/adventure/v2/lifeMajor";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  gatheringSiteUpkeepContext,
  gatheringSiteUpkeepView,
} from "@/lib/server/gatheringSiteUpkeep";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type CharacterSave = { materials?: unknown; [key: string]: unknown };

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [character, workshopRaw, lifeMajorRaw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readSave(db, userId, LIFE_MAJOR_SAVE_KEY, {}),
  ]);
  return Response.json({
    ok: true,
    ...gatheringSiteUpkeepView(
      parseLifeWorkshopState(workshopRaw).siteUpkeep ?? {},
      gatheringSiteUpkeepContext(character.materials, lifeMajorRaw),
    ),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-workshop",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { siteId?: unknown } | null;
  const siteId = body?.siteId;
  if (!isGatheringSiteId(siteId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const payload = await db.transaction(async (tx) => {
      // 생활 공방 요청과 같은 순서(character.v2 → life-workshop.v1)로 잠근다.
      const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
      const workshop = parseLifeWorkshopState(
        await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
      );
      const context = gatheringSiteUpkeepContext(
        character.materials,
        await readSave(tx, userId, LIFE_MAJOR_SAVE_KEY, {}),
      );
      const stagesBefore = workshop.siteUpkeep ?? {};
      const earnedBefore = new Set(gatheringSiteEarnedTitleIds(stagesBefore));
      const done = upkeepGatheringSite(stagesBefore, siteId, context);

      await upsertSave(tx, userId, "character.v2", { ...character, materials: done.materials });
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, { ...workshop, siteUpkeep: done.state });

      const grantedTitleIds: string[] = [];
      for (const titleId of gatheringSiteEarnedTitleIds(done.state)) {
        if (earnedBefore.has(titleId)) continue;
        if (await grantTitleIfMissingInTx(tx, userId, titleId, now)) {
          grantedTitleIds.push(titleId);
        }
      }
      return {
        ...gatheringSiteUpkeepView(done.state, { ...context, materials: done.materials }),
        result: { ...done.result, grantedTitleIds },
      };
    });
    return Response.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof GatheringSiteUpkeepError) {
      return Response.json({ ok: false, error: error.code }, { status: 409 });
    }
    throw error;
  }
}
