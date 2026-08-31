"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DangerousBait,
  DangerousBaitId,
  DangerousDepth,
  DangerousDepthId,
  DangerousFish,
  DangerousLine,
  DangerousReel,
  DangerousRod,
  DangerousZone,
  DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type {
  DangerousFishingHeritage,
} from "./dangerousFishingHeritage";
import type {
  DangerousFishingState,
  DangerousFishingVoyage,
  DangerousRiskPreview,
} from "./dangerousFishingState";
import type {
  DangerousEncounterView,
  DangerousFishingAction,
} from "./dangerousFishingEncounter";
import type { DangerousRealtimeClientEncounter } from "./useDangerousFishingRealtime";
import { dangerousRealtimeView } from "./dangerousFishingRealtime";
import type { DangerousFishingBossViewModel } from "./DangerousFishingBossPanel";
import {
  ActivityVerificationRequiredError,
  useActivityVerification,
} from "./useActivityVerification";
import {
  dangerousFishingActionFeedback,
  dangerousFishingBossClaimFeedback,
  dangerousFishingReturnFeedback,
  type DangerousFishingFeedback,
} from "./dangerousFishingFeedback";

export type DangerousFishingClientVoyage = Omit<
  DangerousFishingVoyage,
  "encounter"
> & {
  encounter:
    | (DangerousEncounterView & { simulationVersion?: 1 })
    | DangerousRealtimeClientEncounter
    | null;
};

export type DangerousFishingClientState = Omit<
  DangerousFishingState,
  "voyage" | "bossAttempt" | "realtimeCompletions"
> & {
  voyage: DangerousFishingClientVoyage | null;
  bossAttempt: {
    eventId: string;
    encounter:
      | (DangerousEncounterView & { simulationVersion?: 1 })
      | DangerousRealtimeClientEncounter;
  } | null;
};

export type DangerousFishingViewModel = {
  ok: true;
  now: number;
  state: DangerousFishingClientState;
  heritage: DangerousFishingHeritage;
  fishingCoins: number;
  activeAutoActivity: "woodcutting" | "mining" | null;
  catalogs: {
    zones: Record<DangerousZoneId, DangerousZone>;
    depths: Record<DangerousDepthId, DangerousDepth>;
    fish: Record<string, DangerousFish>;
    rods: Record<string, DangerousRod>;
    reels: Record<string, DangerousReel>;
    lines: Record<string, DangerousLine>;
    baits: Record<DangerousBaitId, DangerousBait>;
  };
  riskPreview: DangerousRiskPreview;
};

export type DangerousFishingBusy =
  | "voyage"
  | "return"
  | "encounter"
  | "action"
  | "boss"
  | null;

type DangerousFishingJsonReader = (response: Response) => Promise<unknown>;

async function apiJson(
  path: string,
  readJson: DangerousFishingJsonReader,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, init);
  const raw = await readJson(response);
  const json =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  if (!response.ok || json.ok !== true) {
    const error = new Error(
      typeof json.error === "string" ? json.error : "network",
    );
    Object.assign(error, { status: response.status, detail: json });
    throw error;
  }
  return json;
}

function errorCode(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "network";
}

export function dangerousFishingRealtimeFinishFeedback(args: {
  scope: "voyage" | "boss";
  encounter: DangerousRealtimeClientEncounter;
  response: Record<string, unknown>;
  targetName: string;
}): DangerousFishingFeedback | null {
  const current = args.encounter.view ?? dangerousRealtimeView(
    args.encounter.checkpoint,
    args.encounter.config,
  );
  const before: DangerousEncounterView = {
    id: args.encounter.id,
    targetKind: args.encounter.targetKind,
    targetId: args.encounter.targetId,
    status: current.status === "active"
      ? "active"
      : current.status === "caught"
        ? "caught"
        : "failed",
    tension: current.tension,
    maxTension: current.maxTension,
    stamina: current.stamina,
    maxStamina: current.maxStamina,
    distance: current.distance,
    startDistance: current.startDistance,
    slackTurns: current.lowTensionTicks,
    slackTolerance: 0,
    step: current.tick,
    revision: args.encounter.revision,
    nextActionAt: 0,
    expiresAt: args.encounter.expiresAt,
    reelPowerBonus: 0,
    staminaDamageBonus: 0,
    tensionControlBonus: 0,
    behavior: current.behavior,
  };
  return dangerousFishingActionFeedback({
    scope: args.scope,
    action: "reel",
    before,
    response: args.response,
    targetName: args.targetName,
  });
}

