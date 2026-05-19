"use client";

import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useParagonState } from "@/adventure/character/useParagonState";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";
import type { QuestRewardOutcome } from "@/lib/server/questReward";

// 퀘스트 수락/보상 지급 핸들러 묶음 — NPC 다이얼로그·길드 게시판 공용.
// EPIC #3-2 (2026-05-19): 보상은 `/api/quests/claim` 가 권위. 클라는 readiness 만
// 동기 검사하고 (다이얼로그 close 등 즉시 분기를 위해) 서버 호출은 background 로 실행.
// 응답으로 받은 saves 를 각 hook 의 replaceFromSaved 로 통째 교체.
//
// 시그니처는 의도적으로 sync `(id) => boolean` 유지 — 40+ 호출자(다이얼로그/길드 게시판)
// 가 `if (completeQuest(id)) onClose()` 패턴이라 비-침투적 마이그레이션이 가능. 서버는
// state==='ready' 두 번째 호출에 applied:false + 현 saves 그대로로 응답하므로 retry 안전.
export function useQuestActions(deps: {
  quests: ReturnType<typeof useQuests>;
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  paragon: ReturnType<typeof useParagonState>;
  crafting: ReturnType<typeof useCrafting>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  adventureLog: ReturnType<typeof useAdventureLog>;
  grantTitle: (titleId: string) => void;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}) {
  const {
    quests,
    inventory,
    characterStateHook,
    paragon,
    crafting,
    storyFlags,
    adventureLog,
    grantTitle,
    addNotification,
  } = deps;
  const remote = useRemoteSave();

  const handleAcceptQuest = (id: string) => {
    quests.accept(id);
  };

  const completeQuest = (id: string): boolean => {
    // 클라 readiness — quests.claim 은 EPIC #3-2 후 state 검사만 한다.
    // not-ready 면 sync false 반환 (다이얼로그 분기). ready 면 background 서버 호출 시작.
    const result = quests.claim(id);
    if (!result.ok) return false;

    void (async () => {
      try {
        await remote.flush();
        const sessionId = readDeviceSessionId();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (sessionId) headers["X-Session-Id"] = sessionId;
        let res: Response;
        try {
          res = await fetch("/api/quests/claim", {
            method: "POST",
            headers,
            body: JSON.stringify({ questId: id }),
          });
        } catch {
          addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
          return;
        }
        if (res.status === 401 || res.status === 410) return;
        const data = (await res.json().catch(() => null)) as
          | { ok: true; data: QuestRewardOutcome }
          | { ok: false; error: string }
          | null;
        if (!data || data.ok === false) {
          addNotification("info", "보상 수령에 실패했다.");
          return;
        }
        const outcome = data.data;

        // 1) saves 통째 교체 — applied 여부와 무관 (idempotent retry 도 latest 로 자가 수렴).
        if (outcome.saves["character.v2"] !== undefined) {
          characterStateHook.replaceFromSaved(outcome.saves["character.v2"]);
        }
        if (outcome.saves["inventory.v2"] !== undefined) {
          inventory.replaceFromSaved(outcome.saves["inventory.v2"]);
        }
        if (outcome.saves[STORY_FLAGS_STORAGE_KEY] !== undefined) {
          storyFlags.replaceFromSaved(outcome.saves[STORY_FLAGS_STORAGE_KEY]);
        }
        if (outcome.saves["adventure-log.v2"] !== undefined) {
          adventureLog.replaceFromSaved(outcome.saves["adventure-log.v2"]);
        }
        if (outcome.saves["quest-progress.v2"] !== undefined) {
          quests.replaceFromSaved(outcome.saves["quest-progress.v2"]);
        }
        if (outcome.saves["crafting.v2"] !== undefined) {
          crafting.replaceFromSaved(outcome.saves["crafting.v2"]);
        }
        if (outcome.saves["paragon.v1"] !== undefined) {
          paragon.replaceFromSaved(outcome.saves["paragon.v1"]);
        }

        if (!outcome.applied) return; // retry idempotent — 토스트 생략.

        // 2) quest_complete 토스트 — 메인 보상 토큰 (칭호는 별도 milestone 토스트).
        addNotification(
          "quest_complete",
          outcome.tokens.length > 0
            ? `${outcome.questTitle} 완료 — ${outcome.tokens.join(", ")}`
            : `${outcome.questTitle} 완료`,
        );

        // 3) 신규 칭호 — grantTitle 이 milestone 토스트 + 잔영 컬렉션 체인 처리.
        //    saves 의 titles 는 이미 박혀 있어 grantTitle 의 idempotent 가드는 다음 렌더
        //    이후엔 발동하지만, 현재 콜백 클로저는 pre-replace adventureLog.log 를 캡처해
        //    있어 첫 호출은 토스트가 정상 출력된다 (coop 패턴 동일).
        for (const titleId of outcome.grantedTitleIds) {
          grantTitle(titleId);
        }
      } catch (e) {
        console.error("[quests.claim]", e);
        addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
      }
    })();

    return true;
  };

  const handleClaimQuest = (id: string) => {
    completeQuest(id);
  };

  return { handleAcceptQuest, completeQuest, handleClaimQuest };
}
