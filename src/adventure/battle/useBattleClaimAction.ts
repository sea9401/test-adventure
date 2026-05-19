"use client";

// 솔로 전투 승리 보상 서버 액션 (EPIC #3-3 Phase 1). 클라는 encounterId + 기본 stat 만
// 보내고 서버가 deterministic seed 로 드랍 RNG 굴리고 EXP/gold/HP-regen 까지 적용.
// 응답으로 받은 saves 4종을 각 hook 의 replaceFromSaved 로 통째 교체.

import { useCallback } from "react";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useParagonState } from "@/adventure/character/useParagonState";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import type { BattleClaimOutcome } from "@/lib/server/battleClaim";

type Deps = {
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  crafting: ReturnType<typeof useCrafting>;
  paragon: ReturnType<typeof useParagonState>;
};

type ClaimInput = {
  encounterId: string;
  enemyName: string;
  finalPlayerHp: number;
  playerMaxHp: number;
  isBoss: boolean;
};

export function useBattleClaimAction(deps: Deps) {
  const { inventory, characterStateHook, crafting, paragon } = deps;
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
        res = await fetch("/api/battle/claim-victory", {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        });
      } catch {
        return null;
      }
      if (res.status === 401 || res.status === 410) return null;
      const data = (await res.json().catch(() => null)) as
        | { ok: true; data: BattleClaimOutcome }
        | { ok: false; error: string }
        | null;
      if (!data || data.ok === false) return null;
      const outcome = data.data;
      // saves 통째 교체 — applied 여부 무관 (Phase 1 은 dedup 미구현이라 항상 applied=true).
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
      return outcome;
    },
    [remote, characterStateHook, inventory, crafting, paragon],
  );

  return { claim };
}
