import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { TITLES } from "@/adventure/data/titles";
import { ANTIQUES, appraiseValue } from "@/adventure/data/v2/antique";
import {
  TREASURE_SESSION_KEY,
  applyTreasureAction,
  applyTreasureAppraisalBonus,
  finalConditionForSession,
  isTreasureAction,
  parseTreasureSession,
  toPublicSite,
  treasureAppraisalBonusPct,
  treasureUsedProbe,
} from "@/adventure/v2/treasureDig";
import {
  TREASURE_ACHIEVEMENTS_KEY,
  parseTreasureAchievementStats,
  reachedTreasureAchievementTitleIds,
  recordTreasureAchievementHit,
} from "@/adventure/v2/treasureAchievements";
import {
  TREASURE_COLLECTION_KEY,
  addInstance,
  parseTreasureCollection,
} from "@/adventure/v2/treasureCollection";
import {
  generateAntiqueInstanceId,
  type AntiqueInstance,
} from "@/adventure/v2/antiqueInstances";
import {
  TREASURE_CODEX_KEY,
  countDiscoveredAntiques,
  parseTreasureCodex,
  recordFind,
} from "@/adventure/v2/treasureCodex";
import { addTreasureScore } from "@/lib/server/treasure/records";
import { currentTreasureSeasonId } from "@/lib/server/treasure/season";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";

// POST /api/v2/treasure/dig — body { siteId, action }. 발굴 행동을 수행한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:treasure:dig",
    userLimit: 90,
    ipLimit: 500,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const b = (body ?? {}) as { siteId?: unknown; action?: unknown };
  if (typeof b.siteId !== "string" || !isTreasureAction(b.action)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const siteId = b.siteId;
  const action = b.action;
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const session = parseTreasureSession(
      await lockSaveForUpdate(tx, userId, TREASURE_SESSION_KEY, {}),
    );
    if (!session) return { outcome: "no_session" as const };
    if (session.siteId !== siteId) return { outcome: "stale" as const };

    const dig = applyTreasureAction(session, action);

    if (dig.kind === "invalid") {
      return { outcome: "invalid" as const, site: toPublicSite(session) };
    }

    if (dig.kind === "extracted") {
      const finalCondition = finalConditionForSession(dig.session);
      const appraisalBonusPct = treasureAppraisalBonusPct(dig.session);
      const a = ANTIQUES[session.antiqueId];
      const instance: AntiqueInstance = {
        instanceId: generateAntiqueInstanceId(),
        antiqueId: session.antiqueId,
        condition: finalCondition,
        foundAt: now,
      };
      const collection = parseTreasureCollection(
        await lockSaveForUpdate(tx, userId, TREASURE_COLLECTION_KEY, {}),
      );
      await upsertSave(
        tx,
        userId,
        TREASURE_COLLECTION_KEY,
        addInstance(collection, instance),
      );
      const codex = parseTreasureCodex(
        await lockSaveForUpdate(tx, userId, TREASURE_CODEX_KEY, {}),
      );
      const nextCodex = recordFind(codex, session.antiqueId, finalCondition, now);
      await upsertSave(tx, userId, TREASURE_CODEX_KEY, nextCodex);

      const appraisedValue = applyTreasureAppraisalBonus(
        appraiseValue(session.antiqueId, finalCondition),
        appraisalBonusPct,
      );
      const achievementStats = parseTreasureAchievementStats(
        await lockSaveForUpdate(tx, userId, TREASURE_ACHIEVEMENTS_KEY, {}),
      );
      const nextAchievementStats = recordTreasureAchievementHit(achievementStats, {
        siteOptionId: session.siteOptionId,
        condition: finalCondition,
        appraisedValue,
        usedProbe: treasureUsedProbe(dig.session),
      });
      await upsertSave(
        tx,
        userId,
        TREASURE_ACHIEVEMENTS_KEY,
        nextAchievementStats,
      );
      const grantedTitles: { titleId: string; name: string }[] = [];
      for (const titleId of reachedTreasureAchievementTitleIds(nextAchievementStats)) {
        if (await grantTitleIfMissingInTx(tx, userId, titleId, now)) {
          grantedTitles.push({
            titleId,
            name: TITLES[titleId]?.name ?? titleId,
          });
        }
      }
      await addTreasureScore(
        tx,
        userId,
        currentTreasureSeasonId(new Date(now)),
        appraisedValue,
        new Date(now),
      );
      await upsertSave(tx, userId, TREASURE_SESSION_KEY, {});

      return {
        outcome: "hit" as const,
        antique: {
          instanceId: instance.instanceId,
          antiqueId: a.id,
          name: a.name,
          tier: a.tier,
          condition: finalCondition,
          conditionBonus: Math.max(0, finalCondition - session.condition),
          appraisalBonusPct,
          appraisedValue,
        },
        grantedTitles,
        codexCount: countDiscoveredAntiques(nextCodex),
      };
    }

    if (dig.kind === "collapsed" || dig.kind === "failed") {
      await upsertSave(tx, userId, TREASURE_SESSION_KEY, {});
      const a = ANTIQUES[session.antiqueId];
      return {
        outcome: "exhausted" as const,
        message: dig.message,
        site: toPublicSite(dig.session),
        missed: { antiqueId: a.id, name: a.name, tier: a.tier },
      };
    }

    await upsertSave(tx, userId, TREASURE_SESSION_KEY, dig.session);
    return {
      outcome: "progress" as const,
      message: dig.message,
      site: toPublicSite(dig.session),
    };
  });

  if (result.outcome === "no_session" || result.outcome === "stale") {
    return Response.json({ ok: false, error: result.outcome }, { status: 409 });
  }
  return Response.json({ ok: true, ...result });
}
