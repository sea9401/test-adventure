"use client";

// 솔로 전투 승리 보상 서버 액션 (EPIC #3-3). 클라는 encounterId + 기본 stat 만 보내고
// 서버가 deterministic seed 로 드랍 RNG 굴리고 EXP/gold/HP-regen + 칭호/마일스톤/카운터
// 까지 적용 (Phase 1+2). 응답으로 받은 saves 6종을 각 hook 의 replaceFromSaved 로 통째 교체.

import { useCallback } from "react";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useParagonState } from "@/adventure/character/useParagonState";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useQuests } from "@/adventure/quests/useQuests";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import type { BattleClaimOutcome } from "@/lib/server/battleClaim";

type Deps = {
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  crafting: ReturnType<typeof useCrafting>;
  paragon: ReturnType<typeof useParagonState>;
  adventureLog: ReturnType<typeof useAdventureLog>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  quests: ReturnType<typeof useQuests>;
};

type ClaimInput = {
  encounterId: string;
  enemyName: string;
  finalPlayerHp: number;
  playerMaxHp: number;
  isBoss: boolean;
  bossRegionId?: string;
  damageTakenThisCombat: number;
  potionsConsumedTotal: number;
};

export function useBattleClaimAction(deps: Deps) {
  const {
    inventory,
    characterStateHook,
    crafting,
    paragon,
    adventureLog,
    storyFlags,
    quests,
  } = deps;
  const remote = useRemoteSave();

  const claim = useCallback(
    async (input: ClaimInput): Promise<BattleClaimOutcome | null> => {
      await remote.flush();
      const sessionId = readDeviceSessionId();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionId) headers["X-Session-Id"] = sessionId;
      let res: Response;
      try {
        const bossAttempt =
          input.isBoss && input.bossRegionId
            ? characterStateHook.getBossAttemptSnapshotToday(
                input.bossRegionId,
              )
            : null;
        res = await fetch("/api/battle/claim-victory", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...input,
            bossAttempt: bossAttempt
              ? { regionId: input.bossRegionId, ...bossAttempt }
              : undefined,
          }),
        });
      } catch {
        return null;
      }
      if (res.status === 401 || res.status === 410) return null;
      // jsonOk 는 `{ ok: true, ...outcome }` 로 spread 한다 (data 키 nested X). outcome 필드는
      // top-level 에 박혀 있다. 옛 코드의 `data.data` 가정은 항상 undefined 라 saves 접근에서
      // TypeError → 클라 상태가 갱신 안 됨 (서버는 정상 mutate, 새로고침해야 보이는 증상).
      const data = (await res.json().catch(() => null)) as
        | (BattleClaimOutcome & { ok: true })
        | { ok: false; error: string }
        | null;
      if (!data || data.ok === false) return null;
      const outcome = data;
      if (outcome.saves["character.v2"] !== undefined) {
        characterStateHook.replaceFromSaved(outcome.saves["character.v2"]);
      }
      if (outcome.saves["inventory.v2"] !== undefined) {
        inventory.replaceFromSaved(outcome.saves["inventory.v2"]);
      }
      if (outcome.saves["crafting.v2"] !== undefined) {
        crafting.replaceFromSaved(outcome.saves["crafting.v2"]);
      }
      if (outcome.saves["paragon.v1"] !== undefined) {
        paragon.replaceFromSaved(outcome.saves["paragon.v1"]);
      }
      if (outcome.saves["adventure-log.v2"] !== undefined) {
        adventureLog.replaceFromSaved(outcome.saves["adventure-log.v2"]);
      }
      if (outcome.saves[STORY_FLAGS_STORAGE_KEY] !== undefined) {
        storyFlags.replaceFromSaved(outcome.saves[STORY_FLAGS_STORAGE_KEY]);
      }
      if (outcome.saves["quest-progress.v2"] !== undefined) {
        quests.replaceFromSaved(outcome.saves["quest-progress.v2"]);
      }
      return outcome;
    },
    [
      remote,
      characterStateHook,
      inventory,
      crafting,
      paragon,
      adventureLog,
      storyFlags,
      quests,
    ],
  );

  return { claim };
}
