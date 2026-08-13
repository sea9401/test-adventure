export function normalizedHuntLocationIds(
  catalogOutpostId: string | null,
  tileOutpostId: string | null,
): string[] {
  return [
    ...new Set(
      [catalogOutpostId, tileOutpostId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ].sort();
}