export function useDangerousFishing() {
  const { verification, verifyHuman, readJson } =
    useActivityVerification("fishing");
  const [model, setModel] = useState<DangerousFishingViewModel | null>(null);
  const [boss, setBoss] = useState<DangerousFishingBossViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DangerousFishingBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DangerousFishingFeedback | null>(
    null,
  );
  const refreshRequestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    try {
      const [statusJson, bossJson] = await Promise.all([
        apiJson("/api/v2/dangerous-fishing/status", readJson),
        apiJson("/api/v2/dangerous-fishing/boss", readJson),
      ]);
      if (requestId !== refreshRequestIdRef.current) return true;
      setModel(statusJson as unknown as DangerousFishingViewModel);
      setBoss(bossJson as unknown as DangerousFishingBossViewModel);
      setError(null);
      return true;
    } catch (caught) {
      if (requestId !== refreshRequestIdRef.current) return false;
      if (!(caught instanceof ActivityVerificationRequiredError)) {
        setError(errorCode(caught));
      }
      return false;
    } finally {
      if (requestId === refreshRequestIdRef.current) setLoading(false);
    }
  }, [readJson]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const activeEncounterId = model?.state.voyage?.encounter?.id ?? null;
  const activeBossId = boss?.event?.status === "active" ? boss.event.id : null;
  useEffect(() => {
    if (!activeEncounterId && !activeBossId) return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [activeBossId, activeEncounterId, refresh]);

  const mutate = useCallback(
    async (
      kind: Exclude<DangerousFishingBusy, null>,
      endpoint: string,
      body: Record<string, unknown>,
      onSuccess?: (json: Record<string, unknown>) => void,
    ) => {
      if (busy) return false;
      setBusy(kind);
      setError(null);
      try {
        const json = await apiJson(
          endpoint,
          readJson,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        onSuccess?.(json);
        return await refresh();
      } catch (caught) {
        if (!(caught instanceof ActivityVerificationRequiredError)) {
          setError(errorCode(caught));
        }
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, readJson, refresh],
  );

  const startVoyage = useCallback(
    (zoneId: DangerousZoneId, depthId: DangerousDepthId) => {
      setFeedback(null);
      return mutate("voyage", "/api/v2/dangerous-fishing/voyage", {
        action: "start",
        zoneId,
        depthId,
      });
    },
    [mutate],
  );
  const returnVoyage = useCallback(
    () =>
      mutate("return", "/api/v2/dangerous-fishing/voyage", {
        action: "return",
      }, (json) => {
        setFeedback(dangerousFishingReturnFeedback(json));
      }),
    [mutate],
  );
  const startEncounter = useCallback(
    (baitId: DangerousBaitId) => {
      setFeedback(null);
      return mutate("encounter", "/api/v2/dangerous-fishing/encounter", {
        action: "start_realtime",
        baitId,
      }, (json) => {
        const returned = dangerousFishingReturnFeedback(json);
        if (returned) setFeedback(returned);
      });
    },
    [mutate],
  );
  const act = useCallback(
    (action: DangerousFishingAction, encounterId: string, revision: number) => {
      const before = model?.state.voyage?.encounter;
      const legacyBefore = before?.simulationVersion === 2 ? null : before;
      const targetName = legacyBefore
        ? (model?.catalogs.fish[legacyBefore.targetId]?.name ?? legacyBefore.targetId)
        : null;
      return mutate("action", "/api/v2/dangerous-fishing/encounter", {
        action,
        encounterId,
        revision,
      }, (json) => {
        if (!legacyBefore || !targetName) return;
        setFeedback(
          dangerousFishingActionFeedback({
            scope: "voyage",
            action,
            before: legacyBefore,
            response: json,
            targetName,
          }),
        );
      });
    },
    [model, mutate],
  );
  const startBossAttempt = useCallback(
    (eventId: string) => {
      setFeedback(null);
      return mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action: "start_realtime",
        eventId,
        baitId: model?.state.loadout.baitId ?? "basic_bait",
      });
    },
    [model?.state.loadout.baitId, mutate],
  );
  const actOnBoss = useCallback(
    (
      action: DangerousFishingAction,
      eventId: string,
      encounterId: string,
      revision: number,
    ) => {
      const before = boss?.attempt?.encounter;
      const targetName = boss?.event?.name ?? before?.targetId ?? null;
      return mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action,
        eventId,
        encounterId,
        revision,
      }, (json) => {
        if (!before || !targetName) return;
        setFeedback(
          dangerousFishingActionFeedback({
            scope: "boss",
            action,
            before,
            response: json,
            targetName,
          }),
        );
      });
    },
    [boss, mutate],
  );
  const claimBossReward = useCallback(
    (eventId: string, claimedBossName?: string) => {
      const bossName = claimedBossName ?? boss?.event?.name ?? "거대어";
      return mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action: "claim",
        eventId,
      }, (json) => {
        setFeedback(dangerousFishingBossClaimFeedback(json, bossName));
      });
    },
    [boss?.event?.name, mutate],
  );
  const handleRealtimeFinish = useCallback(
    (scope: "voyage" | "boss", response: Record<string, unknown>) => {
      const realtime = scope === "voyage"
        ? model?.state.voyage?.encounter
        : boss?.realtimeAttempt?.encounter;
      if (realtime?.simulationVersion === 2) {
        const encounter = realtime as unknown as DangerousRealtimeClientEncounter;
        const targetName = scope === "voyage"
          ? (model?.catalogs.fish[encounter.targetId]?.name ?? encounter.targetId)
          : (boss?.event?.name ?? encounter.targetId);
        const nextFeedback = dangerousFishingRealtimeFinishFeedback({
          scope,
          encounter,
          response,
          targetName,
        });
        if (nextFeedback) setFeedback(nextFeedback);
      }
      void refresh();
    },
    [boss, model, refresh],
  );

  return {
    model,
    boss,
    loading,
    busy,
    error,
    feedback,
    verification,
    verifyHuman,
    readJson,
    refresh,
    startVoyage,
    returnVoyage,
    startEncounter,
    act,
    startBossAttempt,
    actOnBoss,
    claimBossReward,
    handleRealtimeFinish,
  };
}
