// 자동 채집 다음 작업 예약 — 예약·취소 요청과, 정산 뒤 예약한 작업을 이어서 시작하는 처리.
// 규칙은 docs/superpowers/specs/2026-11-23-auto-gathering-reservation-design.md 를 따른다.

import {
  adventureSupportBenefits,
  adventureSupportTier,
} from "@/adventure/data/v2/adventureSupport";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  beginAutoGathering,
  isAutoGatheringPlanId,
  type AutoGatheringActivity,
  type AutoGatheringSession,
  type AutoGatheringState,
} from "@/adventure/v2/autoGathering";
import {
  AUTO_GATHERING_RESERVATION_KEY,
  EMPTY_AUTO_GATHERING_RESERVATION,
  createAutoGatheringReservation,
  parseAutoGatheringReservationState,
  reservationStartAt,
  type AutoGatheringReservation,
} from "@/adventure/v2/autoGatheringReservation";
import { db } from "@/db";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { activityVerificationGateResponse } from "@/lib/server/activityGuardServer";
import {
  autoGatheringPlannedDurationMs,
  autoGatheringSource,
  buildAutoGatheringSession,
} from "@/lib/server/autoGatheringSessionBuilder";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
  lockLifeActivityUserForUpdate,
} from "@/lib/server/lifeActivityLock";
import { readSave, upsertSave, type DbExecutor } from "@/lib/server/savesKv";

const AUTO_KEY: Record<AutoGatheringActivity, string> = {
  mining: MINING_AUTO_KEY,
  woodcutting: WOODCUTTING_AUTO_KEY,
};

export async function readAutoGatheringReservation(
  executor: DbExecutor,
  userId: string,
): Promise<AutoGatheringReservation | null> {
  return parseAutoGatheringReservationState(
    await readSave(executor, userId, AUTO_GATHERING_RESERVATION_KEY, {}),
  ).next;
}

/** 새 작업을 바로 시작할 때 부른다. 진행 중인 작업 없이 남은 예약은 낡은 것이라 지운다. */
export async function clearAutoGatheringReservationInTx(
  tx: DbExecutor,
  userId: string,
): Promise<void> {
  if (await readAutoGatheringReservation(tx, userId)) {
    await upsertSave(
      tx,
      userId,
      AUTO_GATHERING_RESERVATION_KEY,
      EMPTY_AUTO_GATHERING_RESERVATION,
    );
  }
}

/** 지금 지원권 등급으로 걸 수 있는 예약 수가 남아 있는지. */
export function autoGatheringReservationAllowed(
  character: unknown,
  now: number,
): boolean {
  const support =
    character && typeof character === "object"
      ? (character as Record<string, unknown>).adventureSupport
      : null;
  return (
    adventureSupportBenefits(adventureSupportTier(support, now))
      .autoGatheringReservations > 0
  );
}

/** 상태 응답에 싣는 예약 정보. 진행 중인 자동 채집이 없으면 예약도 없는 것으로 본다. */
export async function autoGatheringReservationStatus(
  executor: DbExecutor,
  userId: string,
  character: unknown,
  hasActiveAutoGathering: boolean,
  now: number = Date.now(),
): Promise<{
  autoReservation: AutoGatheringReservation | null;
  autoReservationAllowed: boolean;
}> {
  return {
    autoReservation: hasActiveAutoGathering
      ? await readAutoGatheringReservation(executor, userId)
      : null,
    autoReservationAllowed: autoGatheringReservationAllowed(character, now),
  };
}

