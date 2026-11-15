// GET  /api/v2/life-workshop/gem-cut — 보석 세공 현황(재료 보유량·채광 레벨·명장 세공 가능 여부)
// POST /api/v2/life-workshop/gem-cut — { mode: "normal" | "master", count } 원석 보석을 깎아 세공 보석을 만든다.

import { db } from "@/db";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  GEM_CUT_BATCH_LIMIT,
  GemCuttingError,
  cutGems,
  isGemCutMode,
  type GemCuttingContext,
} from "@/adventure/v2/gemCutting";
import {
  LIFE_MAJOR_PRODUCT_ID,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorCanCraft,
  parseLifeMajorState,
} from "@/adventure/v2/lifeMajor";
import { miningProgressionView } from "@/adventure/v2/miningProgression";
import { MINING_LOG_KEY, parseMiningLog } from "@/adventure/v2/miningSession";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type CharacterSave = { materials?: unknown; [key: string]: unknown };

async function readContext(executor: DbExecutor, userId: string): Promise<GemCuttingContext> {
  const [miningRaw, lifeMajorRaw] = await Promise.all([
    readSave(executor, userId, MINING_LOG_KEY, {}),
    readSave(executor, userId, LIFE_MAJOR_SAVE_KEY, {}),
  ]);
  const mining = parseMiningLog(miningRaw);
  return {
    miningLevel: miningProgressionView(mining.successes, mining.xp).level,
    masterUnlocked: lifeMajorCanCraft(parseLifeMajorState(lifeMajorRaw), "mining"),
  };
}

function view(materials: Record<string, number>, context: GemCuttingContext) {
  return {
    miningLevel: context.miningLevel,
    masterUnlocked: context.masterUnlocked,
    roughGems: materials[MINING_MATERIAL_ID.roughGem] ?? 0,
    masterAlloy: materials[LIFE_MAJOR_PRODUCT_ID.mining] ?? 0,
    // 보유한 세공 보석(재료 id → 개수). 없는 등급은 싣지 않는다.
    cutGems: Object.fromEntries(
      CUT_GEM_GRADES.map((grade) => [CUT_GEMS[grade].id, materials[CUT_GEMS[grade].id] ?? 0]).filter(
        ([, amount]) => Number(amount) > 0,
      ),
    ),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [character, context] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readContext(db, userId),
  ]);
  return Response.json({ ok: true, ...view(mergeDrops(character.materials, {}), context) });
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

  const body = (await req.json().catch(() => null)) as { mode?: unknown; count?: unknown } | null;
  const mode = body?.mode;
  const count = Number(body?.count);
  if (!isGemCutMode(mode) || !Number.isInteger(count) || count < 1 || count > GEM_CUT_BATCH_LIMIT) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const payload = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
      const context = await readContext(tx, userId);
      const done = cutGems({
        materials: mergeDrops(character.materials, {}),
        mode,
        count,
        context,
        rng: Math.random,
      });
      await upsertSave(tx, userId, "character.v2", { ...character, materials: done.materials });
      return { ...view(done.materials, context), result: { mode, count, results: done.results } };
    });
    return Response.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof GemCuttingError) {
      return Response.json({ ok: false, error: error.code }, { status: 409 });
    }
    throw error;
  }
}
