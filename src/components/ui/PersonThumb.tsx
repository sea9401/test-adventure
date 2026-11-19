import type { ReactNode } from "react";
import type { Avatar } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import { CosmeticAvatar } from "./CosmeticAvatar";

// 줄 머리 식별 그림 — 목록·채팅 줄 맨 앞에 붙는 작은 그림의 공통 훅.
//   은신 모드와 터미널 모드에서는 globals.css가 이 클래스를 숨겨 글만 남긴다.
//   사람(프사) 외에 물건·메뉴 그림도 줄 맨 앞에 둘 때 같은 클래스를 쓴다.
export const ROW_THUMB_CLASS = "ui-row-thumb";

const SIZES = {
  list: { px: 28, className: "size-7" },
  chat: { px: 32, className: "size-8" },
} as const;

export type PersonThumbSize = keyof typeof SIZES;

/** 사람이 나오는 줄 맨 앞의 프사. 테두리 꾸미기는 움직이지 않는 색 테두리로만 보인다. */
export function PersonThumb({
  avatar,
  name,
  profileBorder = null,
  size = "list",
  className = "",
}: {
  avatar: Avatar;
  name: string;
  profileBorder?: ProfileBorderId | null;
  size?: PersonThumbSize;
  className?: string;
}) {
  const { px, className: sizeClass } = SIZES[size];
  return (
    <CosmeticAvatar
      avatar={avatar}
      name={name}
      profileBorder={profileBorder}
      width={px}
      height={px}
      sizes={`${px}px`}
      className={`${ROW_THUMB_CLASS} ${sizeClass} shrink-0 ${className}`.trim()}
    />
  );
}

/** 프사와 이름을 한 줄로 놓는 묶음. 이름 뒤 보조 정보(직책·"나" 표시 등)는 children으로 받는다. */
export function PersonLabel({
  avatar,
  name,
  profileBorder = null,
  size = "list",
  nameClassName = "font-medium",
  children,
}: {
  avatar: Avatar;
  name: string;
  profileBorder?: ProfileBorderId | null;
  size?: PersonThumbSize;
  nameClassName?: string;
  children?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonThumb
        avatar={avatar}
        name={name}
        profileBorder={profileBorder}
        size={size}
      />
      <span className={`min-w-0 truncate ${nameClassName}`}>{name}</span>
      {children}
    </span>
  );
}
