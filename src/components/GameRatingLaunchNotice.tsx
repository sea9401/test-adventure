"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  GAME_RATING,
  GAME_RATING_NOTICE_MS,
  GAME_RATING_NOTICE_SESSION_KEY,
  isGameEntryPath,
} from "@/lib/gameRating";

export function GameRatingLaunchNotice() {
  const pathname = usePathname();
  const startsOnGame = isGameEntryPath(pathname);
  const hasShown = useRef(startsOnGame);
  const [visible, setVisible] = useState(startsOnGame);

  useEffect(() => {
    if (hasShown.current || !isGameEntryPath(pathname)) return;
    hasShown.current = true;
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;

    try {
      if (window.sessionStorage.getItem(GAME_RATING_NOTICE_SESSION_KEY) === "1") {
        const timer = window.setTimeout(() => setVisible(false), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // 저장소가 차단되면 법정 고지를 생략하지 않는 쪽으로 안전하게 동작한다.
    }

    const timer = window.setTimeout(
      () => {
        try {
          window.sessionStorage.setItem(GAME_RATING_NOTICE_SESSION_KEY, "1");
        } catch {
          // 다음 문서에서도 고지를 다시 표시하는 보수적인 fallback을 유지한다.
        }
        setVisible(false);
      },
      GAME_RATING_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="게임 이용등급 안내"
      aria-atomic="true"
      className="game-rating-launch-notice pointer-events-none fixed inset-0 z-[2147483646] flex items-start justify-end p-[max(0.75rem,env(safe-area-inset-top))] text-zinc-900 dark:text-zinc-100 sm:p-4"
    >
      <section
        className={`${SURFACE_CARD} flex min-h-[25dvh] w-[min(92vw,26rem)] flex-col justify-center gap-4 p-4 shadow-xl sm:p-5`}
      >
        <div className="flex items-start gap-4">
          <Image
            src={GAME_RATING.ratingImage}
            alt="12세이용가"
            width={78}
            height={90}
            className="h-[90px] w-[78px] shrink-0"
            unoptimized
            priority
          />
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-bold sm:text-xl">게임 이용등급 안내</h2>
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              {GAME_RATING.rating}
            </p>
            <p className="font-semibold text-red-700 dark:text-red-300">
              {GAME_RATING.restrictionNotice}
            </p>
          </div>
        </div>

        <div className={`${SURFACE_INSET} flex items-center gap-3 p-3`}>
          <Image
            src={GAME_RATING.descriptorImage}
            alt="내용정보: 폭력성"
            width={61}
            height={70}
            className="h-[70px] w-[61px] shrink-0"
            unoptimized
          />
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">내용정보</p>
            <p className="text-lg font-bold">{GAME_RATING.descriptor}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
