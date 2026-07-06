"use client";

import Image from "next/image";
import {
  FISH,
  fishImagePath,
  isFishId,
  type FishId,
} from "@/adventure/data/v2/fish";

export function FishIcon({
  fishId,
  name,
  className = "h-6 w-6",
  decorative = false,
}: {
  fishId: FishId | string;
  name?: string;
  className?: string;
  decorative?: boolean;
}) {
  const id = isFishId(fishId) ? fishId : "crucian_carp";
  const alt = decorative ? "" : `${name ?? FISH[id].name} 이미지`;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
    >
      <Image
        src={fishImagePath(id)}
        alt={alt}
        fill
        sizes="96px"
        className="object-contain drop-shadow-sm"
      />
    </span>
  );
}
