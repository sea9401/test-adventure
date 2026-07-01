"use client";

import { useCallback, useRef, useState } from "react";
import {
  FishingView,
  type CastOutcome,
  type ReelOutcome,
} from "@/adventure/v2/FishingView";
import { FISH, pickFishId, rollFishSize, type FishId } from "@/adventure/data/v2/fish";
import {
  BITE_MAX_MS,
  BITE_MIN_MS,
  REACTION_MIN_MS,
  REACTION_WINDOW_MS,
} from "@/adventure/v2/fishingSession";
import {
  addFishingCatchXp,
  emptyFishingProgression,
  fishingLevelRewardCoins,
  fishingProgressionView,
} from "@/adventure/v2/fishingProgression";

// /dev/fishing 하니스 — 서버 권위 로직을 클라에서 흉내(같은 pickFishId/rollFishSize).
// 로그인·DB 없이 반응 미니게임 UI 만 QA. 서버 시계 envelope 는 생략하고 반응 윈도우만 본다.
export function FishingHarness() {
  const pending = useRef<Map<string, { fishId: FishId; size: number }>>(new Map());
  const seen = useRef<Set<string>>(new Set());
  const best = useRef<Record<string, number>>({});
  const progress = useRef(emptyFishingProgression());
  const [progression, setProgression] = useState(() =>
    fishingProgressionView(emptyFishingProgression()),
  );

  const cast = useCallback(async (): Promise<CastOutcome> => {
    const biteDelayMs = Math.round(
      BITE_MIN_MS + Math.random() * (BITE_MAX_MS - BITE_MIN_MS),
    );
    const fishId = pickFishId(Math.random);
    const size = rollFishSize(fishId, Math.random);
    const castId = `${Date.now()}-${Math.random()}`;
    pending.current.set(castId, { fishId, size });
    return { castId, biteDelayMs };
  }, []);

  const reel = useCallback(
    async (castId: string, reactionMs: number): Promise<ReelOutcome> => {
      const p = pending.current.get(castId);
      pending.current.delete(castId);
      if (!p) return { caught: false, reason: "no_session" };
      if (reactionMs < REACTION_MIN_MS) return { caught: false, reason: "too_early" };
      if (reactionMs > REACTION_WINDOW_MS)
        return { caught: false, reason: "missed_window" };
      const fish = FISH[p.fishId];
      const prevBest = best.current[p.fishId] ?? 0;
      const isNewSpecies = !seen.current.has(p.fishId);
      if (isNewSpecies) seen.current.add(p.fishId);
      const isPersonalBest = p.size > prevBest;
      if (isPersonalBest) best.current[p.fishId] = p.size;
      const progressResult = addFishingCatchXp(progress.current, p.fishId);
      progress.current = progressResult.state;
      const progressView = fishingProgressionView(progress.current);
      setProgression(progressView);
      return {
        caught: true,
        fishId: p.fishId,
        name: fish.name,
        tier: fish.tier,
        size: p.size,
        isNewSpecies,
        isPersonalBest,
        prevBest,
        codexCount: seen.current.size,
        fishingXpGained: progressResult.xpGained,
        fishingLevel: progressView.level,
        fishingLevelUp: progressResult.leveledUp,
        levelRewardCoins: progressResult.leveledUp
          ? fishingLevelRewardCoins(progressView.level)
          : 0,
        fishingCatches: progressView.catches,
      };
    },
    [],
  );

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[520px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock. 어종·사이즈는 실제와 같은 분포로 굴린다.
          어보 등재/최고기록은 이 페이지 안에서만 누적(새로고침 시 초기화).
        </div>
      </div>
      <FishingView
        cast={cast}
        reel={reel}
        progression={progression}
        progressionLoading={false}
      />
    </div>
  );
}
