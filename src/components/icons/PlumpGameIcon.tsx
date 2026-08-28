import type { CSSProperties, SVGProps } from "react";

export const PLUMP_GAME_ICON_NAMES = [
  "adventure_support_ticket",
  "stamina_potion",
  "boss_summon_scroll",
  "mastery_token",
  "map_fragment",
  "currency_stack",
  "chroma_box",
  "chat_badge_box",
  "profile_frame_box",
  "cooking",
  "salt",
  "pepper",
  "cooking_oil",
  "vinegar",
  "spice",
  "yeast",
  "flour",
  "butter",
  "cheese",
  "broth",
  "sauce",
  "cream",
  "rank_gold",
  "rank_silver",
  "rank_bronze",
  "wood_resource",
  "ore_resource",
  "equipment_set",
  "celebration",
  "battle_node",
] as const;

export type PlumpGameIconName = (typeof PLUMP_GAME_ICON_NAMES)[number];

export const PLUMP_GAME_ICON_META = {
  adventure_support_ticket: { label: "모험 지원권", color: "#ffb51f" },
  stamina_potion: { label: "스태미나 회복약", color: "#ec5ca8" },
  boss_summon_scroll: { label: "보스 소환서", color: "#ff6b35" },
  mastery_token: { label: "숙련의 증표", color: "#139be8" },
  map_fragment: { label: "지도 조각", color: "#58c62d" },
  currency_stack: { label: "주화·골드", color: "#ffb51f" },
  chroma_box: { label: "닉네임 꾸미기", color: "#8b5cf6" },
  chat_badge_box: { label: "채팅 배지", color: "#ec5ca8" },
  profile_frame_box: { label: "프로필 테두리", color: "#526de8" },
  cooking: { label: "요리", color: "#ff6b35" },
  salt: { label: "소금", color: "#139be8" },
  pepper: { label: "후추", color: "#788a9a" },
  cooking_oil: { label: "식용유", color: "#ffb51f" },
  vinegar: { label: "식초", color: "#20bda8" },
  spice: { label: "향신료", color: "#ff3d42" },
  yeast: { label: "효모", color: "#58c62d" },
  flour: { label: "밀가루", color: "#ad6d3f" },
  butter: { label: "버터", color: "#ffb51f" },
  cheese: { label: "치즈", color: "#ffb51f" },
  broth: { label: "육수", color: "#ff6b35" },
  sauce: { label: "소스", color: "#ff3d42" },
  cream: { label: "크림", color: "#139be8" },
  rank_gold: { label: "금메달", color: "#ffb51f" },
  rank_silver: { label: "은메달", color: "#788a9a" },
  rank_bronze: { label: "동메달", color: "#ad6d3f" },
  wood_resource: { label: "통나무", color: "#ad6d3f" },
  ore_resource: { label: "철광석", color: "#788a9a" },
  equipment_set: { label: "세트 장비", color: "#526de8" },
  celebration: { label: "축하", color: "#ec5ca8" },
  battle_node: { label: "전투", color: "#ff3d42" },
} as const satisfies Record<PlumpGameIconName, { label: string; color: string }>;

export type PlumpGameIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: PlumpGameIconName;
  size?: number | string;
  mirrored?: boolean;
  title?: string;
};

export function PlumpGameIcon({
  name,
  size = "1em",
  mirrored = false,
  title,
  style,
  ...props
}: PlumpGameIconProps) {
  const mergedStyle: CSSProperties | undefined = mirrored
    ? { ...style, transform: `${style?.transform ?? ""} scaleX(-1)`.trim() }
    : style;

  return (
    <svg
      {...props}
      data-plump-icon={name}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : props["aria-hidden"] ?? true}
      style={mergedStyle}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g fill={PLUMP_GAME_ICON_META[name].color}>
        <PlumpGameIconArtwork name={name} />
      </g>
    </svg>
  );
}

