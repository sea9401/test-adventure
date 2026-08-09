export type MasteryTowerAttemptRequest =
  | { ok: true; startFloor?: number }
  | { ok: false; error: "invalid_start_floor" };

export function parseMasteryTowerAttemptRequest(
  raw: unknown,
): MasteryTowerAttemptRequest {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (body.startFloor === undefined) return { ok: true };
  return Number.isInteger(body.startFloor)
    ? { ok: true, startFloor: Number(body.startFloor) }
    : { ok: false, error: "invalid_start_floor" };
}
