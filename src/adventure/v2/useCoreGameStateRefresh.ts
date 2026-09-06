"use client";

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { createStateRefreshCoordinator } from "./stateRefreshCoordinator";

export function useCoreGameStateRefresh<T>(
  apply: (snapshot: T) => void,
  resourceRevision: RefObject<number>,
  setLoaded: (loaded: boolean) => void,
) {
  const coordinator = useMemo(() => createStateRefreshCoordinator(
    async () => {
      const revision = resourceRevision.current;
      const response = await fetch("/api/v2/me/state?view=core");
      if (!response.ok) throw new Error("Core state refresh failed");
      return { revision, snapshot: await response.json() as T };
    },
    ({ revision, snapshot }) => {
      // A mutation response is newer than a state read started before it.
      if (revision === resourceRevision.current) apply(snapshot);
    },
  ), [apply, resourceRevision]);

  useEffect(() => () => coordinator.invalidate(), [coordinator]);

  return useCallback(async () => {
    try {
      await coordinator.refresh();
    } catch {
      // Preserve the provider's existing best-effort refresh behavior.
    } finally {
      setLoaded(true);
    }
  }, [coordinator, setLoaded]);
}
