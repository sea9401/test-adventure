"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DANGEROUS_REALTIME_TICK_MS,
  dangerousRealtimeView,
  isDangerousRealtimeBalanceRevision,
  isDangerousRealtimeCheckpoint,
  replayDangerousRealtimeInputs,
  type DangerousRealtimeBalanceRevision,
  type DangerousRealtimeConfig,
  type DangerousRealtimeInput,
  type DangerousRealtimeMode,
  type DangerousRealtimeState,
  type DangerousRealtimeView,
} from "./dangerousFishingRealtime";
import {
  ActivityVerificationRequiredError,
  type ActivityVerificationChallenge,
} from "./useActivityVerification";

const STORAGE_VERSION = 1 as const;
const CHECKPOINT_TICKS = 2_000 / DANGEROUS_REALTIME_TICK_MS;
const LOOP_INTERVAL_MS = DANGEROUS_REALTIME_TICK_MS;
const MAX_AUTOMATIC_REQUESTS = 5;
const MAX_RETRY_DELAY_MS = 8_000;

export type DangerousRealtimeClientTarget =
  | {
      kind: "voyage";
      endpoint: "/api/v2/dangerous-fishing/encounter";
    }
  | {
      kind: "boss";
      endpoint: "/api/v2/dangerous-fishing/boss";
      eventId: string;
    };

export type DangerousRealtimeClientEncounter = {
  simulationVersion: 2;
  balanceRevision: DangerousRealtimeBalanceRevision;
  id: string;
  targetKind: "fish" | "boss";
  targetId: string;
  config: DangerousRealtimeConfig;
  checkpoint: DangerousRealtimeState;
  view?: DangerousRealtimeView;
  approvedTick: number;
  revision: number;
  startedAt: number;
  expiresAt: number;
};

export type DangerousRealtimeConnection =
  | "online"
  | "syncing"
  | "offline"
  | "verification_required"
  | "finished";

export type DangerousRealtimeJsonReader = (
  response: Response,
) => Promise<unknown>;

type PointerInputEvent = {
  pointerId: number;
  preventDefault?: () => void;
  currentTarget?: {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
  };
};

type KeyboardInputEvent = {
  code?: string;
  key?: string;
  repeat?: boolean;
  preventDefault: () => void;
};

type TranscriptEntry = DangerousRealtimeInput & { sequence: number };

type StoredRealtimeSession = {
  version: typeof STORAGE_VERSION;
  encounterId: string;
  server: {
    revision: number;
    approvedTick: number;
    checkpoint: DangerousRealtimeState;
  };
  inputs: TranscriptEntry[];
  nextSequence: number;
  finishRequestId: string | null;
  savedAt: number;
};

