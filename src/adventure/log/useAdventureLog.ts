"use client";

import { useCallback, useState } from "react";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import {
  emptyAdventureLog,
  migrateMonsters,
  migrateTitles,
  type AdventureLog,
} from "./storage";
import { currentlyHeldVariants } from "./discoveredEquipment";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import type { EquippedSlots } from "@/adventure/character/types";

function readInitial(raw: unknown): AdventureLog {
  if (!raw || typeof raw !== "object") return emptyAdventureLog();
  const parsed = raw as Partial<AdventureLog>;
  return {
    monsters: migrateMonsters(parsed.monsters ?? {}),
    towns: parsed.towns ?? {},
    npcs: parsed.npcs ?? {},
    titles: migrateTitles(parsed.titles ?? {}),
    discoveredEquipment: parsed.discoveredEquipment ?? {},
    battleLosses: parsed.battleLosses ?? 0,
    chatCount: parsed.chatCount ?? 0,
    healingCount: parsed.healingCount ?? 0,
    noDamageWins: parsed.noDamageWins ?? 0,
    compendiumPointsClaimed: parsed.compendiumPointsClaimed ?? 0,
  };
}

export function useAdventureLog() {
  const initial = useSavedValue("adventure-log.v2");
  const [log, setLog] = useState<AdventureLog>(() => readInitial(initial));
  useRemotePatch("adventure-log.v2", log);

  const markEncountered = useCallback((monsterName: string) => {
    setLog((prev) => {
      const existing = prev.monsters[monsterName];
      if (existing?.encountered) return prev;
      return {
        ...prev,
        monsters: {
          ...prev.monsters,
          [monsterName]: {
            encountered: true,
            kills: existing?.kills ?? 0,
            firstSeenAt: existing?.firstSeenAt ?? Date.now(),
            lastKilledAt: existing?.lastKilledAt,
          },
        },
      };
    });
  }, []);

  const addKill = useCallback((monsterName: string) => {
    setLog((prev) => {
      const existing = prev.monsters[monsterName] ?? {
        encountered: true,
        kills: 0,
        firstSeenAt: Date.now(),
      };
      return {
        ...prev,
        monsters: {
          ...prev.monsters,
          [monsterName]: {
            ...existing,
            encountered: true,
            kills: existing.kills + 1,
            lastKilledAt: Date.now(),
          },
        },
      };
    });
  }, []);

  const markRegionVisited = useCallback((regionId: string) => {
    setLog((prev) => {
      const existing = prev.towns[regionId];
      if (existing?.visited) return prev;
      return {
        ...prev,
        towns: {
          ...prev.towns,
          [regionId]: {
            visited: true,
            firstVisitedAt: existing?.firstVisitedAt ?? Date.now(),
            npcsTalkedTo: existing?.npcsTalkedTo ?? [],
          },
        },
      };
    });
  }, []);

  const addTownNpcTalked = useCallback(
    (regionId: string, npcId: string) => {
      setLog((prev) => {
        const existing = prev.towns[regionId] ?? {
          visited: true,
          firstVisitedAt: Date.now(),
          npcsTalkedTo: [],
        };
        if (existing.npcsTalkedTo.includes(npcId)) return prev;
        return {
          ...prev,
          towns: {
            ...prev.towns,
            [regionId]: {
              ...existing,
              npcsTalkedTo: [...existing.npcsTalkedTo, npcId],
            },
          },
        };
      });
    },
    [],
  );

  const incrementNpcTalk = useCallback((npcId: string) => {
    setLog((prev) => {
      const existing = prev.npcs[npcId];
      return {
        ...prev,
        npcs: {
          ...prev.npcs,
          [npcId]: {
            talkCount: (existing?.talkCount ?? 0) + 1,
            firstTalkAt: existing?.firstTalkAt ?? Date.now(),
          },
        },
      };
    });
  }, []);

  // 누적 패배 카운트 +1 — 칭호/통계용.
  const incrementBattleLosses = useCallback(() => {
    setLog((prev) => ({
      ...prev,
      battleLosses: (prev.battleLosses ?? 0) + 1,
    }));
  }, []);

  // 누적 채팅 발화 +1 — '수다쟁이' 칭호용.
  const incrementChatCount = useCallback(() => {
    setLog((prev) => ({
      ...prev,
      chatCount: (prev.chatCount ?? 0) + 1,
    }));
  }, []);

  // 누적 치료소 이용 +1 — '환자' 칭호용.
  const incrementHealingCount = useCallback(() => {
    setLog((prev) => ({
      ...prev,
      healingCount: (prev.healingCount ?? 0) + 1,
    }));
  }, []);

  // 누적 무피해 승리 +1 — 광살참 스킬북 100회 업적용.
  const incrementNoDamageWin = useCallback(() => {
    setLog((prev) => ({
      ...prev,
      noDamageWins: (prev.noDamageWins ?? 0) + 1,
    }));
  }, []);

  // 모험의 서 등록 마일스톤(20개당 단련 +1) 보상 수령 — claimed += n.
  // n 만큼 단련 포인트를 실제로 더하는 건 호출부(training.addPoints) 책임.
  const addCompendiumClaimed = useCallback((n: number) => {
    if (n <= 0) return;
    setLog((prev) => ({
      ...prev,
      compendiumPointsClaimed: (prev.compendiumPointsClaimed ?? 0) + n,
    }));
  }, []);

  // 관리자용 — claimed 값을 직접 덮어쓴다. 음수 방어.
  const setCompendiumClaimed = useCallback((n: number) => {
    setLog((prev) => ({
      ...prev,
      compendiumPointsClaimed: Math.max(0, Math.floor(n)),
    }));
  }, []);

  // 장비 도감 동기화 — 현재 인벤토리/장착 중인 모든 (장비, 변형)을 도감에 등록(있으면 그대로).
  // 폐기/판매로 빠진 항목은 절대 제거하지 않는다. 인벤토리 변경/장착 변경 때마다 호출(idempotent).
  const syncDiscoveredEquipment = useCallback(
    (inv: InventoryState, equipped: EquippedSlots | null | undefined) => {
      const held = currentlyHeldVariants(inv, equipped);
      if (held.size === 0) return;
      setLog((prev) => {
        const cur = prev.discoveredEquipment ?? {};
        let changed = false;
        const next: NonNullable<AdventureLog["discoveredEquipment"]> = { ...cur };
        const now = Date.now();
        for (const [id, keys] of held) {
          const existing = cur[id];
          const known = new Set(existing?.variants ?? []);
          let added = false;
          for (const k of keys) {
            if (!known.has(k)) {
              known.add(k);
              added = true;
            }
          }
          if (!existing) {
            next[id] = { firstSeenAt: now, variants: [...known] };
            changed = true;
          } else if (added) {
            next[id] = { ...existing, variants: [...known] };
            changed = true;
          }
        }
        if (!changed) return prev;
        return { ...prev, discoveredEquipment: next };
      });
    },
    [],
  );

  // 칭호 획득 — 도감 등록은 "획득 시"가 트리거. 이미 등록된 경우 중복 무시.
  const markTitleObtained = useCallback((titleId: string) => {
    setLog((prev) => {
      if (prev.titles[titleId]) return prev;
      return {
        ...prev,
        titles: {
          ...prev.titles,
          [titleId]: { obtainedAt: Date.now() },
        },
      };
    });
  }, []);

  // 서버 권위 액션 (코옵 claim 등) 의 응답으로 받은 adventure-log.v2 값으로 통째 교체.
  // useRemotePatch 가 이후 동일 값을 다시 PATCH 하지만 서버 version 과 409 재시도로 자가 수렴.
  const replaceFromSaved = useCallback((raw: unknown) => {
    setLog(readInitial(raw));
  }, []);

  return {
    log,
    hydrated: true,
    markEncountered,
    addKill,
    markRegionVisited,
    addTownNpcTalked,
    incrementNpcTalk,
    markTitleObtained,
    syncDiscoveredEquipment,
    incrementBattleLosses,
    incrementChatCount,
    incrementHealingCount,
    incrementNoDamageWin,
    addCompendiumClaimed,
    setCompendiumClaimed,
    replaceFromSaved,
  };
}
