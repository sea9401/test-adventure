"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { DangerousFishingBossViewModel } from "./DangerousFishingBossPanel";
import {
  ActivityVerificationRequiredError,
  useActivityVerification,
} from "./useActivityVerification";

export type DangerousFishingClientVoyage = Omit<
  DangerousFishingVoyage,
  "encounter"
> & {
  encounter: DangerousEncounterView | null;
};

export type DangerousFishingClientState = Omit<
  DangerousFishingState,
  "voyage" | "bossAttempt"
> & {
  voyage: DangerousFishingClientVoyage | null;
  bossAttempt: {
    eventId: string;
    encounter: DangerousEncounterView;
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

export function useDangerousFishing() {
  const { verification, verifyHuman, readJson } =
    useActivityVerification("fishing");
  const [model, setModel] = useState<DangerousFishingViewModel | null>(null);
  const [boss, setBoss] = useState<DangerousFishingBossViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DangerousFishingBusy>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusJson, bossJson] = await Promise.all([
        apiJson("/api/v2/dangerous-fishing/status", readJson),
        apiJson("/api/v2/dangerous-fishing/boss", readJson),
      ]);
      setModel(statusJson as unknown as DangerousFishingViewModel);
      setBoss(bossJson as unknown as DangerousFishingBossViewModel);
      setError(null);
      return true;
    } catch (caught) {
      if (!(caught instanceof ActivityVerificationRequiredError)) {
        setError(errorCode(caught));
      }
      return false;
    } finally {
      setLoading(false);
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
    ) => {
      if (busy) return false;
      setBusy(kind);
      setError(null);
      try {
        await apiJson(
          endpoint,
          readJson,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
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
    (zoneId: DangerousZoneId, depthId: DangerousDepthId) =>
      mutate("voyage", "/api/v2/dangerous-fishing/voyage", {
        action: "start",
        zoneId,
        depthId,
      }),
    [mutate],
  );
  const returnVoyage = useCallback(
    () =>
      mutate("return", "/api/v2/dangerous-fishing/voyage", {
        action: "return",
      }),
    [mutate],
  );
  const startEncounter = useCallback(
    (baitId: DangerousBaitId) =>
      mutate("encounter", "/api/v2/dangerous-fishing/encounter", {
        action: "start",
        baitId,
      }),
    [mutate],
  );
  const act = useCallback(
    (action: DangerousFishingAction, encounterId: string, revision: number) =>
      mutate("action", "/api/v2/dangerous-fishing/encounter", {
        action,
        encounterId,
        revision,
      }),
    [mutate],
  );
  const startBossAttempt = useCallback(
    (eventId: string) =>
      mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action: "start",
        eventId,
      }),
    [mutate],
  );
  const actOnBoss = useCallback(
    (
      action: DangerousFishingAction,
      eventId: string,
      encounterId: string,
      revision: number,
    ) =>
      mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action,
        eventId,
        encounterId,
        revision,
      }),
    [mutate],
  );
  const claimBossReward = useCallback(
    (eventId: string) =>
      mutate("boss", "/api/v2/dangerous-fishing/boss", {
        action: "claim",
        eventId,
      }),
    [mutate],
  );

  return {
    model,
    boss,
    loading,
    busy,
    error,
    verification,
    verifyHuman,
    refresh,
    startVoyage,
    returnVoyage,
    startEncounter,
    act,
    startBossAttempt,
    actOnBoss,
    claimBossReward,
  };
}