export type UseDangerousFishingRealtimeOptions = {
  encounter: DangerousRealtimeClientEncounter;
  target: DangerousRealtimeClientTarget;
  readJson: DangerousRealtimeJsonReader;
  verification: ActivityVerificationChallenge | null;
  onFinish?: (response: Record<string, unknown>) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRealtimeState(value: unknown): value is DangerousRealtimeState {
  if (!isRecord(value)) return false;
  const numericFields = [
    "tick",
    "tension",
    "maxTension",
    "stamina",
    "maxStamina",
    "distance",
    "startDistance",
    "lowTensionTicks",
    "behaviorCursor",
    "phaseTicksRemaining",
    "chainRemaining",
    "rngState",
    "targetTicks",
    "maxTicks",
    "performanceScalePermille",
  ] as const;
  return (
    numericFields.every((field) => isFiniteInteger(value[field])) &&
    (value.mode === "reel" || value.mode === "release") &&
    ["active", "caught", "line_broken", "hook_lost", "timeout"].includes(
      String(value.status),
    ) &&
    ["charge", "thrash", "turn", "dive"].includes(String(value.behavior)) &&
    ["charge", "thrash", "turn", "dive"].includes(
      String(value.nextBehavior),
    ) &&
    ["idle", "telegraph", "active"].includes(String(value.phase))
  );
}

function parseStoredSession(
  raw: string | null,
  encounter: DangerousRealtimeClientEncounter,
): StoredRealtimeSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== STORAGE_VERSION) return null;
    if (value.encounterId !== encounter.id || !isRecord(value.server)) {
      return null;
    }
    const { server } = value;
    if (
      !isFiniteInteger(server.revision) ||
      server.revision < 0 ||
      !isFiniteInteger(server.approvedTick) ||
      server.approvedTick < 0 ||
      !isRealtimeState(server.checkpoint) ||
      !isDangerousRealtimeCheckpoint(
        server.checkpoint,
        encounter.config,
        encounter.balanceRevision,
      ) ||
      server.approvedTick !== server.checkpoint.tick ||
      !Array.isArray(value.inputs) ||
      !isFiniteInteger(value.nextSequence) ||
      value.nextSequence < 0 ||
      (value.finishRequestId !== null &&
        (typeof value.finishRequestId !== "string" ||
          value.finishRequestId.length === 0 ||
          value.finishRequestId.length > 128)) ||
      !isFiniteInteger(value.savedAt) ||
      value.savedAt < 0
    ) {
      return null;
    }
    let previousTick = server.approvedTick - 1;
    let previousSequence = -1;
    const inputs: TranscriptEntry[] = [];
    for (const rawInput of value.inputs) {
      if (
        !isRecord(rawInput) ||
        !isFiniteInteger(rawInput.tick) ||
        rawInput.tick < server.approvedTick ||
        rawInput.tick > encounter.config.maxTicks ||
        rawInput.tick <= previousTick ||
        (rawInput.mode !== "reel" && rawInput.mode !== "release") ||
        !isFiniteInteger(rawInput.sequence) ||
        rawInput.sequence <= previousSequence
      ) {
        return null;
      }
      inputs.push({
        tick: rawInput.tick,
        mode: rawInput.mode,
        sequence: rawInput.sequence,
      });
      previousTick = rawInput.tick;
      previousSequence = rawInput.sequence;
    }
    if (previousSequence >= value.nextSequence) return null;
    return {
      version: STORAGE_VERSION,
      encounterId: encounter.id,
      server: {
        revision: server.revision,
        approvedTick: server.approvedTick,
        checkpoint: server.checkpoint,
      },
      inputs,
      nextSequence: value.nextSequence,
      finishRequestId: value.finishRequestId,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

function isClientEncounter(
  value: unknown,
  expectedId: string,
): value is DangerousRealtimeClientEncounter {
  if (!isRecord(value) || value.simulationVersion !== 2) return false;
  return (
    value.id === expectedId &&
    isDangerousRealtimeBalanceRevision(value.balanceRevision) &&
    isRecord(value.config) &&
    isRealtimeState(value.checkpoint) &&
    isFiniteInteger(value.approvedTick) &&
    isFiniteInteger(value.revision) &&
    isFiniteInteger(value.startedAt) &&
    isFiniteInteger(value.expiresAt)
  );
}

function retryDelay(attempt: number): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    500 * 2 ** Math.max(0, Math.min(8, attempt - 1)),
  );
}

