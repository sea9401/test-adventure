"use client";

import { lifeRequestError } from "./sharedNetworkLimit";
import { useCallback, useEffect, useState } from "react";
import type {
  MiningHandlers,
  MiningLogView,
  MiningNodeView,
  MiningOutcome,
  MiningStart,
} from "./MiningView";
import type { MiningSpotId } from "@/adventure/data/v2/miningSpots";
import { useActivityVerification } from "./useActivityVerification";
import type { AutoGatheringResultView, AutoGatheringSessionView } from "./AutoGatheringCard";
import {
  parseAutoGatheringSessionView,
  type AutoGatheringActivity,
  type AutoGatheringPlanId,
} from "./autoGathering";
import { useGameActivityState } from "./GameStateProvider";
import { useSystemToast } from "./RewardToastProvider";
import { LIFE_LEVEL_MIGRATION_NOTICE } from "./lifeLevelProgression";
import { parseDiningXpBonus } from "./diningXpBonus";
import { parseMasterProductGain } from "./masterProductGain";
import {
  parseGatheringSiteUpkeep,
  type GatheringSiteUpkeepState,
} from "./gatheringSiteUpkeep";

import { useAutoGatheringReservation } from "./useAutoGatheringReservation";
import {
  parseAutoActivity,
  parseMaterials,
  parseNextActionAt,
  wait,
  requestAutoGathering,
} from "./gatheringClient";

function parseLog(value: unknown): MiningLogView {
  const item = (value ?? {}) as Record<string, unknown>;
  const successes = Math.max(0, Math.floor(Number(item.successes) || 0));
  const storedXp = Number(item.xp);
  return {
    successes,
    xp:
      Object.prototype.hasOwnProperty.call(item, "xp") && Number.isFinite(storedXp)
        ? Math.max(0, Math.floor(storedXp))
        : successes * 10,
    oreEarned: Math.max(0, Math.floor(Number(item.oreEarned) || 0)),
    byproductsEarned: Math.max(
      0,
      Math.floor(Number(item.byproductsEarned) || 0),
    ),
  };
}

function parseNode(value: unknown): MiningNodeView {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? "광맥"),
    materialId: String(item.materialId ?? "v2_iron_ore"),
    xp: Math.max(0, Math.floor(Number(item.xp) || 5)),
  };
}

function parseAutoResult(value: unknown): AutoGatheringResultView {
  const item = (value ?? {}) as Record<string, unknown>;
  const byproducts = Array.isArray(item.byproducts)
    ? item.byproducts
        .map((value) => {
          const drop = (value ?? {}) as Record<string, unknown>;
          return {
            materialId: String(drop.materialId ?? ""),
            name: String(drop.name ?? "부산물"),
            amount: Math.max(0, Math.floor(Number(drop.amount) || 0)),
          };
        })
        .filter((drop) => drop.amount > 0)
    : [];
  return {
    attempts: Math.max(0, Math.floor(Number(item.attempts) || 0)),
    successes: Math.max(0, Math.floor(Number(item.successes) || 0)),
    materialName: String(item.materialName ?? "광석"),
    materialsGained: Math.max(0, Math.floor(Number(item.materialsGained) || 0)),
    xpGained: Math.max(0, Math.floor(Number(item.xpGained) || 0)),
    byproducts,
    masterProduct: parseMasterProductGain(item),
    diningXpBonus: parseDiningXpBonus(item),
  };
}

