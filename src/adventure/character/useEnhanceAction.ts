"use client";

// 별빛 무구 +1 강화 시도 — 서버 권위. 클라는 instanceId + mode 만 보내고, 서버가
// inventory.v2 를 잠그고 검증·RNG 굴림·적용한 새 값을 받아 in-memory state 를 replace.
//
// 사전 검사(보유 단계/조각/가능 횟수)는 UX 용 — 라운드트립 전에 부족분 안내. 권한은 서버.

import { ITEMS } from "@/adventure/data/items";
import {
  ENHANCE_GOLD_COST,
  ENHANCE_MAX_LEVEL,
  ENHANCE_MODE_SPEC,
  ENHANCE_SHARD_COST,
  type EnhanceMode,
} from "@/adventure/character/enhancement";
import type { useInventory } from "@/adventure/inventory/useInventory";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

const ENHANCE_ERROR_LABELS: Record<string, string> = {
  instance_not_found: "강화할 장비를 찾지 못했다.",
  not_enhanceable: "강화할 수 없는 장비다.",
  max_level: "이미 최대 단계다.",
  insufficient_shards: "별빛 조각이 부족하다.",
  insufficient_gold: "골드가 부족하다.",
  no_attempts: "이 자루는 더 강화할 수 없다 (가능 횟수가 다했다).",
  invalid_mode: "강화 모드가 잘못됐다.",
  invalid_instance_id: "강화할 장비를 찾지 못했다.",
};

export function useEnhanceAction(deps: {
  inventory: ReturnType<typeof useInventory>;
  /** 골드 사전검사용 — 현재 보유 골드. 권한은 서버. */
  gold: number;
  /** 강화 골드 차감이 반영된 character.v2 를 적용 — 잔액 갱신. */
  replaceCharacterFromSaved: (saved: unknown) => void;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}) {
  const { inventory, gold, replaceCharacterFromSaved, addNotification } = deps;
  const remote = useRemoteSave();

  const handleEnhance = async (instanceId: string, mode: EnhanceMode) => {
    // UX 사전 검사 — 서버도 같은 검사를 다시 한다.
    const inst = inventory.findEquipmentInstance(instanceId);
    if (!inst) {
      addNotification("info", "강화할 장비를 찾지 못했다.");
      return;
    }
    if (inst.enhancementLevel >= ENHANCE_MAX_LEVEL) {
      addNotification("info", "이미 최대 단계다.");
      return;
    }
    if (inst.remainingAttempts <= 0) {
      addNotification(
        "info",
        "이 자루는 더 강화할 수 없다 (가능 횟수가 다했다).",
      );
      return;
    }
    const spec = ENHANCE_MODE_SPEC[mode];
    if (!spec) {
      addNotification("info", "강화 모드가 잘못됐다.");
      return;
    }
    const toLevel = inst.enhancementLevel + 1;
    const cost = ENHANCE_SHARD_COST[toLevel] ?? 0;
    const have = inventory.state.materials.starfall_shard ?? 0;
    if (have < cost) {
      addNotification(
        "info",
        `별빛 조각이 부족하다 — ${cost}개 필요 (보유 ${have}).`,
      );
      return;
    }
    const goldCost = ENHANCE_GOLD_COST[toLevel] ?? 0;
    if (gold < goldCost) {
      addNotification(
        "info",
        `골드가 부족하다 — ${goldCost.toLocaleString()} G 필요 (보유 ${gold.toLocaleString()}).`,
      );
      return;
    }

    // 디바운스 큐 flush — 서버가 stale 값 위에서 차감하지 않게.
    await remote.flush();
    let res: Response;
    try {
      const sessionId = readDeviceSessionId();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionId) headers["X-Session-Id"] = sessionId;
      res = await fetch("/api/enhance", {
        method: "POST",
        headers,
        body: JSON.stringify({ instanceId, mode }),
      });
    } catch {
      addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (res.status === 401 || res.status === 410) return;
    // jsonOk 는 `{ ok: true, ...outcome }` 로 spread — outcome 필드가 top-level.
    const data = (await res.json().catch(() => null)) as
      | {
          ok: true;
          inventory: unknown;
          character: unknown;
          toLevel: number;
          remainingAttempts: number;
          shardsSpent: number;
          goldSpent: number;
          success: boolean;
          mode: EnhanceMode;
        }
      | { ok: false; error: string }
      | null;
    if (!data) {
      addNotification("info", "강화에 실패했다.");
      return;
    }
    if (data.ok === false) {
      addNotification("info", ENHANCE_ERROR_LABELS[data.error] ?? "강화에 실패했다.");
      return;
    }
    inventory.replaceFromSaved(data.inventory);
    replaceCharacterFromSaved(data.character);
    const goldNote = data.goldSpent > 0 ? `, 골드 ${data.goldSpent.toLocaleString()} 소비` : "";
    const itemName = ITEMS[inst.itemId].name;
    if (data.success) {
      addNotification(
        "milestone",
        `${itemName}을(를) +${data.toLevel} 으로 강화했다. (별빛 조각 ${data.shardsSpent} 소비${goldNote}, ${spec.successPct}% 모드, 가능 횟수 ${data.remainingAttempts} 남음)`,
        {
          highlight: {
            name: `${itemName} +${data.toLevel}`,
            className: "text-amber-600 dark:text-amber-400",
          },
        },
      );
    } else {
      addNotification(
        "info",
        `${itemName} 강화 실패 — 가능 횟수 ${data.remainingAttempts} 남음. (별빛 조각 ${data.shardsSpent} 소비${goldNote}, ${spec.successPct}% 모드)`,
      );
    }
  };

  return { handleEnhance };
}
