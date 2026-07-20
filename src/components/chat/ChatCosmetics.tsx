import {
  Anchor,
  Atom,
  Axe,
  Clover,
  Compass,
  Crown,
  Diamond,
  Eye,
  Feather,
  Fire,
  Fish,
  Flask,
  Hammer,
  Heart,
  Leaf,
  Lightning,
  Mountains,
  Moon,
  MusicNotes,
  PawPrint,
  Shield,
  Skull,
  Snowflake,
  Sparkle,
  Star,
  Sun,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import {
  getChromaNameVariant,
  type MuseunCosmeticAppearance,
} from "@/adventure/data/v2/museunCosmetics";

export function ChatCosmeticBadge({
  badge,
}: {
  badge?: MuseunCosmeticAppearance["chatBadge"];
}) {
  if (!badge) return null;
  const config = {
    starlight: { label: "별빛 채팅 배지", Icon: Sparkle },
    crown: { label: "왕관 채팅 배지", Icon: Crown },
    flame: { label: "불꽃 채팅 배지", Icon: Fire },
    crystal: { label: "수정 채팅 배지", Icon: Diamond },
    leaf: { label: "새싹 채팅 배지", Icon: Leaf },
    sword: { label: "검 채팅 배지", Icon: Sword },
    shield: { label: "방패 채팅 배지", Icon: Shield },
    trophy: { label: "트로피 채팅 배지", Icon: Trophy },
    moon: { label: "달빛 채팅 배지", Icon: Moon },
    sun: { label: "태양 채팅 배지", Icon: Sun },
    heart: { label: "하트 채팅 배지", Icon: Heart },
    skull: { label: "해골 채팅 배지", Icon: Skull },
    lightning: { label: "번개 채팅 배지", Icon: Lightning },
    snowflake: { label: "눈꽃 채팅 배지", Icon: Snowflake },
    paw: { label: "발자국 채팅 배지", Icon: PawPrint },
    feather: { label: "깃털 채팅 배지", Icon: Feather },
    anchor: { label: "닻 채팅 배지", Icon: Anchor },
    music: { label: "음표 채팅 배지", Icon: MusicNotes },
    clover: { label: "네잎클로버 채팅 배지", Icon: Clover },
    star: { label: "별 채팅 배지", Icon: Star },
    vein: { label: "광맥 채팅 배지", Icon: Mountains },
    fish: { label: "물고기 채팅 배지", Icon: Fish },
    axe: { label: "도끼 채팅 배지", Icon: Axe },
    hammer: { label: "망치 채팅 배지", Icon: Hammer },
    alchemy: { label: "연금술 채팅 배지", Icon: Flask },
    compass: { label: "나침반 채팅 배지", Icon: Compass },
    dragon_eye: { label: "용안 채팅 배지", Icon: Eye },
    five_elements: { label: "오원소 문장 채팅 배지", Icon: Atom },
  }[badge];
  const { label, Icon } = config;
  return (
    <span
      aria-label={label}
      title={label}
      className={`ui-chat-badge ui-chat-badge--${badge} mr-1 inline-flex align-[-0.12em]`}
    >
      <Icon size={12} weight="fill" aria-hidden="true" />
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
