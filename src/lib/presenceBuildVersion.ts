const FRESH_MS = 30_000;
let latest: { buildId: string; receivedAt: number } | undefined;
let pending: Promise<string | null> | undefined;

/** Share only public build metadata, never heartbeat identity/session data. */
export function trackPresenceBuildVersion(request: Promise<string | null>): void {
  const tracked = request.catch(() => null).then((buildId) => {
    if (pending === tracked) {
      latest = buildId ? { buildId, receivedAt: Date.now() } : undefined;
      pending = undefined;
    }
    return buildId;
  });
  pending = tracked;
}

export async function readPresenceBuildVersion(): Promise<string | null> {
  if (pending) return pending;
  const age = latest ? Date.now() - latest.receivedAt : -1;
  return latest && age >= 0 && age < FRESH_MS ? latest.buildId : null;
}
