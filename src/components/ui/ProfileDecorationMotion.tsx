import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";

export function ProfileDecorationMotion({
  profileBorder,
  compact = false,
}: {
  profileBorder: ProfileBorderId | null | undefined;
  compact?: boolean;
}) {
  if (profileBorder !== "verdant") return null;

  return (
    <span
      className={`ui-verdant-decoration-motion${compact ? " ui-verdant-decoration-motion--compact" : ""}`}
      aria-hidden="true"
    >
      <span className="ui-verdant-leaf ui-verdant-leaf--fall-a" />
      <span className="ui-verdant-leaf ui-verdant-leaf--fall-b" />
      <span className="ui-verdant-leaf ui-verdant-leaf--fall-c" />
    </span>
  );
}
