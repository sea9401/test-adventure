"use client";

// NPC 대화 1회성 보상 — 서버 권위. 클라는 dialogueId 만 보내고 서버 mutator 가 character/
// inventory/storyFlags 를 트랜잭션 안에서 mutate. 응답으로 받은 saves 를 각 hook 의
// replaceFromSaved 로 통째 교체.
//
// 이미 storyFlag 박혀 있어 idempotent 응답을 받은 경우(첫 응답 손실 후 retry 등) 도
// saves 통째 교체로 자가 수렴.

import { useCallback } from "react";
import type { DialogueRewardId } from "@/adventure/data/dialogueRewards";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

type Deps = {
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
};

type ClaimOptions = {
  /** 적용 성공 후 호출 — dialogue 닫기 등. applied=false (idempotent retry) 여도 호출. */
  onSuccess?: () => void;
};

export function useDialogueRewardAction(deps: Deps) {
  const { inventory, characterStateHook, storyFlags, addNotification } = deps;
  const remote = useRemoteSave();

  const claim = useCallback(
    async (dialogueId: DialogueRewardId, opts: ClaimOptions = {}) => {
      await remote.flush();
      let res: Response;
      try {
        const sessionId = readDeviceSessionId();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (sessionId) headers["X-Session-Id"] = sessionId;
        res = await fetch("/api/npc/dialogue-reward", {
          method: "POST",
          headers,
          body: JSON.stringify({ dialogueId }),
        });
      } catch {
        addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (res.status === 401 || res.status === 410) return;
      const data = (await res.json().catch(() => null)) as
        | {
            ok: true;
            applied: boolean;
            saves: {
              "character.v2"?: unknown;
              "inventory.v2"?: unknown;
              "storyFlags.v2"?: unknown;
            };
          }
        | { ok: false; error: string }
        | null;
      if (!data || data.ok === false) {
        addNotification("info", "보상 수령에 실패했다.");
        return;
      }
      // saves 통째 교체 — applied 여부와 무관 (idempotent retry 도 latest 로 자가 수렴).
      if (data.saves["character.v2"] !== undefined) {
        characterStateHook.replaceFromSaved(data.saves["character.v2"]);
      }
      if (data.saves["inventory.v2"] !== undefined) {
        inventory.replaceFromSaved(data.saves["inventory.v2"]);
      }
      if (data.saves[STORY_FLAGS_STORAGE_KEY] !== undefined) {
        storyFlags.replaceFromSaved(data.saves[STORY_FLAGS_STORAGE_KEY]);
      }
      opts.onSuccess?.();
    },
    [remote, characterStateHook, inventory, storyFlags, addNotification],
  );

  return { claim };
}
