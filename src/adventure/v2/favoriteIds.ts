"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// 화면별 즐겨찾기(별표) id 목록. 기기별 편의 설정이라 브라우저 저장소에 JSON 배열로 둔다.

export function parseFavoriteIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const value of parsed) {
    if (typeof value === "string" && value.length > 0 && !ids.includes(value)) {
      ids.push(value);
    }
  }
  return ids;
}

export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

/** 즐겨찾기를 앞으로 모은다. 각 묶음 안에서는 원래 순서를 지킨다. */
export function favoritesFirst<T>(
  items: readonly T[],
  favoriteIds: ReadonlySet<string>,
  idOf: (item: T) => string,
): readonly T[] {
  if (favoriteIds.size === 0) return items;
  return [
    ...items.filter((item) => favoriteIds.has(idOf(item))),
    ...items.filter((item) => !favoriteIds.has(idOf(item))),
  ];
}

/** 목록 키가 아직 없으면 예전 단일 값 키(legacySingleKey)를 한 칸짜리 목록으로 읽는다. */
export function readStoredFavoriteIds(
  storage: Pick<Storage, "getItem">,
  key: string,
  legacySingleKey?: string,
): string[] {
  const raw = storage.getItem(key);
  if (raw !== null) return parseFavoriteIds(raw);
  const legacy = legacySingleKey ? storage.getItem(legacySingleKey) : null;
  return legacy ? [legacy] : [];
}

export function useStoredFavoriteIds(
  key: string,
  legacySingleKey?: string,
): { favoriteIds: ReadonlySet<string>; toggleFavorite: (id: string) => void } {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = readStoredFavoriteIds(localStorage, key, legacySingleKey);
      if (stored.length > 0) queueMicrotask(() => setIds(stored));
    } catch {
      // ignore storage-disabled browsers
    }
  }, [key, legacySingleKey]);

  const toggleFavorite = useCallback(
    (id: string) => {
      const next = toggleFavoriteId(ids, id);
      setIds(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        if (legacySingleKey) localStorage.removeItem(legacySingleKey);
      } catch {
        // ignore storage-disabled browsers
      }
    },
    [ids, key, legacySingleKey],
  );

  const favoriteIds = useMemo(() => new Set(ids), [ids]);
  return { favoriteIds, toggleFavorite };
}
