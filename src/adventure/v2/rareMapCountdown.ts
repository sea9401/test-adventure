import { RARE_MAP_TTL_MS } from "@/adventure/data/v2/rareMaps";

export function correctedRareMapExpiry(
  foundAt: number,
  serverNow: number,
  clientNow: number,
): number {
  const serverExpiresAt = foundAt + RARE_MAP_TTL_MS;
  return clientNow + Math.max(0, serverExpiresAt - serverNow);
}

export function formatRareMapRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
