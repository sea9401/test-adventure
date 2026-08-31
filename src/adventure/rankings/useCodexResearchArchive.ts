"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseCodexResearchArchiveResponse,
  type CodexResearchArchiveResponse,
  type CodexResearchArchiveSeason,
} from "@/adventure/data/v2/codexResearchArchive";

type ReadyArchive = Extract<
  CodexResearchArchiveResponse,
  { ok: true; enabled: true; status: "ready" }
>;

export type CodexResearchArchiveLoadState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "no_season"; seasons: CodexResearchArchiveSeason[] }
  | { status: "error"; message?: string }
  | { status: "ready"; data: ReadyArchive };

export function codexResearchArchiveRequestUrl(seasonId?: string): string {
  const path = "/api/rankings/codex-research/archive";
  return seasonId ? `${path}?seasonId=${encodeURIComponent(seasonId)}` : path;
}

export function parseCodexResearchArchiveLoadState(
  value: unknown,
): CodexResearchArchiveLoadState {
  const parsed = parseCodexResearchArchiveResponse(value);
  if (!parsed.ok) throw new Error(parsed.error);
  if (!parsed.enabled) return { status: "disabled" };
  if (parsed.status === "no_season") {
    return { status: "no_season", seasons: parsed.seasons };
  }
  return { status: "ready", data: parsed };
}

export function useCodexResearchArchive(active: boolean): {
  state: CodexResearchArchiveLoadState;
  retry: () => void;
  selectSeason: (seasonId: string) => void;
} {
  const [state, setState] = useState<CodexResearchArchiveLoadState>({ status: "loading" });
  const [seasonId, setSeasonId] = useState<string>();
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    void fetch(codexResearchArchiveRequestUrl(seasonId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(parseCodexResearchArchiveLoadState)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: error instanceof Error ? error.message : undefined });
        }
      });
    return () => controller.abort();
  }, [active, retryNonce, seasonId]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const selectSeason = useCallback((next: string) => setSeasonId(next), []);
  return { state, retry, selectSeason };
}
