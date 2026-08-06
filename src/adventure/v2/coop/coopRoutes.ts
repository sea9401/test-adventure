export function coopBossSessionHref(sessionId: string): string {
  const normalized = sessionId.trim();
  return normalized
    ? `/battle/coop/${encodeURIComponent(normalized)}`
    : "/battle/coop";
}
