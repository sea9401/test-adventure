"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  activitySummary,
  activityTabDots,
  type AdventureDashboardSnapshot,
  type AdventureHomePreferences,
} from "./adventureDashboard";

type AdventureDashboardContextValue = {
  snapshot: AdventureDashboardSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatePreferences: (
    patch: Partial<AdventureHomePreferences>,
  ) => Promise<void>;
};

const AdventureDashboardContext =
  createContext<AdventureDashboardContextValue | null>(null);

function withPreferences(
  snapshot: AdventureDashboardSnapshot,
  preferences: AdventureHomePreferences,
): AdventureDashboardSnapshot {
  const activities = snapshot.activities.map((activity) => ({
    ...activity,
    enabled:
      preferences.activityEnabled[activity.id] ?? activity.defaultEnabled,
  }));
  return {
    ...snapshot,
    preferences,
    activities,
    summary: activitySummary(activities),
    notifications: activityTabDots(
      activities,
      preferences.activityNotificationsEnabled,
    ),
  };
}

export function AdventureDashboardProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<AdventureDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const requestRef = useRef<Promise<void> | null>(null);
  const preferenceMutationRef = useRef(0);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const refresh = useCallback(async () => {
    if (requestRef.current) return requestRef.current;
    const request = (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/v2/adventure-dashboard", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("dashboard_load_failed");
        const json = (await response.json()) as AdventureDashboardSnapshot & {
          ok?: boolean;
        };
        setSnapshot({
          serverNow: json.serverNow,
          preferences: json.preferences,
          activities: json.activities,
          summary: json.summary,
          notifications: json.notifications,
        });
        setError(null);
      } catch {
        setError("활동 상태를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
        requestRef.current = null;
      }
    })();
    requestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!snapshot) return;
    const nextReadyAt = snapshot.activities
      .filter(
        (activity) =>
          activity.enabled &&
          activity.state === "in_progress" &&
          activity.readyAt != null &&
          activity.readyAt > snapshot.serverNow,
      )
      .reduce<number | null>(
        (earliest, activity) =>
          earliest == null
            ? activity.readyAt!
            : Math.min(earliest, activity.readyAt!),
        null,
      );
    if (nextReadyAt == null) return;
    const timeout = window.setTimeout(
      () => void refresh(),
      Math.max(250, nextReadyAt - snapshot.serverNow + 250),
    );
    return () => window.clearTimeout(timeout);
  }, [refresh, snapshot]);

  const updatePreferences = useCallback(
    async (patch: Partial<AdventureHomePreferences>) => {
      const previous = snapshotRef.current;
      if (!previous) throw new Error("dashboard_not_ready");
      const mutationId = ++preferenceMutationRef.current;
      const nextPreferences: AdventureHomePreferences = {
        ...previous.preferences,
        ...patch,
      };
      const optimistic = withPreferences(previous, nextPreferences);
      setSnapshot(optimistic);
      snapshotRef.current = optimistic;
      try {
        const response = await fetch(
          "/api/v2/adventure-dashboard/preferences",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(nextPreferences),
          },
        );
        if (!response.ok) throw new Error("preference_save_failed");
        const json = (await response.json()) as {
          preferences: AdventureHomePreferences;
        };
        if (preferenceMutationRef.current === mutationId) {
          const confirmed = withPreferences(optimistic, json.preferences);
          setSnapshot(confirmed);
          snapshotRef.current = confirmed;
        }
      } catch (cause) {
        if (preferenceMutationRef.current === mutationId) {
          setSnapshot(previous);
          snapshotRef.current = previous;
        }
        throw cause instanceof Error
          ? cause
          : new Error("preference_save_failed");
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ snapshot, loading, error, refresh, updatePreferences }),
    [snapshot, loading, error, refresh, updatePreferences],
  );
  return (
    <AdventureDashboardContext.Provider value={value}>
      {children}
    </AdventureDashboardContext.Provider>
  );
}

export function useAdventureDashboard(): AdventureDashboardContextValue {
  const value = useContext(AdventureDashboardContext);
  if (!value) {
    throw new Error("useAdventureDashboard must be used inside AdventureDashboardProvider");
  }
  return value;
}
