"use client";

import { useCallback, useRef, useState } from "react";
import { HuntResult } from "@/adventure/v2/HuntResultCard";
import { MAX_STAMINA, type StaminaState } from "@/adventure/v2/stamina";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// PR-4b — 전투 전 내구도 게이트(409) 응답 형태.
type LowEquipmentEntry = {
  id: V2EquipmentId;
  durability: number;
  repairCost: number;
};

// hunt API 응답 — UI 기록용 + replay 용 추가 필드.
export type HuntResultPayload = HuntResult & {
  replay?: ReplayPayload;
  startPlayerHp?: number;
  expForBar?: number;
  maxExpForBar?: number;
  // 충전식 회복약 잔량 (사냥 후 자동 소모 반영) — 전투 화면 캐릭터 정보 표기용.
  hpCharges?: number;
  mpCharges?: number;
  // PR-4b — 마모/자동수리 후 장착 장비 내구도 + 자동수리 비용(0=안 함).
  equipmentDurability?: Partial<Record<V2EquipmentId, number>>;
  autoRepairSpent?: number;
};

type HuntResponse = {
  ok?: boolean;
  stamina?: StaminaState;
  error?: string;
  result?: HuntResultPayload;
  // PR-4b durability_low (409) 추가 필드.
  lowEquipment?: LowEquipmentEntry[];
  totalRepairCost?: number;
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
  // PR-4b — 한 번 내구도 프롬프트에 "그대로 진행" 응답하면 세션 내내 재프롬프트 안 함.
  const durabilityAckedRef = useRef(false);

  const pushLog = useCallback((line: string) => {
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 10),
    );
  }, []);

  // hunt 결과를 리턴 — caller(batch 모드 등) 가 직접 누적 가능. 실패 시 null.
  const hunt = useCallback(
    async (floor: number): Promise<HuntResultPayload | null> => {
      setBusy(true);
      setLastResult(null);
      try {
        return await doHunt(floor, durabilityAckedRef.current);
      } catch (err) {
        pushLog(`✗ network: ${(err as Error).message}`);
        return null;
      } finally {
        setBusy(false);
      }

      // 내부 — confirmLow 로 게이트 우회 여부 제어. durability_low(409) 시 프롬프트 후 재귀.
      async function doHunt(
        f: number,
        confirmLow: boolean,
      ): Promise<HuntResultPayload | null> {
        const res = await fetch("/api/v2/dungeon/hunt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            floor: f,
            outpostId,
            confirmLowDurability: confirmLow,
          }),
        });
        let json: HuntResponse | null = null;
        try {
          json = (await res.json()) as HuntResponse;
        } catch {
          pushLog(`✗ http ${res.status} (응답 JSON 아님)`);
          return null;
        }
        if (!json) {
          pushLog(`✗ http ${res.status} (빈 응답)`);
          return null;
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
            const repairNote = r.autoRepairSpent
              ? ` · 자동수리 -${r.autoRepairSpent}G`
              : "";
            pushLog(
              `✓ ${r.floor}층 ${r.enemyName} ${verdict} (${r.turns}턴) · ${hpStr} · EXP +${r.expGained} · GOLD +${r.goldGained}${r.goldTaxed ? ` (세금 ${r.goldTaxed} 차감, 총 ${r.goldGross})` : ""}${levelUp}${formatDrops(r.drops)}${repairNote} · 스태미너 ${cur}/${MAX_STAMINA}`,
            );
            return r;
          }
          pushLog(`✓ ${f}층 사냥 1회 — 스태미너 ${cur}/${MAX_STAMINA}`);
          return null;
        }
        // PR-4b — 전투 전 내구도 경고. 수리 후 진행 / 그대로 진행 프롬프트.
        if (json.error === "durability_low") {
          const low = json.lowEquipment ?? [];
          const total = json.totalRepairCost ?? 0;
          const names = low
            .map((e) => `${V2_EQUIPMENT[e.id]?.name ?? e.id}(${e.durability})`)
            .join(", ");
          const repair = window.confirm(
            `장비 내구도가 낮습니다: ${names}\n` +
              `전체 수리 비용 ${total.toLocaleString()}G\n\n` +
              `확인 = 수리 후 진행 / 취소 = 그대로 진행`,
          );
          if (repair) {
            const rr = await fetch("/api/v2/me/equipment/repair", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ all: true }),
            });
            const rj = (await rr.json().catch(() => null)) as {
              ok?: boolean;
              spent?: number;
              error?: string;
            } | null;
            if (rj?.ok) pushLog(`✓ 장비 수리 (-${(rj.spent ?? 0).toLocaleString()}G)`);
            else pushLog(`✗ 수리 실패: ${rj?.error ?? `http ${rr.status}`}`);
          } else {
            // 그대로 진행 — 세션 동안 재프롬프트 안 함.
            durabilityAckedRef.current = true;
          }
          // 재시도 — 수리했으면 게이트 통과, 안 했으면 confirm 으로 우회.
          return await doHunt(f, true);
        }
        const err = json.error ?? "unknown";
        const errLabel =
          err === "policy_blocked"
            ? "policy_blocked (점령 길드가 자길드 멤버에게만 개방 중)"
            : err === "hp_zero"
              ? "체력이 부족합니다 — 치료소에서 회복하거나 잠시 기다린 뒤 다시 시도하세요 (스태미너 미소모)"
              : err;
        const after = json.stamina
          ? ` (스태미너 ${json.stamina.current}/${MAX_STAMINA})`
          : "";
        pushLog(`✗ http ${res.status} ${errLabel}${after}`);
        return null;
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
