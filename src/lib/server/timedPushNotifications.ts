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
  type AutoGatheringSession,
} from "@/adventure/v2/autoGathering";
import {
  AUTO_GATHERING_RESERVATION_KEY,
  autoGatheringNextStatus,
  autoGatheringPromptReadyAt,
  parseAutoGatheringReservationState,
  type AutoGatheringReservation,
} from "@/adventure/v2/autoGatheringReservation";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  unacknowledgedReadyPlots,
} from "@/adventure/v2/farmReadyNotification";
import {
  pendingRanchReadyPush,
  ranchReadyPushCandidates,
} from "@/adventure/v2/ranchReadyPush";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { PEDDLER_SAVE_KEY } from "@/adventure/v2/peddler";
import {
  PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY,
  peddlerArrivalPushBody,
  peddlerArrivalPushEventKey,
  unacknowledgedPeddlerArrivals,
} from "@/adventure/v2/peddlerArrivalNotification";
import {
  DAY_MS,
  RETENTION_POLICY,
} from "@/lib/server/retentionPolicy";
import { sendWebPushToUser } from "@/lib/server/webPush";

const TIMER_SAVE_KEYS = [
  WOODCUTTING_AUTO_KEY,
  MINING_AUTO_KEY,
  AUTO_GATHERING_RESERVATION_KEY,
  FARM_SAVE_KEY,
  FARM_READY_NOTIFICATION_SAVE_KEY,
  PEDDLER_SAVE_KEY,
  PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY,
] as const;
const DELIVERY_RETENTION_MS = RETENTION_POLICY.pushDeliveryDays * DAY_MS;

type SaveMap = Map<string, unknown>;

// 예약한 다음 작업이 있으면 그 작업까지 끝난 뒤에 한 번만 알린다. 앞 작업만 끝났을 때는 보내지 않는다.
function autoGatheringPush(
  userId: string,
  activity: AutoGatheringActivity,
  session: AutoGatheringSession,
  reservation: AutoGatheringReservation | null,
  now: number,
): { eventKey: string; title: string; body: string } | null {
  const next = autoGatheringNextStatus(session.readyAt, reservation);
  if (autoGatheringPromptReadyAt({ readyAt: session.readyAt, next }) > now) {
    return null;
  }
  const activityName = activity === "woodcutting" ? "벌목" : "채광";
  return next
    ? {
        eventKey: `auto:${userId}:${activity}:${session.sessionId}:next`,
        title: "자동 채집 완료",
        body: `${session.sourceName} 작업과 예약한 ${next.sourceName} 작업이 끝났습니다. 보상을 정산하세요.`,
      }
    : {
        eventKey: `auto:${userId}:${activity}:${session.sessionId}`,
        title: `자동 ${activityName} 완료`,
        body: `${session.sourceName} 작업이 끝났습니다. 보상을 정산하세요.`,
      };
}

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
    const reservation = parseAutoGatheringReservationState(
      saves.get(AUTO_GATHERING_RESERVATION_KEY),
    ).next;
    for (const key of [WOODCUTTING_AUTO_KEY, MINING_AUTO_KEY]) {
      const activity = activityForKey(key);
      const session = parseAutoGatheringState(saves.get(key)).session;
      const push =
        activity && session
          ? autoGatheringPush(userId, activity, session, reservation, now)
          : null;
      if (push) candidateKeys.push(push.eventKey);
    }
    for (const plot of unacknowledgedReadyPlots(
      saves.get(FARM_SAVE_KEY),
      saves.get(FARM_READY_NOTIFICATION_SAVE_KEY),
      now,
    )) {
      candidateKeys.push(`farm:${userId}:${plot.id}:${plot.plantedAt}`);
    }
    candidateKeys.push(
      ...ranchReadyPushCandidates(
        userId,
        saves.get(FARM_SAVE_KEY),
        now,
      ).map((candidate) => candidate.eventKey),
    );
    candidateKeys.push(
      ...unacknowledgedPeddlerArrivals(
        saves.get(PEDDLER_SAVE_KEY),
        saves.get(PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY),
        now,
      ).map((arrival) => peddlerArrivalPushEventKey(userId, arrival)),
    );
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
    const reservation = parseAutoGatheringReservationState(
      saves.get(AUTO_GATHERING_RESERVATION_KEY),
    ).next;
    for (const key of [WOODCUTTING_AUTO_KEY, MINING_AUTO_KEY]) {
      const activity = activityForKey(key);
      const session = parseAutoGatheringState(saves.get(key)).session;
      if (!activity || !session) continue;
      const push = autoGatheringPush(userId, activity, session, reservation, now);
      if (!push) continue;
      const { eventKey } = push;
      if (deliveredKeys.has(eventKey)) continue;
      const result = await sendWebPushToUser(userId, {
        title: push.title,
        body: push.body,
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

    const ranchPlan = pendingRanchReadyPush(
      ranchReadyPushCandidates(userId, saves.get(FARM_SAVE_KEY), now),
      deliveredKeys,
    );
    if (ranchPlan) {
      const result = await sendWebPushToUser(userId, {
        title: "목장 생산 완료",
        body: ranchPlan.body,
        url: "/town/farm#ranch",
        tag: "ranch-ready",
      });
      delivered += result.delivered;
      failed += result.failed;
      if (result.delivered > 0) {
        await recordDeliveries(userId, ranchPlan.eventKeys);
      }
    }

    const pendingArrivals = unacknowledgedPeddlerArrivals(
      saves.get(PEDDLER_SAVE_KEY),
      saves.get(PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY),
      now,
    ).filter(
      (arrival) =>
        !deliveredKeys.has(peddlerArrivalPushEventKey(userId, arrival)),
    );
    if (pendingArrivals.length > 0) {
      const result = await sendWebPushToUser(userId, {
        title: "행상 수레 도착",
        body: peddlerArrivalPushBody(pendingArrivals),
        url: "/town/peddler",
        tag: "peddler-arrived",
      });
      delivered += result.delivered;
      failed += result.failed;
      if (result.delivered > 0) {
        await recordDeliveries(
          userId,
          pendingArrivals.map((arrival) =>
            peddlerArrivalPushEventKey(userId, arrival),
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
