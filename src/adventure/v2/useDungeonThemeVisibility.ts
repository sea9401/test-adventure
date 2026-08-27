"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
  normalizeHiddenThemeStarts,
  parseHiddenThemeStarts,
} from "./dungeonThemeVisibility";

const SETTINGS_ENDPOINT = "/api/v2/me/dungeon-visibility-settings";

function readLocalHiddenThemeStarts(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    return parseHiddenThemeStarts(
      localStorage.getItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY),
    );
  } catch {
    return new Set();
  }
}

function writeLocalHiddenThemeStarts(values: readonly number[]): void {
  try {
    if (values.length === 0) {
      localStorage.removeItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY);
    } else {
      localStorage.setItem(
        DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
        JSON.stringify(values),
      );
    }
  } catch {}
}

async function persistHiddenThemeStarts(values: readonly number[]) {
  await fetch(SETTINGS_ENDPOINT, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hiddenThemeStarts: values }),
  }).catch(() => undefined);
}

export function useDungeonThemeVisibility() {
  const [hiddenThemeStarts, setHiddenThemeStartsState] = useState<Set<number>>(
    () => new Set(),
  );
  const currentRef = useRef<Set<number>>(new Set());
  const updatedLocallyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const local = readLocalHiddenThemeStarts();
    currentRef.current = local;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 클라이언트 하이드레이션
    setHiddenThemeStartsState(local);

    void fetch(SETTINGS_ENDPOINT, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { hiddenThemeStarts?: unknown };
      })
      .then((payload) => {
        if (cancelled || payload == null) return;
        if (payload.hiddenThemeStarts == null) {
          if (!updatedLocallyRef.current) {
            void persistHiddenThemeStarts([...currentRef.current]);
          }
          return;
        }
        if (updatedLocallyRef.current) return;
        const normalized = normalizeHiddenThemeStarts(
          payload.hiddenThemeStarts,
        );
        const next = new Set(normalized);
        currentRef.current = next;
        writeLocalHiddenThemeStarts(normalized);
        setHiddenThemeStartsState(next);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const setHiddenThemeStarts = useCallback((next: Set<number>) => {
    const normalized = normalizeHiddenThemeStarts([...next]);
    const normalizedSet = new Set(normalized);
    updatedLocallyRef.current = true;
    currentRef.current = normalizedSet;
    writeLocalHiddenThemeStarts(normalized);
    setHiddenThemeStartsState(normalizedSet);
    void persistHiddenThemeStarts(normalized);
  }, []);

  return { hiddenThemeStarts, setHiddenThemeStarts };
}
