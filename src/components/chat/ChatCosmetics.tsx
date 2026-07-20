import { Sparkle } from "@phosphor-icons/react";
import {
  getChromaNameVariant,
  type MuseunCosmeticAppearance,
} from "@/adventure/data/v2/museunCosmetics";

export function ChatCosmeticBadge({
  badge,
}: {
  badge?: MuseunCosmeticAppearance["chatBadge"];
}) {
  if (badge !== "starlight") return null;
  return (
    <span
      aria-label="별빛 채팅 배지"
      title="별빛 채팅 배지"
      className="ui-chat-badge-starlight mr-1 inline-flex align-[-0.12em]"
    >
      <Sparkle size={12} weight="fill" aria-hidden="true" />
    </span>
  );
}

export function chatNameClass(
  effect: MuseunCosmeticAppearance["chatNameEffect"] | undefined,
  fallbackClass: string,
): string {
  if (!effect) return fallbackClass;
  const variant = getChromaNameVariant(effect);
  return `ui-chat-name-chroma ui-chat-name-chroma--${variant.rarity} ui-chat-name-chroma--${effect} ${fallbackClass}`;
}
