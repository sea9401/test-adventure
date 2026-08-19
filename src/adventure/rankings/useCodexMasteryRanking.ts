"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CodexMasteryRankingResponse,
  CodexMasteryRankingRow,
  CodexMasteryRankingScope,
} from "@/adventure/data/v2/codexMasteryRanking";

type EnabledRanking = Extract<
  CodexMasteryRankingResponse,
  { ok: true; enabled: true }
>;

export type CodexMasteryRankingLoadState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: EnabledRanking };

export function codexMasteryRankingRequestUrl(
  scope: CodexMasteryRankingScope,
): string {
  return `/api/rankings/codex-mastery?scope=${encodeURIComponent(scope)}`;
}

export function shouldLoadCodexMasteryRanking(
  active: boolean,
  retained: CodexMasteryRankingLoadState | undefined,
): boolean {
  return active && retained === undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRankingRow(value: unknown): value is CodexMasteryRankingRow {
  if (!isRecord(value)) return false;
  const categoryScores = value.categoryScores;
  const stageCounts = value.stageCounts;
  const numericKeys = [
    "rank",
    "score",
    "totalScore",
    "goldOrHigherCount",
    "sealCount",
    "scoredCategoryCount",
  ];
  if (
    numericKeys.some((key) => !Number.isSafeInteger(value[key])) ||
    typeof value.name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.mine !== "boolean" ||
    !isRecord(categoryScores) ||
    !isRecord(stageCounts)
  ) {
    return false;
  }
  return ["equipment", "fish", "monster", "cooking", "life", "job"]
    .every((key) => Number.isSafeInteger(categoryScores[key])) &&
    ["bronze", "silver", "gold", "platinum", "diamond", "legendary"]
      .every((key) => Number.isSafeInteger(stageCounts[key]));
}

export function parseCodexMasteryRankingResponse(
  value: unknown,
  expectedScope: CodexMasteryRankingScope,
): CodexMasteryRankingLoadState {
  if (!isRecord(value) || value.ok !== true) {
    const message = isRecord(value) && typeof value.error === "string"
      ? value.error
      : "invalid ranking response";
    throw new Error(message);
  }
  if (value.enabled === false) return { status: "disabled" };
  if (
    value.enabled !== true ||
    value.scope !== expectedScope ||
    !Array.isArray(value.list) ||
    !value.list.every(isRankingRow) ||
    !Array.isArray(value.nearby) ||
    !value.nearby.every(isRankingRow) ||
    (value.me !== null && !isRankingRow(value.me))
  ) {
    throw new Error("invalid ranking response");
  }
  return { status: "ready", data: value as EnabledRanking };
}

export function useCodexMasteryRanking(
  active: boolean,
  scope: CodexMasteryRankingScope,
): { state: CodexMasteryRankingLoadState; retry: () => void } {
  const [cache, setCache] = useState<
    Partial<Record<CodexMasteryRankingScope, CodexMasteryRankingLoadState>>
  >({});
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const retained = cache[scope];
    if (!shouldLoadCodexMasteryRanking(active, retained)) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCache((previous) => ({ ...previous, [scope]: { status: "loading" } }));

    void fetch(codexMasteryRankingRequestUrl(scope), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => parseCodexMasteryRankingResponse(value, scope))
      .then((state) => {
        if (controller.signal.aborted) return;
        setCache((previous) => ({ ...previous, [scope]: state }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCache((previous) => ({
          ...previous,
          [scope]: {
            status: "error",
            message: error instanceof Error ? error.message : undefined,
          },
        }));
      });

    return () => {
      controller.abort();
      setCache((previous) => {
        if (previous[scope]?.status !== "loading") return previous;
        const next = { ...previous };
        delete next[scope];
        return next;
      });
    };
    // Cache changes are results of this request, not a reason to restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, retryNonce, scope]);

  const retry = useCallback(() => {
    setCache((previous) => {
      const next = { ...previous };
      delete next[scope];
      return next;
    });
    setRetryNonce((value) => value + 1);
  }, [scope]);

  return {
    state: cache[scope] ?? { status: "loading" },
    retry,
  };
}
