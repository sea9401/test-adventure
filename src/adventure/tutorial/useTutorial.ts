"use client";

import { useCallback } from "react";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { TUTORIAL_ENABLED_FLAG, type TutorialStepId } from "./flags";

export type TutorialState = {
  shown: boolean;
  dismiss: () => void;
};

// 전체 유저 튜토리얼 OFF kill-switch.
// TUTORIAL_ENABLED_FLAG 는 신규 캐릭만 starterSaves 가 시드하므로, false 로 풀어도
// 기존 유저(플래그 없음)에겐 안 뜨고 신규 유저에게만 노출된다 (#256 "걸리적거림" 회피).
const TUTORIAL_KILL_SWITCH = false;

export function useTutorial(stepId: TutorialStepId): TutorialState {
  const { has, set } = useStoryFlags();
  const enabled = has(TUTORIAL_ENABLED_FLAG);
  const seen = has(stepId);
  const shown = !TUTORIAL_KILL_SWITCH && enabled && !seen;
  const dismiss = useCallback(() => set(stepId), [set, stepId]);
  return { shown, dismiss };
}
