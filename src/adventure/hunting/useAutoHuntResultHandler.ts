"use client";

import { useEffect, useState } from "react";
import { getQuestById } from "@/adventure/data/quests";
import { getTitle } from "@/adventure/data/titles";
import { AUTO_HUNT_RESULT_KEY } from "@/adventure/battle/autoHunt";
import { fmtHuntDuration } from "@/adventure/battle/AutoHuntResultModal";
import {
  summarizeOfflineResult,
  type OfflineSimResult,
} from "@/adventure/battle/offlineSim";
import type { useNavTabs } from "@/lib/useNavTabs";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

// 자동 사냥(원정) 수령 → collect 가 sessionStorage 에 결과 박고 reload. 마운트 시 여기서 읽어
// 모달 표시 + 토스트만 처리. KV mutation 은 서버가 같은 트랜잭션 안에서 끝낸 상태:
//   - adventure-log.v2 (monsters[].kills · titles.first_blood · battleLosses)
//   - quest-progress.v2 (kill 계열 의뢰 진행 + active→ready 전환)
// 클라는 reload 직후 fresh 하이드레이션으로 자동 반영되고, 신규 ready 의뢰 / 신규 칭호 만 별도
// 토스트로 안내한다 (이 정보는 reload 전 sessionStorage 페이로드에 동봉).
export function useAutoHuntResultHandler(deps: {
  replaceLocation: ReturnType<typeof useNavTabs>["replaceLocation"];
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}): { autoHuntResult: OfflineSimResult | null; dismiss: () => void } {
  const { replaceLocation, addNotification } = deps;
  const [autoHuntResult, setAutoHuntResult] = useState<OfflineSimResult | null>(
    null,
  );

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(AUTO_HUNT_RESULT_KEY);
      if (raw) sessionStorage.removeItem(AUTO_HUNT_RESULT_KEY);
    } catch {}
    if (!raw) return;

    // sessionStorage 페이로드는 두 가지 모양을 허용한다:
    //  - 신: `{ result, replayed, readyQuestIds?, grantedTitleIds? }`
    //  - 구: OfflineSimResult 자체 — 이전 버전 빌드가 남긴 잔여물 (replayed=false 취급)
    // replay 케이스엔 readyQuestIds/grantedTitleIds 가 비어있다 — lastClaimResult 캐시엔
    // 진행도 델타가 없으므로 토스트도 생략.
    let result: OfflineSimResult;
    let readyQuestIds: string[] = [];
    let grantedTitleIds: string[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "result" in (parsed as Record<string, unknown>)
      ) {
        const obj = parsed as {
          result: OfflineSimResult;
          replayed?: boolean;
          readyQuestIds?: unknown;
          grantedTitleIds?: unknown;
        };
        result = obj.result;
        if (Array.isArray(obj.readyQuestIds)) {
          readyQuestIds = obj.readyQuestIds.filter(
            (v): v is string => typeof v === "string",
          );
        }
        if (Array.isArray(obj.grantedTitleIds)) {
          grantedTitleIds = obj.grantedTitleIds.filter(
            (v): v is string => typeof v === "string",
          );
        }
      } else {
        result = parsed as OfflineSimResult;
      }
    } catch {
      return;
    }

    for (const id of grantedTitleIds) {
      const title = getTitle(id);
      if (title) addNotification("milestone", `칭호 획득 — ${title.name}`);
    }
    for (const id of readyQuestIds) {
      const quest = getQuestById(id);
      if (quest) {
        addNotification(
          "quest_ready",
          `의뢰 조건 달성 — ${quest.title}: 길드에서 보상을 받을 수 있다.`,
        );
      }
    }

    if (result.died) replaceLocation("town", "healing");
    const summary = summarizeOfflineResult(result);
    addNotification(
      "expedition",
      `자동 사냥 ${fmtHuntDuration(result.simulatedMs)}${summary ? ` — ${summary}` : ""}${result.died ? " (사망)" : ""}`,
    );
    // sessionStorage(외부) 에서 가져온 1회성 결과 → 모달 state 로 동기화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoHuntResult(result);
    // 빈 deps — 마운트 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { autoHuntResult, dismiss: () => setAutoHuntResult(null) };
}
