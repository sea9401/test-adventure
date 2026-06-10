"use client";

import { useCallback, useState } from "react";
import { HuntResult } from "@/adventure/v2/HuntResultCard";
import { MAX_STAMINA, type StaminaState } from "@/adventure/v2/stamina";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

// hunt API 응답 — UI 기록용 + replay 용 추가 필드.
export type HuntResultPayload = HuntResult & {
  replay?: ReplayPayload;
  startPlayerHp?: number;
  expForBar?: number;
  maxExpForBar?: number;
  // 사냥 후 EXP/maxExp — 일괄 사냥 합산 결과 아래 캐릭터 정보 카드의 EXP 바용
  // (expForBar 는 사냥 "전" 값이라 마지막 1회분이 빠진다 — 여기로 현재 진행도 표기).
  expAfter?: number;
  maxExpAfter?: number;
  // 충전식 회복약 잔량 (사냥 후 자동 소모 반영) — 전투 화면 캐릭터 정보 표기용.
  hpCharges?: number;
  mpCharges?: number;
  // 레벨업으로 오른 maxHp/maxMp (레벨 고정분 + VIT/INT) — 결과 카드 표기용.
  hpGain?: number;
  mpGain?: number;
  // 테마 보스 도전 결과 — 결과 카드 보스 연출(전용 유니크·첫처치 칭호)용.
  isBoss?: boolean;
  bossFirstKill?: boolean;
};

type HuntResponse = {
  ok?: boolean;
  stamina?: StaminaState;
  error?: string;
  result?: HuntResultPayload;
};

// 일괄(batch) 사냥 응답 — 서버가 N회를 한 번에 돌리고 합산해서 돌려준다.
// BatchSummary(표시용) 필드 + 클라 부수효과용(최종 HP/깊이/EXP).
export type BatchHuntPayload = {
  attempted: number;
  completed: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalProficiency: number;
  totalGold: number;
  totalGoldGross: number; // 세전 합산 — 결과 카드 세금 줄 표기용.
  totalGoldTaxed: number;
  taxOwnerLabel?: string; // 세금 수취자 — 세금 있을 때만 서버가 채움.
  levelsGained: number;
  statGains: Partial<Record<V2StatKey, number>>;
  // 일괄 동안 레벨업으로 오른 maxHp/maxMp 합산 — 결과 카드 표기용.
  hpGained: number;
  mpGained: number;
  drops: Partial<Record<V2MaterialId, number>>;
  droppedEquipments: V2EquipmentId[];
  droppedUniques: V2EquipmentId[];
  stoppedReason: "stamina" | "death" | "recovery" | "error" | null;
  finalHpAfter: number | null;
  finalMaxHp: number | null;
  finalMaxDepth: number | null;
  expAfter: number | null;
  maxExpAfter: number | null;
  // 합산 결과 아래 캐릭터 정보 카드용 — 마지막 사냥 후 회복약 충전량 + MP 보유 여부.
  hpCharges: number | null;
  mpCharges: number | null;
  playerMaxMp: number | null;
};

type BatchHuntResponse = {
  ok?: boolean;
  stamina?: StaminaState;
  error?: string;
  batch?: BatchHuntPayload;
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

  // hunt 결과를 리턴 — caller(batch 모드 등) 가 직접 누적 가능. 실패 시 null.
  const hunt = useCallback(
    async (
      floor: number,
      boss = false,
    ): Promise<HuntResultPayload | null> => {
      setBusy(true);
      setLastResult(null);
      try {
        return await doHunt(floor);
      } catch (err) {
        pushLog(`✗ network: ${(err as Error).message}`);
        return null;
      } finally {
        setBusy(false);
      }

      async function doHunt(f: number): Promise<HuntResultPayload | null> {
        const res = await fetch("/api/v2/dungeon/hunt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            floor: f,
            outpostId,
            ...(boss ? { boss: true } : {}),
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
            const prof =
              (r.proficiencyGained ?? 0) > 0
                ? ` · 숙달 포인트 +${r.proficiencyGained}`
                : "";
            const hpStr = `HP ${r.hpBefore}→${r.hpAfter}/${r.maxHp}`;
            pushLog(
              `✓ ${r.floor}층 ${r.enemyName} ${verdict} (${r.turns}턴) · ${hpStr} · EXP +${r.expGained}${prof} · GOLD +${r.goldGained}${r.goldTaxed ? ` (세금 ${r.goldTaxed} 차감${r.taxOwnerLabel ? ` → ${r.taxOwnerLabel}` : ""}, 총 ${r.goldGross})` : ""}${levelUp}${formatDrops(r.drops)} · 스태미너 ${cur}/${MAX_STAMINA}`,
            );
            return r;
          }
          pushLog(`✓ ${f}층 사냥 1회 — 스태미너 ${cur}/${MAX_STAMINA}`);
          return null;
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

  // 일괄 사냥 — 서버에서 count 회를 한 트랜잭션으로 처리(한 왕복). 합산 결과 반환, 실패 시 null.
  const huntBatch = useCallback(
    async (floor: number, count: number): Promise<BatchHuntPayload | null> => {
      setBusy(true);
      setLastResult(null);
      try {
        const res = await fetch("/api/v2/dungeon/hunt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ floor, count, outpostId }),
        });
        let json: BatchHuntResponse | null = null;
        try {
          json = (await res.json()) as BatchHuntResponse;
        } catch {
          pushLog(`✗ http ${res.status} (응답 JSON 아님)`);
          return null;
        }
        if (!json) {
          pushLog(`✗ http ${res.status} (빈 응답)`);
          return null;
        }
        if (json.stamina) setStamina(json.stamina);
        if (json.ok === true && json.batch) {
          const b = json.batch;
          const cur = json.stamina?.current ?? "?";
          pushLog(
            `✓ 일괄 ${b.completed}/${b.attempted}회 · 승 ${b.wins}/패 ${b.losses} · EXP +${b.totalExp} · GOLD +${b.totalGold}${b.totalGoldTaxed ? ` (세금 ${b.totalGoldTaxed} 차감${b.taxOwnerLabel ? ` → ${b.taxOwnerLabel}` : ""})` : ""}${b.levelsGained ? ` · 레벨 +${b.levelsGained}` : ""}${formatDrops(b.drops)} · 스태미너 ${cur}/${MAX_STAMINA}`,
          );
          return b;
        }
        const err = json.error ?? "unknown";
        const after = json.stamina
          ? ` (스태미너 ${json.stamina.current}/${MAX_STAMINA})`
          : "";
        pushLog(`✗ http ${res.status} ${err}${after}`);
        return null;
      } catch (err) {
        pushLog(`✗ network: ${(err as Error).message}`);
        return null;
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
    huntBatch,
  };
}
