export const PROFILE_SHOWCASE_SAVE_KEY = "profile-showcase.v1";
export const PROFILE_BADGE_STAND_ITEM_ID = "profile_badge_display_stand";
export const PROFILE_BADGE_STAND_PRICE = 600;
export const PROFILE_BADGE_STAND_SLOT_COUNT = 3;

export type ProfileShowcaseSelection =
  | { kind: "equipment"; iid: string }
  | { kind: "achievement"; achievementId: string }
  | { kind: "title"; titleId: string };

export type ProfileShowcaseSlots = [
  ProfileShowcaseSelection | null,
  ProfileShowcaseSelection | null,
  ProfileShowcaseSelection | null,
];

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
  return parseProfileShowcaseSlots(raw)[0];
}

export function parseProfileShowcaseSlots(raw: unknown): ProfileShowcaseSlots {
  const empty: ProfileShowcaseSlots = [null, null, null];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const value = raw as { slots?: unknown; selection?: unknown };
  if (Array.isArray(value.slots)) {
    const rawSlots = value.slots;
    return [0, 1, 2].map((index) =>
      parseProfileShowcaseSelection(rawSlots[index]),
    ) as ProfileShowcaseSlots;
  }
  return [parseProfileShowcaseSelection(value.selection), null, null];
}

export function parseProfileBadgeStandVisible(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return true;
  return (raw as { visible?: unknown }).visible !== false;
}

export function ownsProfileBadgeStand(characterRaw: unknown): boolean {
  return (
    characterRaw != null &&
    typeof characterRaw === "object" &&
    !Array.isArray(characterRaw) &&
    (characterRaw as { profileBadgeStandOwned?: unknown })
      .profileBadgeStandOwned === true
  );
}
