import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";

const PROFILE_PARTICLE_CLASSES = {
  infernal: ["a", "b", "c", "d", "e"].map(
    (slot) => `ui-infernal-ember ui-infernal-ember--${slot}`,
  ),
  oceanic: ["a", "b", "c", "d", "e"].map(
    (slot) => `ui-oceanic-bubble ui-oceanic-bubble--${slot}`,
  ),
  verdant: ["a", "b", "c", "d", "e"].map(
    (slot) => `ui-verdant-leaf ui-verdant-leaf--fall-${slot}`,
  ),
  rose: ["a", "b", "c", "d", "e"].map(
    (slot) => `ui-rose-petal ui-rose-petal--${slot}`,
  ),
} as const satisfies Partial<Record<ProfileBorderId, readonly string[]>>;

export function ProfileDecorationMotion({
  profileBorder,
  compact = false,
}: {
  profileBorder: ProfileBorderId | null | undefined;
  compact?: boolean;
}) {
  const particleClasses = profileBorder
    ? PROFILE_PARTICLE_CLASSES[
        profileBorder as keyof typeof PROFILE_PARTICLE_CLASSES
      ]
    : undefined;
  if (!particleClasses) return null;

  return (
    <span
      className={`ui-profile-decoration-motion ui-profile-decoration-motion--${profileBorder}${compact ? " ui-profile-decoration-motion--compact" : ""}`}
      aria-hidden="true"
    >
      {particleClasses.map((className) => (
        <span key={className} className={className} />
      ))}
    </span>
  );
}
