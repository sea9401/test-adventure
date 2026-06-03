"use client";

import { useEffect, useRef } from "react";
import {
  NEWBIE_BONUS_LEVEL_THRESHOLD,
  isNewbieBonusActive,
} from "@/lib/leveling";
import type { useTrialState } from "@/adventure/trial/useTrialState";
import type { useNavTabs } from "@/lib/useNavTabs";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

// 마운트 1회 — 신참 보너스 활성 안내, 시련 이어서 진행 안내, reload 사유 안내.
// 모두 한 번만 보여줘야 하므로 ref 가드 + 보여준 뒤 localStorage/sessionStorage 플래그 정리.
export function useOneTimeNotices(deps: {
  level: number;
  tab: ReturnType<typeof useNavTabs>["tab"];
  subView: ReturnType<typeof useNavTabs>["subView"];
  trial: ReturnType<typeof useTrialState>;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}): void {
  const { level, tab, subView, trial, addNotification } = deps;
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    if (isNewbieBonusActive(level)) {
      addNotification(
        "info",
        `신참 보너스 활성 — ${NEWBIE_BONUS_LEVEL_THRESHOLD}레벨 미만 동안 사냥/퀘스트 EXP ×2.`,
      );
    }
    // 시련 재개 안내 — 사용자가 실제 시련 화면(adventure/map) 으로 들어왔을 때만.
    //   - winCount < battles : 임계 도달은 TrialView mount 가 곧 자동 완료 처리 → 안내 불필요.
    //   - sessionStorage dedup by winCount : 60초 hidden→reload 가 반복돼도 같은
    //     winCount 면 1회만 발화. 탭 종료/새 시련 시작 시 endTrial 에서 자동 클리어.
    if (
      tab === "adventure" &&
      subView === "map" &&
      trial.trial &&
      trial.winCount > 0 &&
      trial.winCount < trial.trial.edge.battles
    ) {
      let lastShown = -1;
      try {
        const v = sessionStorage.getItem("trial-resume-shown.v1");
        if (v !== null) lastShown = Number(v);
      } catch {}
      if (lastShown !== trial.winCount) {
        addNotification(
          "info",
          `시련 이어서 진행 — ${trial.winCount} / ${trial.trial.edge.battles}.`,
        );
        try {
          sessionStorage.setItem(
            "trial-resume-shown.v1",
            String(trial.winCount),
          );
        } catch {}
      }
    }
    if (typeof window !== "undefined") {
      try {
        const reason = localStorage.getItem("pending-reload-toast.v1");
        if (reason) {
          localStorage.removeItem("pending-reload-toast.v1");
          addNotification("info", reason);
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
