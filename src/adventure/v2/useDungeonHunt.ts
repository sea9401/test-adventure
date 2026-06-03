"use client";

import { useCallback, useState } from "react";
import { HuntResult } from "@/adventure/v2/HuntResultCard";
import { MAX_STAMINA, type StaminaState } from "@/adventure/v2/stamina";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// hunt API 응답 — UI 기록용 + replay 용 추가 필드.
export type HuntResultPayload = HuntResult & {
  replay?: ReplayPayload;
  startPlayerHp?: number;
  expForBar?: number;
  maxExpForBar?: number;
  // 충전식 회복약 잔량 (사냥 후 자동 소모 반영) — 전투 화면 캐릭터 정보 표기용.
  hpCharges?: number;
  mpCharges?: number;
  // 필드 보스 도전(/api/v2/dungeon/boss) 응답 전용 — 일반 사냥엔 없음.
  isBoss?: boolean;
  firstClear?: boolean; // 첫 처치(칭호 부여).
  titleGranted?: string | null;
  bossEquipDrops?: V2EquipmentId[]; // 이번 처치로 획득한 보스 전용 장비.
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

  // hunt 결과를 리턴 — caller(batch 모드 등) 가 직접 누적 가능. 실패 시 null.
  const hunt = useCallback(
    async (floor: number): Promise<HuntResultPayload | null> => {
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
              `✓ ${r.floor}층 ${r.enemyName} ${verdict} (${r.turns}턴) · ${hpStr} · EXP +${r.expGained}${prof} · GOLD +${r.goldGained}${r.goldTaxed ? ` (세금 ${r.goldTaxed} 차감, 총 ${r.goldGross})` : ""}${levelUp}${formatDrops(r.drops)} · 스태미너 ${cur}/${MAX_STAMINA}`,
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

  // 필드 보스 도전 — /api/v2/dungeon/boss. 응답은 hunt 와 호환(+보스 전용 필드)이라
  // 결과 카드/리플레이를 그대로 재사용한다.
  const challengeBoss = useCallback(
    async (floor: number): Promise<HuntResultPayload | null> => {
      setBusy(true);
      setLastResult(null);
      try {
        const res = await fetch("/api/v2/dungeon/boss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ floor }),
        });
        let json: HuntResponse | null = null;
        try {
          json = (await res.json()) as HuntResponse;
        } catch {
          pushLog(`✗ http ${res.status} (응답 JSON 아님)`);
          return null;
        }
        if (json?.stamina) setStamina(json.stamina);
        if (json?.ok === true && json.result) {
          const r = json.result;
          setLastResult(r);
          const verdict = r.won ? "승리" : "패배";
          const reward = r.won
            ? r.firstClear
              ? " · 첫 처치! 칭호 획득"
              : " · 보상 획득"
            : "";
          const equip = (r.bossEquipDrops?.length ?? 0) > 0
            ? ` · 장비 ${r.bossEquipDrops!.length}종 획득`
            : "";
          pushLog(
            `✓ 보스 ${r.enemyName} ${verdict} (${r.turns}턴)${reward}${equip} · EXP +${r.expGained}`,
          );
          return r;
        }
        const err = json?.error ?? "unknown";
        const errLabel =
          err === "hp_zero"
            ? "체력이 부족합니다 — 회복 후 다시 시도하세요 (스태미너 미소모)"
            : err === "out_of_stamina"
              ? "스태미너가 부족합니다"
              : err;
        pushLog(`✗ http ${res.status} ${errLabel}`);
        return null;
      } catch (err) {
        pushLog(`✗ network: ${(err as Error).message}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [pushLog, setStamina],
  );

  return {
    busy,
    lastResult,
    log,
    hunt,
    challengeBoss,
  };
}
