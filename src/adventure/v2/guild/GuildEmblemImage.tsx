"use client";

import Image from "next/image";
import { useState } from "react";
import { FlagBanner } from "@phosphor-icons/react";
import { isGuildEmblemImageUrl } from "@/adventure/data/guild-emblems";

export function GuildEmblemImage({
  emblem,
  guildName,
  className = "h-16 w-16",
}: {
  emblem: string | null | undefined;
  guildName: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = isGuildEmblemImageUrl(emblem) ? emblem : null;
  const showImage = imageUrl !== null && failedUrl !== imageUrl;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${className}`}
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt={`${guildName} 길드 엠블럼`}
          fill
          sizes="96px"
          className="object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <FlagBanner size="55%" weight="fill" aria-hidden />
      )}
    </div>
  );
}
