"use client";

import { useCallback, useState } from "react";
import { HuntResult } from "@/adventure/v2/HuntResultCard";
import { type StaminaState } from "@/adventure/v2/stamina";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// hunt API 응답 — UI 기록용 + replay 용 추가 필드.
export type HuntResultPayload = HuntResult & {
  replay?: ReplayPayload;
  startPlayerHp?: number;
  expForBar?: number;
  maxExpForBar?: number;
};

type HuntResponse = {
  ok?: boolean;
  stamina?: StaminaState;
  error?: string;
  result?: HuntResultPayload;
};

function formatDrops(
  drops: Partial<Record<V2MaterialId, number>> | undefined,
): string {
  if (!drops) return "";
  const parts: string[] = [];
  for (const [id, amount] of Object.entries(drops)) {
    if (!amount || amount <= 0) continue;
    const mat = V2_MATERIALS[id as V2MaterialId];
    parts.push(`${mat?.name ?? id} x${amount}`);
  }
  return parts.length ? ` · 드랍 ${parts.join(", ")}` : "";
}

// 던전 사냥 상태 + 호출 hook — DungeonHunt(dev) / V2DungeonFloorView 공유.
// stamina 는 controlled — caller 가 state/setter 보유 (전역 StaminaBar 와 sync).
// replay step-through 폐기 후 replayDone/replayPending 도 제거 — hunt 끝나면 즉시 결과 표시.
export function useDungeonHunt({
  outpostId,
  setStamina,
}: {
  outpostId?: string;
  setStamina: (s: StaminaState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<HuntResultPayload | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const pushLog = useCallback((line: string) => {
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 10),
    );
  }, []);

  const hunt = useCallback(
    async (floor: number) => {
      setBusy(true);
      setLastResult(null);
      try {
        const res = await fetch("/api/v2/dungeon/hunt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ floor, outpostId }),
        });
        let json: HuntResponse | null = null;
        try {
          json = (await res.json()) as HuntResponse;
        } catch {
          pushLog(`✗ http ${res.status} (응답 JSON 아님)`);
          return;
        }
        if (!json) {
          pushLog(`✗ http ${res.status} (빈 응답)`);
          return;
        }
        if (json.stamina) setStamina(json.stamina);
        if (json.ok === true) {
          const cur = json.stamina?.current ?? "?";
          const r = json.result;
          if (r) {
            setLastResult(r);
            const verdict = r.won ? "승리" : "패배";
            const levelUp =
              r.levelsGained > 0 ? ` · 레벨 +${r.levelsGained}` : "";
            const hpStr = `HP ${r.hpBefore}→${r.hpAfter}/${r.maxHp}`;
            pushLog(
              `✓ ${r.floor}층 ${r.enemyName} ${verdict} (${r.turns}턴) · ${hpStr} · EXP +${r.expGained} · GOLD +${r.goldGained}${r.goldTaxed ? ` (세금 ${r.goldTaxed} 차감, 총 ${r.goldGross})` : ""}${levelUp}${formatDrops(r.drops)} · 스태미너 ${cur}/200`,
            );
          } else {
            pushLog(`✓ ${floor}층 사냥 1회 — 스태미너 ${cur}/200`);
          }
        } else {
          const err = json.error ?? "unknown";
          const errLabel =
            err === "policy_blocked"
              ? "policy_blocked (점령 길드가 자길드 멤버에게만 개방 중)"
              : err;
          const after = json.stamina
            ? ` (스태미너 ${json.stamina.current}/200)`
            : "";
          pushLog(`✗ http ${res.status} ${errLabel}${after}`);
        }
      } catch (err) {
        pushLog(`✗ network: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [outpostId, pushLog, setStamina],
  );

  return {
    busy,
    lastResult,
    log,
    hunt,
  };
}
