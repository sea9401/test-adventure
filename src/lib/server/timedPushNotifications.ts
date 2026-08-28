import "server-only";

import { eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  pushDeliveries,
  pushSubscriptions,
  savesKv,
} from "@/db/schema";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  autoGatheringActivityHref,
  parseAutoGatheringState,
  type AutoGatheringActivity,
} from "@/adventure/v2/autoGathering";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  unacknowledgedReadyPlots,
} from "@/adventure/v2/farmReadyNotification";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import {
  DAY_MS,
  RETENTION_POLICY,
} from "@/lib/server/retentionPolicy";
import { sendWebPushToUser } from "@/lib/server/webPush";

const TIMER_SAVE_KEYS = [
  WOODCUTTING_AUTO_KEY,
  MINING_AUTO_KEY,
  FARM_SAVE_KEY,
  FARM_READY_NOTIFICATION_SAVE_KEY,
] as const;
const DELIVERY_RETENTION_MS = RETENTION_POLICY.pushDeliveryDays * DAY_MS;

type SaveMap = Map<string, unknown>;

function activityForKey(key: string): AutoGatheringActivity | null {
  if (key === WOODCUTTING_AUTO_KEY) return "woodcutting";
  if (key === MINING_AUTO_KEY) return "mining";
  return null;
}

async function recordDeliveries(userId: string, eventKeys: string[]) {
  if (eventKeys.length === 0) return;
  await db
    .insert(pushDeliveries)
    .values(eventKeys.map((eventKey) => ({ eventKey, userId })))
    .onConflictDoNothing();
}

export async function sendDueTimedPushNotifications(now = Date.now()) {
  const rows = await db
    .selectDistinct({
      userId: savesKv.userId,
      key: savesKv.key,
      value: savesKv.value,
    })
    .from(savesKv)
    .innerJoin(
      pushSubscriptions,
      eq(pushSubscriptions.userId, savesKv.userId),
    )
    .where(inArray(savesKv.key, [...TIMER_SAVE_KEYS]));

  const savesByUser = new Map<string, SaveMap>();
  for (const row of rows) {
    const saves = savesByUser.get(row.userId) ?? new Map<string, unknown>();
    saves.set(row.key, row.value);
    savesByUser.set(row.userId, saves);
  }

  const candidateKeys: string[] = [];
  for (const [userId, saves] of savesByUser) {
    for (const key of [WOODCUTTING_AUTO_KEY, MINING_AUTO_KEY]) {
      const activity = activityForKey(key);
      const session = parseAutoGatheringState(saves.get(key)).session;
      if (activity && session && session.readyAt <= now) {
        candidateKeys.push(`auto:${userId}:${activity}:${session.sessionId}`);
      }
    }
    for (const plot of unacknowledgedReadyPlots(
      saves.get(FARM_SAVE_KEY),
      saves.get(FARM_READY_NOTIFICATION_SAVE_KEY),
      now,
    )) {
      candidateKeys.push(`farm:${userId}:${plot.id}:${plot.plantedAt}`);
    }
  }

  const deliveredKeys = new Set<string>();
  if (candidateKeys.length > 0) {
    const delivered = await db
      .select({ eventKey: pushDeliveries.eventKey })
      .from(pushDeliveries)
      .where(inArray(pushDeliveries.eventKey, candidateKeys));
    for (const row of delivered) deliveredKeys.add(row.eventKey);
  }

  let users = 0;
  let delivered = 0;
  let failed = 0;
  for (const [userId, saves] of savesByUser) {
    users += 1;
    for (const key of [WOODCUTTING_AUTO_KEY, MINING_AUTO_KEY]) {
      const activity = activityForKey(key);
      const session = parseAutoGatheringState(saves.get(key)).session;
      if (!activity || !session || session.readyAt > now) continue;
      const eventKey = `auto:${userId}:${activity}:${session.sessionId}`;
      if (deliveredKeys.has(eventKey)) continue;
      const activityName = activity === "woodcutting" ? "벌목" : "채광";
      const result = await sendWebPushToUser(userId, {
        title: `자동 ${activityName} 완료`,
        body: `${session.sourceName} 작업이 끝났습니다. 보상을 정산하세요.`,
        url:
          autoGatheringActivityHref({
            activity,
            sourceId: session.sourceId,
            sourceName: session.sourceName,
            readyAt: session.readyAt,
          }) ?? "/town",
        tag: `auto-${activity}-${session.sessionId}`,
      });
      delivered += result.delivered;
      failed += result.failed;
      if (result.delivered > 0) await recordDeliveries(userId, [eventKey]);
    }

    const pendingPlots = unacknowledgedReadyPlots(
      saves.get(FARM_SAVE_KEY),
      saves.get(FARM_READY_NOTIFICATION_SAVE_KEY),
      now,
    ).filter(
      (plot) =>
        !deliveredKeys.has(`farm:${userId}:${plot.id}:${plot.plantedAt}`),
    );
    if (pendingPlots.length > 0) {
      const result = await sendWebPushToUser(userId, {
        title: "농장 수확 준비 완료",
        body: `수확할 수 있는 밭이 ${pendingPlots.length}곳 있습니다.`,
        url: "/town/farm",
        tag: "farm-ready",
      });
      delivered += result.delivered;
      failed += result.failed;
      if (result.delivered > 0) {
        await recordDeliveries(
          userId,
          pendingPlots.map(
            (plot) => `farm:${userId}:${plot.id}:${plot.plantedAt}`,
          ),
        );
      }
    }
  }

  await db
    .delete(pushDeliveries)
    .where(
      lt(pushDeliveries.createdAt, new Date(now - DELIVERY_RETENTION_MS)),
    );

  return { users, candidates: candidateKeys.length, delivered, failed };
}
