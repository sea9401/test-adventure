import type { CSSProperties, SVGProps } from "react";

export const CUSTOM_GAME_ICON_NAMES = [
  "Sword",
  "Shield",
  "Coins",
  "Compass",
  "House",
  "MapTrifold",
  "Hammer",
  "Fish",
  "Plant",
  "Trophy",
  "Bell",
  "Gear",
  "FirstAid",
  "Bank",
  "Storefront",
] as const;

export type CustomGameIconName = (typeof CUSTOM_GAME_ICON_NAMES)[number];

export const CUSTOM_GAME_ICON_META = {
  Sword: {
    label: "검",
    category: "전투",
    tileClass:
      "border-rose-300 bg-rose-100 dark:border-rose-800 dark:bg-rose-950",
  },
  Shield: {
    label: "방패",
    category: "방어",
    tileClass:
      "border-sky-300 bg-sky-100 dark:border-sky-800 dark:bg-sky-950",
  },
  Coins: {
    label: "코인",
    category: "경제",
    tileClass:
      "border-amber-300 bg-amber-100 dark:border-amber-800 dark:bg-amber-950",
  },
  Compass: {
    label: "나침반",
    category: "탐험",
    tileClass:
      "border-cyan-300 bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950",
  },
  House: {
    label: "거점",
    category: "마을",
    tileClass:
      "border-orange-300 bg-orange-100 dark:border-orange-800 dark:bg-orange-950",
  },
  MapTrifold: {
    label: "지도",
    category: "탐험",
    tileClass:
      "border-teal-300 bg-teal-100 dark:border-teal-800 dark:bg-teal-950",
  },
  Hammer: {
    label: "망치",
    category: "제작",
    tileClass:
      "border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-950",
  },
  Fish: {
    label: "낚시",
    category: "생활",
    tileClass:
      "border-blue-300 bg-blue-100 dark:border-blue-800 dark:bg-blue-950",
  },
  Plant: {
    label: "농사",
    category: "생활",
    tileClass:
      "border-emerald-300 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950",
  },
  Trophy: {
    label: "업적",
    category: "성장",
    tileClass:
      "border-yellow-300 bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950",
  },
  Bell: {
    label: "알림",
    category: "시스템",
    tileClass:
      "border-violet-300 bg-violet-100 dark:border-violet-800 dark:bg-violet-950",
  },
  Gear: {
    label: "설정",
    category: "시스템",
    tileClass:
      "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900",
  },
  FirstAid: {
    label: "치료소",
    category: "회복",
    tileClass:
      "border-rose-300 bg-rose-100 dark:border-rose-800 dark:bg-rose-950",
  },
  Bank: {
    label: "은행",
    category: "경제",
    tileClass:
      "border-yellow-300 bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950",
  },
  Storefront: {
    label: "상점",
    category: "경제",
    tileClass:
      "border-orange-300 bg-orange-100 dark:border-orange-800 dark:bg-orange-950",
  },
} as const satisfies Record<
  CustomGameIconName,
  { label: string; category: string; tileClass: string }
>;

export type CustomGameIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: CustomGameIconName;
  size?: number | string;
  mirrored?: boolean;
  title?: string;
};

export function CustomGameIcon({
  name,
  size = "1em",
  mirrored = false,
  title,
  style,
  ...props
}: CustomGameIconProps) {
  const mergedStyle: CSSProperties | undefined = mirrored
    ? { ...style, transform: `${style?.transform ?? ""} scaleX(-1)`.trim() }
    : style;

  return (
    <svg
      {...props}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : props["aria-hidden"] ?? true}
      style={mergedStyle}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <CustomGameIconArtwork name={name} />
    </svg>
  );
}

