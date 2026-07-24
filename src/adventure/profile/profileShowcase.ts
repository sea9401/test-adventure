export const PROFILE_SHOWCASE_SAVE_KEY = "profile-showcase.v1";

export type ProfileShowcaseSelection =
  | { kind: "equipment"; iid: string }
  | { kind: "achievement"; achievementId: string }
  | { kind: "title"; titleId: string };

const MAX_SHOWCASE_ID_LENGTH = 160;

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SHOWCASE_ID_LENGTH
  );
}

export function parseProfileShowcaseSelection(
  value: unknown,
): ProfileShowcaseSelection | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "equipment" && validId(candidate.iid)) {
    return { kind: "equipment", iid: candidate.iid };
  }
  if (
    candidate.kind === "achievement" &&
    validId(candidate.achievementId)
  ) {
    return { kind: "achievement", achievementId: candidate.achievementId };
  }
  if (candidate.kind === "title" && validId(candidate.titleId)) {
    return { kind: "title", titleId: candidate.titleId };
  }
  return null;
}

export function parseProfileShowcase(
  raw: unknown,
): ProfileShowcaseSelection | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return parseProfileShowcaseSelection(
    (raw as { selection?: unknown }).selection,
  );
}
