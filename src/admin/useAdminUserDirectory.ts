"use client";

import { useEffect, useMemo, useState } from "react";

export type AdminUserIdentity = {
  id: string;
  gameName: string | null;
  email: string | null;
};

export function useAdminUserDirectory(
  rawUserIds: readonly (string | null | undefined)[],
): Record<string, AdminUserIdentity> {
  const key = useMemo(
    () =>
      [...new Set(rawUserIds.filter((id): id is string => Boolean(id)))]
        .sort()
        .slice(0, 200)
        .join("\n"),
    [rawUserIds],
  );
  const [directory, setDirectory] = useState<Record<string, AdminUserIdentity>>({});

  useEffect(() => {
    const userIds = key ? key.split("\n") : [];
    if (userIds.length === 0) return;
    const controller = new AbortController();
    void fetch("/api/admin/users/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ users?: AdminUserIdentity[] }>;
      })
      .then((data) => {
        const next: Record<string, AdminUserIdentity> = {};
        for (const user of data.users ?? []) next[user.id] = user;
        setDirectory(next);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDirectory({});
        }
      });
    return () => controller.abort();
  }, [key]);

  return directory;
}
