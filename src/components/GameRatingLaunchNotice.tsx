"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GameRatingInformation } from "@/components/GameRatingInformation";
import {
  GAME_RATING,
  GAME_RATING_NOTICE_MS,
  isGameEntryPath,
} from "@/lib/gameRating";

export function GameRatingLaunchNotice() {
  const pathname = usePathname();
  const startsOnGame = isGameEntryPath(pathname);
  const hasShown = useRef(startsOnGame);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(startsOnGame);

  useEffect(() => {
    if (hasShown.current || !isGameEntryPath(pathname)) return;
    hasShown.current = true;
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    dialogRef.current?.focus();
    const timer = window.setTimeout(
      () => setVisible(false),
      GAME_RATING_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="게임 이용등급 안내"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Tab") event.preventDefault();
      }}
      className="fixed inset-0 z-[2147483646] overflow-y-auto bg-black text-zinc-900 dark:text-zinc-100"
    >
      <Image
        src={GAME_RATING.ratingImage}
        alt="12세이용가"
        width={78}
        height={90}
        className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] h-[90px] w-[78px]"
        unoptimized
        priority
      />
      <div className="flex min-h-full items-center justify-center px-4 py-28 sm:px-6">
        <div className="min-h-[25dvh] w-full max-w-2xl">
          <GameRatingInformation compact />
        </div>
      </div>
    </div>
  );
}