function WhiteLine({ d, thin = false }: { d: string; thin?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="#fff"
      strokeWidth={thin ? 3 : 4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function PlumpGameIconArtwork({ name }: { name: PlumpGameIconName }) {
  switch (name) {
    case "adventure_support_ticket":
      return (
        <>
          <path d="M8 15c0-3 2-5 5-5h38c3 0 5 2 5 5v10c-5 0-8 3-8 7s3 7 8 7v10c0 3-2 5-5 5H13c-3 0-5-2-5-5V39c5 0 8-3 8-7s-3-7-8-7Z" />
          <rect fill="#fff" x="32" y="15" width="4" height="7" rx="2" />
          <rect fill="#fff" x="32" y="27" width="4" height="7" rx="2" />
          <rect fill="#fff" x="32" y="39" width="4" height="7" rx="2" />
          <path fill="#fff" d="m23 22 2.2 5.1 5.3.4-4 3.5 1.2 5.2-4.7-2.7-4.6 2.7 1.1-5.2-4-3.5 5.3-.4Z" />
        </>
      );
    case "stamina_potion":
      return (
        <>
          <path d="M24 6h16v15c8 5 13 13 13 23 0 10-8 16-21 16s-21-6-21-16c0-10 5-18 13-23Z" />
          <rect fill="#fff" x="22" y="12" width="20" height="6" rx="3" />
          <path fill="#fff" d="M16 40c9-5 20 4 33-1v7c0 7-6 10-17 10s-17-3-17-10c0-2 0-4 1-6Z" />
          <circle fill="#fff" cx="39" cy="29" r="3" />
        </>
      );
    case "boss_summon_scroll":
      return (
        <>
          <path d="M14 8h34c6 0 10 4 10 10 0 5-4 9-9 10v25H16C9 53 5 49 5 43s4-10 9-11Z" />
          <path fill="#fff" d="M48 13c3 0 5 2 5 5s-2 5-5 5h-5V13Z" />
          <rect fill="#fff" x="20" y="20" width="19" height="4" rx="2" />
          <rect fill="#fff" x="20" y="30" width="24" height="4" rx="2" />
          <rect fill="#fff" x="20" y="40" width="16" height="4" rx="2" />
        </>
      );
    case "mastery_token":
      return (
        <>
          <path d="m18 31-5 28 19-10 19 10-5-28Z" />
          <circle cx="32" cy="23" r="19" />
          <path fill="#fff" d="m32 11 3.4 7.5 8.1.8-6 5.5 1.7 8-7.2-4.1-7.2 4.1 1.7-8-6-5.5 8.1-.8Z" />
        </>
      );
    case "map_fragment":
      return (
        <>
          <path d="m5 13 18-7 18 7 18-7v45l-18 7-18-7-18 7Z" />
          <path fill="#fff" d="M20 11h5v36h-5ZM39 16h5v36h-5Z" />
          <WhiteLine d="M11 39c7-2 8-11 15-11s8 9 16 9c5 0 8-3 11-7" />
          <circle fill="#fff" cx="53" cy="30" r="3.5" />
        </>
      );
    case "currency_stack":
      return (
        <>
          <ellipse cx="38" cy="17" rx="20" ry="11" />
          <path d="M18 17h40v10c0 6-9 11-20 11s-20-5-20-11Z" />
          <ellipse cx="27" cy="39" rx="21" ry="12" />
          <path d="M6 39h42v10c0 7-9 12-21 12S6 56 6 49Z" />
          <rect fill="#fff" x="13" y="45" width="28" height="4" rx="2" />
          <circle fill="#fff" cx="38" cy="17" r="4" />
        </>
      );
    case "chroma_box":
      return (
        <>
          <path d="M31 5C16 5 5 16 5 31s11 27 27 27h6c5 0 8-4 6-8-2-6 2-11 8-11h3c4 0 6-3 6-8C61 16 47 5 31 5Z" />
          <circle fill="#fff" cx="20" cy="22" r="4" />
          <circle fill="#fff" cx="32" cy="16" r="4" />
          <circle fill="#fff" cx="44" cy="22" r="4" />
          <circle fill="#fff" cx="18" cy="35" r="4" />
        </>
      );
    case "chat_badge_box":
      return (
        <>
          <path d="M6 13c0-4 3-7 7-7h19l27 27-27 27L6 34Z" />
          <circle fill="#fff" cx="19" cy="19" r="5" />
          <WhiteLine d="m29 30 11 11M36 24l11 11" />
        </>
      );
    case "profile_frame_box":
      return (
        <>
          <rect x="5" y="7" width="54" height="50" rx="9" />
          <rect fill="#fff" x="13" y="15" width="38" height="34" rx="5" />
          <circle cx="32" cy="27" r="7" />
          <path d="M19 47c2-9 7-14 13-14s11 5 13 14Z" />
        </>
      );
    case "cooking":
      return (
        <>
          <path d="M5 25h43v13c0 13-9 21-22 21S5 51 5 38Z" />
          <path d="m44 28 16-7 4 9-18 6Z" />
          <path fill="#fff" d="M12 29c2-10 10-16 19-14 8 1 12 7 12 14-6-3-11 2-17 0-5-2-9 2-14 0Z" />
          <circle cx="28" cy="25" r="7" />
          <WhiteLine d="M20 11c-3-4 3-6 0-10M35 11c-3-4 3-6 0-10" />
        </>
      );
    case "salt":
      return (
        <>
          <path d="M18 16h28l6 40H12Z" />
          <path d="M17 14C17 7 23 3 32 3s15 4 15 11v7H17Z" />
          <circle fill="#fff" cx="25" cy="12" r="2" />
          <circle fill="#fff" cx="32" cy="9" r="2" />
          <circle fill="#fff" cx="39" cy="12" r="2" />
          <rect fill="#fff" x="18" y="27" width="28" height="12" rx="5" />
          <path d="M26 33c4-4 8-4 12 0-4 4-8 4-12 0Z" />
        </>
      );
    case "pepper":
      return (
        <>
          <path d="M20 14h24c0 8-4 12-7 15 6 6 9 15 9 28H18c0-13 3-22 9-28-3-3-7-7-7-15Z" />
          <path d="M17 11C17 5 23 2 32 2s15 3 15 9l-3 7H20Z" />
          <rect fill="#fff" x="20" y="38" width="24" height="5" rx="2.5" />
          <circle fill="#fff" cx="28" cy="49" r="2" />
          <circle fill="#fff" cx="36" cy="52" r="2" />
        </>
      );
    case "cooking_oil":
      return (
        <>
          <path d="M22 5h20v18c8 5 12 12 12 22 0 11-8 17-22 17s-22-6-22-17c0-10 4-17 12-22Z" />
          <rect fill="#fff" x="22" y="10" width="20" height="7" rx="3.5" />
          <rect fill="#fff" x="17" y="31" width="30" height="18" rx="6" />
          <path d="M25 42c4-8 11-9 15-5-3 7-8 9-15 5Z" />
        </>
      );
    case "vinegar":
      return (
        <>
          <path d="M24 4h16v16c8 5 12 13 12 24 0 12-7 18-20 18S12 56 12 44c0-11 4-19 12-24Z" />
          <path fill="#fff" d="M17 35h30v15H17Z" />
          <path d="M25 42h14v3H25Z" />
          <path fill="#fff" d="M40 23c10-7 17-1 17 8 0 8-4 13-10 14v-6c3-1 5-4 5-8 0-5-4-7-9-3Z" />
        </>
      );
    case "spice":
      return (
        <>
          <path d="m14 20 9-12h22l7 12-5 41H17Z" />
          <path fill="#fff" d="M18 20c8-5 24-5 32 0l-3 10H21Z" />
          <path d="M24 23c4-7 17-7 21 0-4 5-17 5-21 0Z" />
          <path fill="#fff" d="m36 40 17-14 4 5-17 15Z" />
          <circle fill="#fff" cx="28" cy="45" r="2" />
          <circle fill="#fff" cx="35" cy="50" r="2" />
        </>
      );
    case "yeast":
      return (
        <>
          <path d="M13 20h38l5 34c1 5-3 8-9 8H17c-6 0-10-3-9-8Z" />
          <path d="M11 15c7-9 35-9 42 0l-3 11H14Z" />
          <rect fill="#fff" x="17" y="33" width="30" height="18" rx="6" />
          <circle cx="26" cy="42" r="2.5" />
          <circle cx="34" cy="39" r="2" />
          <circle cx="39" cy="46" r="3" />
        </>
      );
    case "flour":
      return (
        <>
          <path d="M13 14c8-6 30-6 38 0l-4 42c0 4-4 7-9 7H26c-5 0-9-3-9-7Z" />
          <rect fill="#fff" x="15" y="17" width="34" height="8" rx="3" />
          <WhiteLine d="M32 51V31M32 39c-7-7-11-3-11 1 4 3 7 3 11 1M32 36c7-7 11-3 11 1-4 3-7 3-11 1" />
        </>
      );
    case "butter":
      return (
        <>
          <path d="m7 31 35-17 15 17-38 21Z" />
          <path d="M19 52 57 31v13L19 64ZM7 31l12 21v12L4 42Z" />
          <WhiteLine thin d="m16 31 25-12M25 42l18-10" />
          <path fill="#fff" d="m39 15 19-9 3 5-18 10Z" />
        </>
      );
    case "cheese":
      return (
        <>
          <path d="M6 27 42 7l17 18-39 20Z" />
          <path d="m20 45 39-20v24L20 64ZM6 27l14 18v19L6 47Z" />
          <circle fill="#fff" cx="40" cy="27" r="5" />
          <circle fill="#fff" cx="42" cy="47" r="4" />
          <circle fill="#fff" cx="53" cy="36" r="3" />
        </>
      );
    case "broth":
      return (
        <>
          <path d="M11 26h42v27c0 7-6 11-13 11H24c-7 0-13-4-13-11Z" />
          <path d="M4 31h10v16H4c-4 0-7-3-7-8s3-8 7-8ZM60 31H50v16h10c4 0 7-3 7-8s-3-8-7-8Z" />
          <ellipse fill="#fff" cx="32" cy="27" rx="18" ry="6" />
          <circle cx="23" cy="26" r="3" />
          <circle cx="34" cy="28" r="3" />
          <circle cx="43" cy="25" r="3" />
          <WhiteLine d="M22 15c-4-4 3-7 0-12M34 15c-4-4 3-7 0-12M46 15c-4-4 3-7 0-12" />
        </>
      );
    case "sauce":
      return (
        <>
          <path d="M16 16h32l5 12v27c0 6-5 9-11 9H22c-6 0-11-3-11-9V28Z" />
          <rect x="14" y="5" width="36" height="15" rx="6" />
          <rect fill="#fff" x="18" y="34" width="28" height="19" rx="6" />
          <circle cx="32" cy="44" r="6" />
          <path fill="#fff" d="M32 38c4-5 8-4 10-1-3 4-6 5-10 1Z" />
        </>
      );
    case "cream":
      return (
        <>
          <path d="M7 37h45l-5 17c-2 6-6 10-13 10H25c-7 0-11-4-13-10Z" />
          <path fill="#fff" d="M14 37c-2-8 4-13 11-11-2-8 6-14 13-10 5 3 6 8 3 13 10-1 14 6 10 12Z" />
          <WhiteLine d="m42 6 5 24M50 5l-4 25M42 6c7-6 13-3 13 3 0 5-4 10-10 13" />
        </>
      );
    case "rank_gold":
    case "rank_silver":
    case "rank_bronze":
      return (
        <>
          <path d="m17 31-5 30 20-11 20 11-5-30Z" />
          <circle cx="32" cy="23" r="20" />
          <circle fill="#fff" cx="32" cy="23" r="12" />
        </>
      );
    case "wood_resource":
      return (
        <>
          <path d="M17 10h25c11 0 19 9 19 21S53 52 42 52H17Z" />
          <ellipse cx="17" cy="31" rx="14" ry="21" />
          <ellipse fill="#fff" cx="17" cy="31" rx="8" ry="13" />
          <ellipse cx="17" cy="31" rx="4" ry="7" />
          <path fill="#fff" d="M39 14h6v34h-6Z" />
        </>
      );
    case "ore_resource":
      return (
        <>
          <path d="m5 39 11-27 23-9 20 18-3 28-22 13-25-8Z" />
          <path fill="#fff" d="m17 14 14 12-22 12ZM33 28l23-6-3 23ZM13 42l18-12v26Z" />
        </>
      );
    case "equipment_set":
      return (
        <>
          <path d="M25 7 9 23c-7 7-7 17 0 24s17 7 24 0l8-8-8-8-8 8c-3 3-6 3-8 0s-3-6 0-8l16-16Z" />
          <path d="m39 57 16-16c7-7 7-17 0-24s-17-7-24 0l-8 8 8 8 8-8c3-3 6-3 8 0s3 6 0 8L31 49Z" />
          <rect fill="#fff" x="22" y="29" width="20" height="6" rx="3" transform="rotate(-45 32 32)" />
        </>
      );
    case "celebration":
      return (
        <>
          <path d="M12 29c7-7 18-2 26 6s13 19 6 26L3 64Z" />
          <path fill="#fff" d="m14 35 23 23-8 2-18-18Z" />
          <path d="m42 4 5 8-7 6-6-8ZM57 21l6 5-4 8-8-4ZM27 7l3 7-7 4-4-7Z" />
          <circle cx="54" cy="8" r="5" />
        </>
      );
    case "battle_node":
      return (
        <>
          <path d="M5 5 27 14l31 36-8 8-36-31Z" />
          <path d="m59 5-22 9L6 50l8 8 36-31Z" />
          <path fill="#fff" d="m23 20 21 24-4 4-21-24ZM41 20 20 44l4 4 21-24Z" />
          <path fill="#fff" d="m9 44 11-11 11 11-11 11ZM55 44 44 33 33 44l11 11Z" />
        </>
      );
  }
}