/** `action: "reserve" | "unreserve"` 요청을 처리한다. 벌목·채광 두 경로가 같이 쓴다. */
export async function autoGatheringReservationResponse(
  userId: string,
  activity: AutoGatheringActivity,
  body: { action?: unknown; spotId?: unknown; planId?: unknown },
): Promise<Response> {
  const now = Date.now();
  if (body.action === "unreserve") {
    await db.transaction(async (tx) => {
      await lockLifeActivityUserForUpdate(tx, userId);
      await upsertSave(
        tx,
        userId,
        AUTO_GATHERING_RESERVATION_KEY,
        EMPTY_AUTO_GATHERING_RESERVATION,
      );
    });
    return Response.json({ ok: true, serverNow: Date.now(), autoReservation: null });
  }

  const source = autoGatheringSource(activity, body.spotId);
  if (!source || typeof body.spotId !== "string") {
    return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
  }
  if (body.planId !== undefined && !isAutoGatheringPlanId(body.planId)) {
    return Response.json({ ok: false, error: "bad_plan" }, { status: 400 });
  }
  const spotId = body.spotId;
  const planId = isAutoGatheringPlanId(body.planId) ? body.planId : "standard";

  // 예약도 자동 채집을 거는 행동이다. 시작과 같은 사람 확인을 거친다.
  const verificationRequired = activityVerificationGateResponse(
    parseActivityGuardState(await readSave(db, userId, ACTIVITY_GUARD_KEY, {})),
    activity,
  );
  if (verificationRequired) return verificationRequired;

  const result = await db.transaction(async (tx) => {
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    if (!activeAutoGatheringActivity(autoStates)) {
      return { error: "no_active_session" as const, status: 409 };
    }
    const character = await readSave(tx, userId, "character.v2", {});
    if (!autoGatheringReservationAllowed(character, now)) {
      return { error: "support_required" as const, status: 403 };
    }
    const reservation = createAutoGatheringReservation({
      activity,
      spotId,
      planId,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      durationMs: await autoGatheringPlannedDurationMs(
        tx,
        userId,
        source.sourceId,
        planId,
      ),
      reservedAt: now,
    });
    await upsertSave(tx, userId, AUTO_GATHERING_RESERVATION_KEY, {
      next: reservation,
    });
    return { reservation };
  });
  if ("error" in result) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  return Response.json({
    ok: true,
    serverNow: Date.now(),
    autoReservation: result.reservation,
  });
}

export type ChainedAutoGathering = {
  activity: AutoGatheringActivity;
  session: AutoGatheringSession;
};

export type ReservedAutoGatheringStart = {
  chained: ChainedAutoGathering | null;
  /** 예약이 있었지만 작업을 만들 수 없어 버렸다. */
  dropped: boolean;
};

/**
 * 정산(또는 중간 정산)이 끝난 뒤 같은 트랜잭션에서 부른다. 예약이 있으면 그 작업을 시작한 것으로 올린다.
 * 정산은 앞 작업이 끝난 시각으로, 중간 정산은 지금 시각으로 시작 시각을 잡는다.
 * `lockAutoGatheringStatesForUpdate`로 사용자 행을 이미 잠근 뒤여야 한다.
 */
export async function startReservedAutoGatheringInTx(
  tx: DbExecutor,
  userId: string,
  args: {
    settledActivity: AutoGatheringActivity;
    settledSession: AutoGatheringSession;
    /** 방금 정산을 마친 쪽의 새 상태(세션 없음, 나머지 갱신됨). */
    settledState: AutoGatheringState;
    otherState: AutoGatheringState;
    canceled: boolean;
    now: number;
  },
): Promise<ReservedAutoGatheringStart> {
  const reservation = await readAutoGatheringReservation(tx, userId);
  if (!reservation) return { chained: null, dropped: false };
  // 다른 쪽 자동 채집이 남아 있으면 겹쳐 올리지 않는다. 예약은 그대로 둔다.
  if (args.otherState.session) return { chained: null, dropped: false };

  const startAt = args.canceled
    ? args.now
    : Math.min(
        args.now,
        reservationStartAt(args.settledSession.readyAt, reservation),
      );
  const built = await buildAutoGatheringSession(
    tx,
    userId,
    reservation.activity,
    reservation.spotId,
    {
      planId: reservation.planId,
      now: startAt,
      extendedDurationMs: reservation.durationMs,
    },
  );
  await upsertSave(
    tx,
    userId,
    AUTO_GATHERING_RESERVATION_KEY,
    EMPTY_AUTO_GATHERING_RESERVATION,
  );
  if (!built) return { chained: null, dropped: true };

  const base =
    reservation.activity === args.settledActivity
      ? args.settledState
      : args.otherState;
  await upsertSave(
    tx,
    userId,
    AUTO_KEY[reservation.activity],
    beginAutoGathering(base, built.session),
  );
  return {
    chained: { activity: reservation.activity, session: built.session },
    dropped: false,
  };
}