function requestIdFor(encounterId: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${encounterId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function warningFor(view: DangerousRealtimeView): string | null {
  if (view.status === "line_broken") return "낚싯줄이 끊어졌습니다.";
  if (view.status === "hook_lost") return "바늘이 빠졌습니다.";
  if (view.status === "timeout") return "제한 시간이 끝났습니다.";
  if (view.status === "caught") return null;
  if (view.tension >= view.safeTensionMax) {
    return "장력이 너무 높습니다. 줄을 놓으세요.";
  }
  if (view.tension < view.safeTensionMin) {
    return "장력이 너무 낮습니다. 감아올리세요.";
  }
  return null;
}

export function dangerousFishingRealtimeStorageKey(encounterId: string) {
  return `dangerous-fishing.realtime.v2:${encounterId}`;
}

export function useDangerousFishingRealtime({
  encounter,
  target,
  readJson,
  verification,
  onFinish,
}: UseDangerousFishingRealtimeOptions) {
  const balanceRevision = encounter.balanceRevision;
  const [view, setView] = useState(() =>
    dangerousRealtimeView(encounter.checkpoint, encounter.config),
  );
  const [holding, setHolding] = useState(false);
  const [connection, setConnection] =
    useState<DangerousRealtimeConnection>("online");
  const serverRef = useRef(encounter);
  const stateRef = useRef(encounter.checkpoint);
  const inputsRef = useRef<TranscriptEntry[]>([]);
  const nextSequenceRef = useRef(0);
  const finishRequestIdRef = useRef<string | null>(null);
  const inputSourcesRef = useRef({ pointer: false, keyboard: false });
  const hiddenRef = useRef(false);
  const mountedRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const controllersRef = useRef(new Set<AbortController>());
  const retryAttemptsRef = useRef(0);
  const retryAtRef = useRef(0);
  const automaticRetryBlockedRef = useRef(false);
  const verificationBlockedRef = useRef(verification !== null);
  const finishDeliveredRef = useRef(false);
  const highTensionVibratedRef = useRef(
    view.tension >= view.safeTensionMax,
  );
  const lineBreakVibratedRef = useRef(view.status === "line_broken");
  const readJsonRef = useRef(readJson);
  const onFinishRef = useRef(onFinish);
  const targetRef = useRef(target);

  useEffect(() => {
    readJsonRef.current = readJson;
    onFinishRef.current = onFinish;
    targetRef.current = target;
  }, [onFinish, readJson, target]);

  const desiredMode = useCallback((): DangerousRealtimeMode => {
    const sources = inputSourcesRef.current;
    return sources.pointer || sources.keyboard ? "reel" : "release";
  }, []);

  const persist = useCallback(() => {
    if (typeof window === "undefined") return;
    if (finishDeliveredRef.current) {
      try {
        window.sessionStorage.removeItem(
          dangerousFishingRealtimeStorageKey(encounter.id),
        );
      } catch {
        // Ignore unavailable recovery storage after completion.
      }
      return;
    }
    const currentServer = serverRef.current;
    const stored: StoredRealtimeSession = {
      version: STORAGE_VERSION,
      encounterId: encounter.id,
      server: {
        revision: currentServer.revision,
        approvedTick: currentServer.approvedTick,
        checkpoint: currentServer.checkpoint,
      },
      inputs: inputsRef.current,
      nextSequence: nextSequenceRef.current,
      finishRequestId: finishRequestIdRef.current,
      savedAt: Date.now(),
    };
    try {
      window.sessionStorage.setItem(
        dangerousFishingRealtimeStorageKey(encounter.id),
        JSON.stringify(stored),
      );
    } catch {
      // Storage is a recovery aid; simulation and network replay remain usable.
    }
  }, [encounter.id]);
  const vibrate = useCallback((pattern: number | number[]) => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  }, []);

  const publish = useCallback(
    (state: DangerousRealtimeState) => {
      stateRef.current = state;
      const nextView = dangerousRealtimeView(state, encounter.config);
      const highTension = nextView.tension >= nextView.safeTensionMax;
      if (highTension && !highTensionVibratedRef.current) {
        highTensionVibratedRef.current = true;
        vibrate(35);
      }
      if (
        nextView.status === "line_broken" &&
        !lineBreakVibratedRef.current
      ) {
        lineBreakVibratedRef.current = true;
        vibrate([80, 40, 120]);
      }
      if (mountedRef.current) setView(nextView);
    },
    [encounter.config, vibrate],
  );

  const replayLocal = useCallback(
    (targetTick: number): DangerousRealtimeState => {
      const currentServer = serverRef.current;
      const boundedTick = Math.max(
        currentServer.checkpoint.tick,
        Math.min(encounter.config.maxTicks, Math.floor(targetTick)),
      );
      const inputs = inputsRef.current
        .filter(
          (input) =>
            input.tick >= currentServer.checkpoint.tick &&
            input.tick <= boundedTick,
        )
        .map(({ tick, mode }) => ({ tick, mode }));
      return replayDangerousRealtimeInputs(
        encounter.config,
        inputs,
        boundedTick,
        currentServer.checkpoint,
        balanceRevision,
      );
    },
    [balanceRevision, encounter.config],
  );

  const appendMode = useCallback(
    (mode: DangerousRealtimeMode, publishVisible = true) => {
      const current = stateRef.current;
      if (current.status !== "active" || current.mode === mode) return;
      const last = inputsRef.current.at(-1);
      if (last?.tick === current.tick) {
        inputsRef.current = [
          ...inputsRef.current.slice(0, -1),
          { tick: last.tick, mode, sequence: nextSequenceRef.current++ },
        ];
      } else {
        inputsRef.current = [
          ...inputsRef.current,
          {
            tick: current.tick,
            mode,
            sequence: nextSequenceRef.current++,
          },
        ];
      }
      const next = replayLocal(current.tick);
      if (publishVisible) publish(next);
      else stateRef.current = next;
      persist();
    },
    [persist, publish, replayLocal],
  );

  const releaseAll = useCallback(
    (publishVisible = true) => {
      inputSourcesRef.current = { pointer: false, keyboard: false };
      if (publishVisible && mountedRef.current) setHolding(false);
      appendMode("release", publishVisible);
    },
    [appendMode],
  );

  const wallTickAt = useCallback(
    (now: number) =>
      Math.min(
        encounter.config.maxTicks,
        Math.max(
          serverRef.current.checkpoint.tick,
          Math.floor(
            (Math.min(now, encounter.expiresAt) - encounter.startedAt) /
              DANGEROUS_REALTIME_TICK_MS,
          ),
        ),
      ),
    [encounter.config.maxTicks, encounter.expiresAt, encounter.startedAt],
  );

  const advanceToNow = useCallback(
    (now: number) => {
      const targetTick = wallTickAt(now);
      if (targetTick <= stateRef.current.tick) return;
      try {
        publish(replayLocal(targetTick));
        if (targetTick % 5 === 0 || stateRef.current.status !== "active") {
          persist();
        }
      } catch {
        inputsRef.current = [];
        publish(serverRef.current.checkpoint);
        persist();
      }
    },
    [persist, publish, replayLocal, wallTickAt],
  );

  const reconcile = useCallback(
    (
      authoritative: DangerousRealtimeClientEncounter,
      sentSequences: ReadonlySet<number> | null,
    ) => {
      serverRef.current = {
        ...authoritative,
      };
      inputsRef.current = inputsRef.current.filter(
        (input) =>
          input.tick >= authoritative.checkpoint.tick &&
          !(sentSequences?.has(input.sequence) ?? false),
      );
      try {
        let next = replayLocal(
          Math.max(stateRef.current.tick, wallTickAt(Date.now())),
        );
        stateRef.current = next;
        const desired = desiredMode();
        if (next.status === "active" && next.mode !== desired) {
          appendMode(desired, false);
          next = stateRef.current;
        }
        publish(next);
      } catch {
        inputsRef.current = [];
        publish(authoritative.checkpoint);
      }
      persist();
    },
    [appendMode, desiredMode, persist, publish, replayLocal, wallTickAt],
  );

  const complete = useCallback((json: Record<string, unknown>) => {
    if (finishDeliveredRef.current) return;
    finishDeliveredRef.current = true;
    setConnection("finished");
    try {
      window.sessionStorage.removeItem(
        dangerousFishingRealtimeStorageKey(encounter.id),
      );
    } catch {
      // Ignore unavailable storage after the server accepted completion.
    }
    onFinishRef.current?.(json);
  }, [encounter.id]);

  const maybeSync = useCallback(
    (now: number, manual = false) => {
      if (!mountedRef.current || activeControllerRef.current !== null) return;
      if (verificationBlockedRef.current) return;
      const state = stateRef.current;
      const finishing = state.status !== "active";
      if (finishDeliveredRef.current) return;
      if (
        !finishing &&
        state.tick - serverRef.current.approvedTick < CHECKPOINT_TICKS
      ) {
        return;
      }
      if (!manual) {
        if (automaticRetryBlockedRef.current || now < retryAtRef.current) return;
      } else if (!finishing) {
        return;
      }
      if (finishing && !finishRequestIdRef.current) {
        finishRequestIdRef.current = requestIdFor(encounter.id);
        persist();
      }

      const currentServer = serverRef.current;
      const clientTick = state.tick;
      const entries = inputsRef.current.filter(
        (input) =>
          input.tick >= currentServer.checkpoint.tick &&
          input.tick <= clientTick,
      );
      const sentSequences = new Set(entries.map((input) => input.sequence));
      const body: Record<string, unknown> = {
        action: finishing ? "finish" : "checkpoint",
        encounterId: encounter.id,
        revision: currentServer.revision,
        inputs: entries.map(({ tick, mode }) => ({ tick, mode })),
        clientTick,
      };
      const currentTarget = targetRef.current;
      if (currentTarget.kind === "boss") body.eventId = currentTarget.eventId;
      if (finishing) body.requestId = finishRequestIdRef.current;

      const controller = new AbortController();
      controllersRef.current.add(controller);
      activeControllerRef.current = controller;
      setConnection("syncing");
      void fetch(currentTarget.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (response) => {
          const raw = await readJsonRef.current(response);
          const json = isRecord(raw) ? raw : {};
          if (!mountedRef.current || controller.signal.aborted) return;
          if (
            json.error === "stale" &&
            isClientEncounter(json.encounter, encounter.id)
          ) {
            retryAttemptsRef.current = 0;
            retryAtRef.current = 0;
            automaticRetryBlockedRef.current = false;
            setConnection("online");
            reconcile(json.encounter, null);
            return;
          }
          if (!response.ok || json.ok !== true) {
            throw new Error(
              typeof json.error === "string" ? json.error : "network",
            );
          }
          retryAttemptsRef.current = 0;
          retryAtRef.current = 0;
          automaticRetryBlockedRef.current = false;
          if (finishing) {
            complete(json);
            return;
          }
          if (!isClientEncounter(json.encounter, encounter.id)) {
            throw new Error("invalid_checkpoint_response");
          }
          setConnection("online");
          reconcile(json.encounter, sentSequences);
        })
        .catch((caught: unknown) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          if (caught instanceof ActivityVerificationRequiredError) {
            releaseAll();
            verificationBlockedRef.current = true;
            setConnection("verification_required");
            persist();
            return;
          }
          retryAttemptsRef.current += 1;
          retryAtRef.current =
            Date.now() + retryDelay(retryAttemptsRef.current);
          automaticRetryBlockedRef.current =
            retryAttemptsRef.current >= MAX_AUTOMATIC_REQUESTS;
          setConnection("offline");
          persist();
        })
        .finally(() => {
          controllersRef.current.delete(controller);
          if (activeControllerRef.current === controller) {
            activeControllerRef.current = null;
          }
        });
    },
    [complete, encounter.id, persist, reconcile, releaseAll],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    serverRef.current = encounter;
    stateRef.current = encounter.checkpoint;
    inputsRef.current = [];
    nextSequenceRef.current = 0;
    finishRequestIdRef.current = null;
    inputSourcesRef.current = { pointer: false, keyboard: false };
    activeControllerRef.current = null;
    retryAttemptsRef.current = 0;
    retryAtRef.current = 0;
    automaticRetryBlockedRef.current = false;
    verificationBlockedRef.current = verification !== null;
    finishDeliveredRef.current = false;
    // Encounter identity is the reset boundary for every visible and ref state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHolding(false);
    setConnection("online");
    const storageKey = dangerousFishingRealtimeStorageKey(encounter.id);
    const raw = window.sessionStorage.getItem(storageKey);
    const parsedStored = parseStoredSession(raw, encounter);
    const stored =
      parsedStored && parsedStored.server.revision >= encounter.revision
        ? parsedStored
        : null;
    if (raw && !stored) window.sessionStorage.removeItem(storageKey);
    if (stored) {
      const storedServer = {
        ...encounter,
        revision: stored.server.revision,
        approvedTick: stored.server.approvedTick,
        checkpoint: stored.server.checkpoint,
      };
      serverRef.current = storedServer;
      inputsRef.current = stored.inputs;
      nextSequenceRef.current = stored.nextSequence;
      finishRequestIdRef.current = stored.finishRequestId;
      try {
        stateRef.current = replayLocal(wallTickAt(Date.now()));
      } catch {
        serverRef.current = encounter;
        inputsRef.current = [];
        finishRequestIdRef.current = null;
        stateRef.current = encounter.checkpoint;
      }
    } else {
      serverRef.current = encounter;
      stateRef.current = encounter.checkpoint;
    }
    highTensionVibratedRef.current =
      stateRef.current.tension >=
      dangerousRealtimeView(stateRef.current, encounter.config).safeTensionMax;
    lineBreakVibratedRef.current =
      stateRef.current.status === "line_broken";
    setView(dangerousRealtimeView(stateRef.current, encounter.config));
    persist();

    const handleBlur = () => releaseAll();
    const handleVisibility = () => {
      hiddenRef.current = document.visibilityState === "hidden";
      if (hiddenRef.current) {
        releaseAll();
      } else {
        advanceToNow(Date.now());
        maybeSync(Date.now());
      }
    };
    const handleOnline = () => {
      retryAttemptsRef.current = 0;
      retryAtRef.current = 0;
      automaticRetryBlockedRef.current = false;
      maybeSync(Date.now());
    };
    hiddenRef.current = document.visibilityState === "hidden";
    window.addEventListener("blur", handleBlur);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(() => {
      if (hiddenRef.current) return;
      const now = Date.now();
      advanceToNow(now);
      maybeSync(now);
    }, LOOP_INTERVAL_MS);

    return () => {
      releaseAll(false);
      persist();
      mountedRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      for (const controller of controllers) controller.abort();
      controllers.clear();
      activeControllerRef.current = null;
    };
    // The server may refresh the same encounter object every 10 seconds. Its
    // fixed config is immutable for an encounter ID, so restarting here would
    // incorrectly release a held input and tear down an in-flight checkpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.id]);

  useEffect(() => {
    if (verification !== null) {
      releaseAll();
      verificationBlockedRef.current = true;
      // Mirror the external activity-reader challenge in panel-visible state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnection("verification_required");
      return;
    }
    if (!verificationBlockedRef.current) return;
    verificationBlockedRef.current = false;
    retryAttemptsRef.current = 0;
    retryAtRef.current = 0;
    automaticRetryBlockedRef.current = false;
    setConnection("online");
    maybeSync(Date.now());
  }, [maybeSync, releaseAll, verification]);

  const onPointerDown = useCallback(
    (event: PointerInputEvent) => {
      event.preventDefault?.();
      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may disappear if the control is removed mid-press.
      }
      inputSourcesRef.current.pointer = true;
      setHolding(true);
      appendMode("reel");
    },
    [appendMode],
  );

  const onPointerUp = useCallback(
    (event: PointerInputEvent) => {
      event.preventDefault?.();
      try {
        if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // A cancel can release capture before React delivers the handler.
      }
      inputSourcesRef.current.pointer = false;
      const nextHolding = inputSourcesRef.current.keyboard;
      setHolding(nextHolding);
      appendMode(nextHolding ? "reel" : "release");
    },
    [appendMode],
  );

  const onKeyDown = useCallback(
    (event: KeyboardInputEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      if (event.repeat || inputSourcesRef.current.keyboard) return;
      inputSourcesRef.current.keyboard = true;
      setHolding(true);
      appendMode("reel");
    },
    [appendMode],
  );

  const onKeyUp = useCallback(
    (event: KeyboardInputEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      inputSourcesRef.current.keyboard = false;
      const nextHolding = inputSourcesRef.current.pointer;
      setHolding(nextHolding);
      appendMode(nextHolding ? "reel" : "release");
    },
    [appendMode],
  );

  const retryFinish = useCallback(() => {
    if (stateRef.current.status === "active") return;
    retryAttemptsRef.current = 0;
    retryAtRef.current = 0;
    automaticRetryBlockedRef.current = false;
    maybeSync(Date.now(), true);
  }, [maybeSync]);

  return {
    view,
    holding,
    warning: warningFor(view),
    connection,
    onPointerDown,
    onPointerUp,
    onKeyDown,
    onKeyUp,
    retryFinish,
  };
}
