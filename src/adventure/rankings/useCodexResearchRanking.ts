"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CodexResearchRankingResponse,
  CodexResearchRankingRow,
} from "@/adventure/data/v2/codexResearchRanking";

type ActiveRanking = Extract<
  CodexResearchRankingResponse,
  { ok: true; enabled: true; status: "active" }
>;

export type CodexResearchRankingLoadState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "no_season" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: ActiveRanking };

export function codexResearchRankingRequestUrl(): string {
  return "/api/rankings/codex-research";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isRankingRow(value: unknown): value is CodexResearchRankingRow {
  if (!isRecord(value)) return false;
  const objectiveScore = Number(value.score) -
    Number(value.diversityScore) - Number(value.recordScore);
  return integerBetween(value.rank, 1, Number.MAX_SAFE_INTEGER) &&
    typeof value.name === "string" && value.name.trim() !== "" &&
    typeof value.avatar === "string" &&
    integerBetween(value.score, 1, 20_000) &&
    integerBetween(value.objectiveCompletedCount, 0, 18) &&
    integerBetween(value.objectiveScore, 0, 12_000) &&
    value.objectiveScore === objectiveScore &&
    integerBetween(value.diversityScore, 0, 5_000) &&
    integerBetween(value.recordScore, 0, 3_000) &&
    (value.provisionalTier === null || [
      "bronze", "silver", "gold", "platinum", "diamond", "legendary",
    ].includes(String(value.provisionalTier))) &&
    typeof value.mine === "boolean" &&
    (value.profileBorder === null || typeof value.profileBorder === "string") &&
    (value.chatNameEffect === null || typeof value.chatNameEffect === "string");
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseCodexResearchRankingResponse(
  value: unknown,
): CodexResearchRankingLoadState {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(
      isRecord(value) && typeof value.error === "string"
        ? value.error
        : "invalid monthly ranking response",
    );
  }
  if (value.enabled === false) return { status: "disabled" };
  if (value.enabled !== true) throw new Error("invalid monthly ranking response");
  if (value.status === "no_season") return { status: "no_season" };
  if (
    value.status !== "active" ||
    typeof value.seasonId !== "string" ||
    typeof value.themeId !== "string" ||
    typeof value.themeName !== "string" ||
    !validIso(value.startAt) || !validIso(value.endAt) ||
    !Array.isArray(value.list) || !value.list.every(isRankingRow) ||
    !Array.isArray(value.nearby) || !value.nearby.every(isRankingRow) ||
    (value.me !== null && !isRankingRow(value.me))
  ) {
    throw new Error("invalid monthly ranking response");
  }
  return { status: "ready", data: value as ActiveRanking };
}

export function useCodexResearchRanking(active: boolean): {
  state: CodexResearchRankingLoadState;
  retry: () => void;
} {
  const [state, setState] = useState<CodexResearchRankingLoadState>({
    status: "loading",
  });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    void fetch(codexResearchRankingRequestUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(parseCodexResearchRankingResponse)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : undefined,
        });
      });
    return () => controller.abort();
  }, [active, retryNonce]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  return { state, retry };
}