export function CustomGameIconTile({
  name,
  tileSize = 64,
  iconSize = 42,
  className = "",
}: {
  name: CustomGameIconName;
  tileSize?: number;
  iconSize?: number;
  className?: string;
}) {
  const meta = CUSTOM_GAME_ICON_META[name];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl border ${meta.tileClass} ${className}`}
      style={{ width: tileSize, height: tileSize }}
    >
      <CustomGameIcon name={name} size={iconSize} />
    </span>
  );
}

function CustomGameIconArtwork({ name }: { name: CustomGameIconName }) {
  switch (name) {
    case "Sword":
      return (
        <>
          <path d="M16 47 42 21l2-12 12-2-2 12-26 26Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="m13 39 13 13" stroke="#2a0a5e" strokeWidth="8" strokeLinecap="round" />
          <path d="m13 39 13 13" stroke="#ef5c5c" strokeWidth="4" strokeLinecap="round" />
          <path d="m15 49-7 7" stroke="#2a0a5e" strokeWidth="9" strokeLinecap="round" />
          <path d="m15 49-7 7" stroke="#ef5c5c" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "Shield":
      return (
        <>
          <path d="M32 7c7 4 14 6 22 6v17c0 13-8 23-22 28C18 53 10 43 10 30V13c8 0 15-2 22-6Z" fill="#fff8e8" />
          <path d="M32 14c5 2 10 3 15 4v12c0 9-5 15-15 20Z" fill="#5ba7ff" />
          <path d="M32 7c7 4 14 6 22 6v17c0 13-8 23-22 28C18 53 10 43 10 30V13c8 0 15-2 22-6Z" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M32 15v34" stroke="#2a0a5e" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "Coins":
      return (
        <>
          <ellipse cx="39" cy="23" rx="17" ry="15" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" />
          <path d="M26 23c0 6 6 10 13 10s13-4 13-10" stroke="#2a0a5e" strokeWidth="3" />
          <ellipse cx="25" cy="41" rx="17" ry="15" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" />
          <path d="M12 41c0 6 6 10 13 10s13-4 13-10" stroke="#2a0a5e" strokeWidth="3" />
          <path d="M21 33h8M35 15h8" stroke="#fff8e8" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "Compass":
      return (
        <>
          <circle cx="32" cy="32" r="25" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" />
          <path d="m39 14-5 17-14 19 10-18Z" fill="#52d3c4" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="m25 50 5-18 14-18-10 17Z" fill="#ef5c5c" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="4" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="3" />
        </>
      );
    case "House":
      return (
        <>
          <path d="M14 29v27h36V29L32 15Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M7 31 32 9l25 22-7 8-18-16-18 16Z" fill="#ff9f43" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M26 56V39h12v17" fill="#c6a6f4" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
        </>
      );
    case "MapTrifold":
      return (
        <>
          <path d="m7 14 16-6 18 6 16-6v42l-16 6-18-6-16 6Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M23 8v42M41 14v42" stroke="#2a0a5e" strokeWidth="4" />
          <path d="M12 39c8-3 9-14 18-14 8 0 8 11 17 11 3 0 5-1 7-3" stroke="#52d3c4" strokeWidth="6" strokeLinecap="round" />
          <circle cx="30" cy="25" r="4" fill="#ffca28" stroke="#2a0a5e" strokeWidth="3" />
        </>
      );
    case "Hammer":
      return (
        <>
          <path d="M16 9h25l13 12-10 10-8-8-8 8-15-15Z" fill="#ef7c5e" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="m36 28-21 27" stroke="#2a0a5e" strokeWidth="12" strokeLinecap="round" />
          <path d="m36 28-21 27" stroke="#fff8e8" strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case "Fish":
      return (
        <>
          <path d="M47 26 57 17v30L47 38Z" fill="#5cc8ff" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M7 32c9-14 27-18 42-5v10C34 50 16 46 7 32Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="m28 25 8-9 5 13M28 39l8 9 5-13" fill="#5cc8ff" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="19" cy="29" r="3" fill="#2a0a5e" />
        </>
      );
    case "Plant":
      return (
        <>
          <path d="M32 39V20" stroke="#2a0a5e" strokeWidth="5" strokeLinecap="round" />
          <path d="M31 24C17 24 12 16 13 8c11-1 20 4 19 16Z" fill="#6acb70" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M33 31c14 0 19-8 18-16-11-1-20 4-19 16Z" fill="#8cdd7f" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M16 38h32l-4 19H20Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M23 45h18" stroke="#ef7c5e" strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case "Trophy":
      return (
        <>
          <path d="M17 9h30v12c0 12-6 20-15 20s-15-8-15-20Z" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M17 15H8v7c0 8 5 13 14 13M47 15h9v7c0 8-5 13-14 13" stroke="#2a0a5e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M32 41v9M21 56h22" stroke="#2a0a5e" strokeWidth="6" strokeLinecap="round" />
          <path d="m32 16 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#fff8e8" />
        </>
      );
    case "Bell":
      return (
        <>
          <path d="M14 47h36l-5-8V27c0-9-5-16-13-16s-13 7-13 16v12Z" fill="#c6a6f4" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M27 10c0-4 2-6 5-6s5 2 5 6" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 48c1 8 4 11 8 11s7-3 8-11" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M23 28c0-5 3-9 7-11" stroke="#fff8e8" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case "Gear":
      return (
        <>
          <g fill="#a98bea" stroke="#2a0a5e" strokeWidth="3">
            <rect x="27" y="4" width="10" height="14" rx="3" />
            <rect x="27" y="46" width="10" height="14" rx="3" />
            <rect x="46" y="25" width="14" height="10" rx="3" />
            <rect x="4" y="25" width="14" height="10" rx="3" />
            <rect x="43" y="8" width="10" height="14" rx="3" transform="rotate(45 48 15)" />
            <rect x="11" y="42" width="10" height="14" rx="3" transform="rotate(45 16 49)" />
            <rect x="42" y="43" width="14" height="10" rx="3" transform="rotate(45 49 48)" />
            <rect x="8" y="11" width="14" height="10" rx="3" transform="rotate(45 15 16)" />
          </g>
          <circle cx="32" cy="32" r="20" fill="#a98bea" stroke="#2a0a5e" strokeWidth="4" />
          <circle cx="32" cy="32" r="8" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" />
        </>
      );
    case "FirstAid":
      return (
        <>
          <path d="M23 17v-5c0-3 2-5 5-5h8c3 0 5 2 5 5v5" stroke="#2a0a5e" strokeWidth="4" strokeLinecap="round" />
          <rect x="7" y="16" width="50" height="41" rx="9" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" />
          <path d="M27 24h10v8h8v10h-8v8H27v-8h-8V32h8Z" fill="#ef5c5c" stroke="#2a0a5e" strokeWidth="3" strokeLinejoin="round" />
        </>
      );
    case "Bank":
      return (
        <>
          <path d="M7 22 32 7l25 15v8H7Z" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M12 30h40v24H12Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" />
          <path d="M20 33v18M32 33v18M44 33v18" stroke="#2a0a5e" strokeWidth="5" />
          <path d="M7 54h50v6H7Z" fill="#ffca28" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
        </>
      );
    case "Storefront":
      return (
        <>
          <path d="M11 23h42v34H11Z" fill="#fff8e8" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M8 22 13 8h38l5 14c0 6-5 9-10 5-4 4-9 4-14 0-5 4-10 4-14 0-5 4-10 1-10-5Z" fill="#ff9f43" stroke="#2a0a5e" strokeWidth="4" strokeLinejoin="round" />
          <path d="M23 9 20 25M41 9l3 16" stroke="#fff8e8" strokeWidth="6" />
          <path d="M17 36h14v11H17Z" fill="#52d3c4" stroke="#2a0a5e" strokeWidth="3" />
          <path d="M39 36h9v21h-9Z" fill="#c6a6f4" stroke="#2a0a5e" strokeWidth="3" />
        </>
      );
  }
}
