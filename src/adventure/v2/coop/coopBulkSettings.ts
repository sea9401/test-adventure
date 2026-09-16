import type { CoopVisibility } from "@/adventure/data/v2/coopBosses";

export type CoopBulkSettings = {
  allowFreeSupport?: boolean;
  visibility?: CoopVisibility;
};

type ManagedSession = {
  id: string;
  isOwner: boolean;
  hp: number;
  expiresAt: number;
  visibility: CoopVisibility;
};

export function ownActiveCoopSessions<T extends ManagedSession>(sessions: T[], now = Date.now()): T[] {
  return sessions.filter((s) => s.isOwner && s.hp > 0 && s.expiresAt > now);
}

// 개별 API의 소유권·세션 잠금·전체 공개 알림 정책을 재사용한다.
// 두 설정은 독립적으로 적용하며 일부 실패해도 나머지 보스 처리를 계속한다.
export async function applyCoopBulkSettings(sessions: ManagedSession[], settings: CoopBulkSettings) {
  const result = { applied: 0, skipped: 0, failed: 0, guildFallback: 0 };
  for (const session of ownActiveCoopSessions(sessions)) {
    const changes: { path: "support" | "visibility"; body: CoopBulkSettings }[] = [];
    if (settings.allowFreeSupport !== undefined) {
      changes.push({ path: "support", body: { allowFreeSupport: settings.allowFreeSupport } });
    }
    if (settings.visibility !== undefined) {
      if (session.visibility === "public" && settings.visibility !== "public") result.skipped++;
      else changes.push({ path: "visibility", body: { visibility: settings.visibility } });
    }
    for (const change of changes) {
      try {
        const response = await fetch(`/api/v2/coop/${encodeURIComponent(session.id)}/${change.path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(change.body),
        });
        const body = await response.json() as { ok?: boolean; error?: string; visibility?: CoopVisibility };
        if (response.ok && body.ok) {
          result.applied++;
          if (change.body.visibility === "guild_only" && body.visibility === "summoner_only") result.guildFallback++;
        } else if (body.error === "not_active" || body.error === "visibility_locked" || body.error === "no_session") {
          result.skipped++;
        } else result.failed++;
      } catch {
        result.failed++;
      }
    }
  }
  return result;
}
