"use client";

import Image from "next/image";
import { useState } from "react";
import { UserCircle } from "@phosphor-icons/react";
import {
  avatarImageSrc,
  type Avatar,
} from "@/adventure/profile/avatars";
import {
  getProfileBorderVariant,
  type ProfileBorderId,
} from "@/adventure/data/v2/museunCosmetics";

export function CosmeticAvatar({
  avatar,
  name,
  profileBorder = null,
  width,
  height = width,
  sizes,
  className = "",
  imageClassName = "object-cover",
}: {
  avatar: Avatar;
  name: string;
  profileBorder?: ProfileBorderId | null;
  width: number;
  height?: number;
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  const src = avatarImageSrc(avatar);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const profileDecoration = profileBorder
    ? getProfileBorderVariant(profileBorder)
    : null;
  const cosmeticClass = profileBorder
    ? `ui-profile-avatar-frame-cosmetic ui-profile-frame-${profileBorder} ui-profile-frame-static`
    : "";

  return (
    <span
      className={`ui-profile-avatar-frame ${cosmeticClass} ${className}`}
      title={
        profileDecoration
          ? `${name}님의 ${profileDecoration.name} 프로필 꾸미기`
          : undefined
      }
    >
      {failedSrc === src ? (
        <span
          role="img"
          aria-label={`${name} 프로필`}
          className="ui-profile-avatar-fallback"
        >
          <UserCircle size="62%" weight="duotone" aria-hidden />
        </span>
      ) : (
        <Image
          src={src}
          alt={`${name} 프로필`}
          width={width}
          height={height}
          sizes={sizes}
          className={`ui-profile-avatar-image ${imageClassName}`}
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}