export function useMining(): MiningHandlers {
  const { setAutoGathering } = useGameActivityState();
  const { notifySystem } = useSystemToast();
  const { verification, verifyHuman, readJson } = useActivityVerification("mining");
  const {
    reservation: autoReservation,
    allowed: autoReservationAllowed,
    chain: autoChain,
    dropped: autoReservationDropped,
    loadStatus: loadReservationStatus,
    reserve: reserveNext,
    unreserve: unreserveNext,
    applySettled,
    clearNotice: clearReservationNotice,
  } = useAutoGatheringReservation("mining", readJson);
  const [failureReductionPct, setFailureReductionPct] = useState(0);
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [log, setLog] = useState<MiningLogView>({
    successes: 0,
    xp: 0,
    oreEarned: 0,
    byproductsEarned: 0,
  });
  const [autoSession, setAutoSession] = useState<AutoGatheringSessionView | null>(null);
  const [autoResult, setAutoResult] = useState<AutoGatheringResultView | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [activeAutoActivity, setActiveAutoActivity] =
    useState<AutoGatheringActivity | null>(null);
  const [siteUpkeep, setSiteUpkeep] = useState<GatheringSiteUpkeepState>({});
  const [lifeRenown, setLifeRenown] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/v2/mining/status");
        if (!response.ok) return;
        const json = await response.json();
        if (!alive || !json?.ok) return;
        setMaterials(parseMaterials(json.materials));
        setLog(parseLog(json.log));
        setFailureReductionPct(
          Math.min(90, Math.max(0, Number(json.failureReductionPct) || 0)),
        );
        setAutoSession(
          parseAutoGatheringSessionView(json.autoSession, {
            serverNow: json.serverNow,
            fallbackSourceName: "광맥",
          }),
        );
        setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
        loadReservationStatus(json);
        setSiteUpkeep(parseGatheringSiteUpkeep(json.siteUpkeep));
        setLifeRenown(Math.max(0, Math.floor(Number(json.lifeRenown) || 0)));
      } catch {
        // 표시용 상태라 실패해도 화면 진입은 유지한다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadReservationStatus]);

  const start = useCallback(
    async (spotId: MiningSpotId): Promise<MiningStart> => {
      const response = await fetch("/api/v2/mining/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spotId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw lifeRequestError(json, "mining_start_failed");
      }
      const durationMs = Math.max(1, Math.floor(Number(json?.durationMs) || 0));
      const strikes = Math.max(1, Math.floor(Number(json?.strikes) || 0));
      if (!json?.ok || typeof json.sessionId !== "string" || !durationMs || !strikes) {
        throw new Error("mining_start_failed");
      }
      setMaterials(parseMaterials(json.materials));
      setLog(parseLog(json.log));
      setFailureReductionPct(
        Math.min(90, Math.max(0, Number(json.failureReductionPct) || 0)),
      );
      return {
        sessionId: json.sessionId,
        spotId,
        node: parseNode(json.node),
        durationMs,
        strikes,
        failureRate: Math.min(1, Math.max(0, Number(json.failureRate) || 0)),
      };
    },
    [readJson],
  );

  const finish = useCallback(
    async (sessionId: string): Promise<MiningOutcome> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/v2/mining/strike", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await readJson(response);
        if (!response.ok || !json?.ok) {
          const active = parseAutoActivity(json?.activeAutoActivity);
          if (active) setActiveAutoActivity(active);
          throw lifeRequestError(json, "mining_finish_failed");
        }
        if (!json.success && json.reason === "not_ready" && attempt === 0) {
          await wait(Math.max(25, Math.floor(Number(json.retryAfterMs) || 0) + 25));
          continue;
        }
        if (!json.success) {
          return {
            success: false,
            reason: typeof json.reason === "string" ? json.reason : "unknown",
            nextActionAt: parseNextActionAt(json.nextActionAt),
          };
        }
        if (json.levelCurveMigrated) {
          notifySystem(LIFE_LEVEL_MIGRATION_NOTICE, "info");
        }
        const nextMaterials = parseMaterials(json.materials);
        const nextLog = parseLog(json.log);
        setMaterials(nextMaterials);
        setLog(nextLog);
        return {
          success: true,
          node: parseNode(json.node),
          materialName: String(json.materialName ?? "광석"),
          materialGained: Math.max(0, Math.floor(Number(json.materialGained) || 0)),
          nextActionAt: parseNextActionAt(json.nextActionAt),
          byproducts: Array.isArray(json.byproducts)
            ? json.byproducts.map((item: unknown) => {
                const entry = (item ?? {}) as Record<string, unknown>;
                return {
                  materialId: String(entry.materialId ?? ""),
                  name: String(entry.name ?? "부산물"),
                  amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
                };
              })
            : [],
          masterProduct: parseMasterProductGain(json),
          xpGained: Math.max(0, Math.floor(Number(json.xpGained) || 0)),
          diningXpBonus: parseDiningXpBonus(json),
          log: nextLog,
        };
      }
      throw new Error("mining_finish_failed");
    },
    [notifySystem, readJson],
  );

  const startAuto = useCallback(async (
    spotId: MiningSpotId,
    planId: AutoGatheringPlanId,
    // 정산 직후 다시 시작할 때는 방금 받은 정산 결과를 화면에 남긴다.
    keepResult = false,
  ): Promise<void> => {
    setAutoLoading(true);
    try {
      const { response, json } = await requestAutoGathering("mining", { action: "start", spotId, planId }, readJson);
      if (!response.ok || !json?.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw lifeRequestError(json, "mining_auto_start_failed");
      }
      const session = parseAutoGatheringSessionView(json.autoSession, {
        serverNow: json.serverNow,
        fallbackSourceName: "광맥",
      });
      setAutoSession(session);
      setActiveAutoActivity("mining");
      if (!keepResult) {
        setAutoResult(null);
        clearReservationNotice();
      }
      setAutoGathering(
        session
          ? {
              activity: "mining",
              sourceId: session.sourceId,
              sourceName: session.sourceName,
              readyAt: session.readyAt,
            }
          : null,
      );
    } finally {
      setAutoLoading(false);
    }
  }, [clearReservationNotice, readJson, setAutoGathering]);

  // 정산(claim)과 중간 정산(cancel). 예약해 둔 다음 작업이 이어서 시작됐으면 그 작업을 돌려준다.
  const settleAuto = useCallback(
    async (action: "claim" | "cancel") => {
      setAutoLoading(true);
      try {
        const { response, json } = await requestAutoGathering("mining", { action }, readJson);
        if (!response.ok || !json?.ok) throw lifeRequestError(json, `mining_auto_${action}_failed`);
        if (json.levelCurveMigrated) {
          notifySystem(LIFE_LEVEL_MIGRATION_NOTICE, "info");
        }
        setMaterials(parseMaterials(json.materials));
        setLog(parseLog(json.log));
        const chained = applySettled(json);
        setAutoSession(chained?.activity === "mining" ? chained.session : null);
        setActiveAutoActivity(
          chained?.activity ?? parseAutoActivity(json.activeAutoActivity),
        );
        setAutoResult(parseAutoResult(json));
        return chained;
      } finally {
        setAutoLoading(false);
      }
    },
    [applySettled, notifySystem, readJson],
  );

  const claimAuto = useCallback(async (): Promise<void> => {
    await settleAuto("claim");
  }, [settleAuto]);

  const cancelAuto = useCallback(async (): Promise<void> => {
    await settleAuto("cancel");
  }, [settleAuto]);

  const reserveAuto = useCallback(
    async (spotId: MiningSpotId, planId: AutoGatheringPlanId): Promise<void> => {
      setAutoLoading(true);
      try {
        await reserveNext(spotId, planId);
      } finally {
        setAutoLoading(false);
      }
    },
    [reserveNext],
  );

  const unreserveAuto = useCallback(async (): Promise<void> => {
    setAutoLoading(true);
    try {
      await unreserveNext();
    } finally {
      setAutoLoading(false);
    }
  }, [unreserveNext]);

  // 보상을 받고 같은 작업을 다시 건다. 예약 작업이 이어졌으면 다음 작업으로 다시 예약한다.
  const restartAuto = useCallback(
    async (spotId: MiningSpotId, planId: AutoGatheringPlanId): Promise<void> => {
      const chained = await settleAuto("claim");
      if (chained) await reserveAuto(spotId, planId);
      else await startAuto(spotId, planId, true);
    },
    [reserveAuto, settleAuto, startAuto],
  );

  return {
    start,
    finish,
    materials,
    failureReductionPct,
    log,
    autoSession,
    autoResult,
    autoLoading,
    activeAutoActivity,
    siteUpkeep,
    lifeRenown,
    startAuto,
    claimAuto,
    cancelAuto,
    autoReservation,
    autoReservationAllowed,
    autoChain,
    autoReservationDropped,
    reserveAuto,
    unreserveAuto,
    restartAuto,
    verification,
    verifyHuman,
  };
}
