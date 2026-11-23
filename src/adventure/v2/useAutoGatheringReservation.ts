"use client";

// 자동 채집 다음 작업 예약의 화면 쪽 상태. 벌목·채광 화면이 같이 쓴다.

import { useCallback, useState } from "react";
import type { AutoGatheringChainView } from "./AutoGatheringCard";
import {
  parseAutoGatheringSessionView,
  type AutoGatheringActivity,
  type AutoGatheringPlanId,
  type AutoGatheringSessionView,
} from "./autoGathering";
import {
  autoGatheringNextStatus,
  parseAutoGatheringReservationView,
  type AutoGatheringReservation,
} from "./autoGatheringReservation";
import { useGameActivityState } from "./GameStateProvider";
import { parseAutoActivity, requestAutoGathering } from "./gatheringClient";
import { lifeRequestError } from "./sharedNetworkLimit";

type Json = Record<string, unknown>;

export type ChainedAutoView = {
  activity: AutoGatheringActivity;
  session: AutoGatheringSessionView;
};

function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

/** 정산 응답에 실린 "이어서 시작된 예약 작업"을 읽는다. */
export function parseChainedAuto(json: unknown): ChainedAutoView | null {
  const body = asJson(json);
  const chained = asJson(body.chainedAuto);
  const activity = parseAutoActivity(chained.activity);
  if (!activity) return null;
  const session = parseAutoGatheringSessionView(chained.session, {
    serverNow: body.serverNow,
    fallbackSourceName: activity === "woodcutting" ? "나무" : "광맥",
  });
  return session ? { activity, session } : null;
}

export function useAutoGatheringReservation(
  activity: AutoGatheringActivity,
  readJson: (response: Response) => Promise<unknown>,
) {
  const { setAutoGathering } = useGameActivityState();
  const [reservation, setReservation] = useState<AutoGatheringReservation | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [chain, setChain] = useState<AutoGatheringChainView | null>(null);
  const [dropped, setDropped] = useState(false);

  const loadStatus = useCallback((json: unknown) => {
    const body = asJson(json);
    setReservation(
      parseAutoGatheringReservationView(body.autoReservation, {
        serverNow: body.serverNow,
      }),
    );
    setAllowed(body.autoReservationAllowed === true);
  }, []);

  const reserve = useCallback(
    async (spotId: string, planId: AutoGatheringPlanId): Promise<void> => {
      const { response, json } = await requestAutoGathering(
        activity,
        { action: "reserve", spotId, planId },
        readJson,
      );
      const body = asJson(json);
      if (!response.ok || body.ok !== true) {
        if (body.error === "support_required") setAllowed(false);
        throw lifeRequestError(json, `${activity}_auto_reserve_failed`);
      }
      const next = parseAutoGatheringReservationView(body.autoReservation, {
        serverNow: body.serverNow,
      });
      setReservation(next);
      // 상단바가 바로 예약 작업의 끝 시각을 따르게 한다.
      setAutoGathering((current) =>
        current
          ? { ...current, next: autoGatheringNextStatus(current.readyAt, next) }
          : current,
      );
    },
    [activity, readJson, setAutoGathering],
  );

  const unreserve = useCallback(async (): Promise<void> => {
    const { response, json } = await requestAutoGathering(
      activity,
      { action: "unreserve" },
      readJson,
    );
    if (!response.ok || asJson(json).ok !== true) {
      throw lifeRequestError(json, `${activity}_auto_unreserve_failed`);
    }
    setReservation(null);
    setAutoGathering((current) =>
      current ? { ...current, next: undefined } : current,
    );
  }, [activity, readJson, setAutoGathering]);

  /** 정산·중단 응답을 반영한다. 이어서 시작된 예약 작업이 있으면 돌려준다. */
  const applySettled = useCallback(
    (json: unknown): ChainedAutoView | null => {
      const chained = parseChainedAuto(json);
      setReservation(null);
      setChain(
        chained
          ? { activity: chained.activity, sourceName: chained.session.sourceName }
          : null,
      );
      setDropped(asJson(json).reservationDropped === true);
      setAutoGathering(
        chained
          ? {
              activity: chained.activity,
              sourceId: chained.session.sourceId,
              sourceName: chained.session.sourceName,
              readyAt: chained.session.readyAt,
            }
          : null,
      );
      return chained;
    },
    [setAutoGathering],
  );

  const clearNotice = useCallback(() => {
    setChain(null);
    setDropped(false);
  }, []);

  return {
    reservation,
    allowed,
    chain,
    dropped,
    loadStatus,
    reserve,
    unreserve,
    applySettled,
    clearNotice,
  };
}
