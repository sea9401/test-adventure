"use client";

import { useState } from "react";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { HuntResultCard, type HuntResult } from "@/adventure/v2/HuntResultCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import {
  initialStamina,
  type StaminaState,
} from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";

// hunt API 응답 — UI 기록용 + replay 용 추가 필드(서버가 hunt route 에 박은 것).
type HuntResultPayload = HuntResult & {
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

// 던전 사냥 dev preview — POST /api/v2/dungeon/hunt 흐름.
// 사냥 시작 시 ReplayBattleScene 으로 라이브 BattleScene replay 표시,
// replay 끝나면 풍부한 결과 카드 + 보조 로그.
export function DungeonHunt({
  outpostId,
  playerName = "모험가",
  playerGender = "male1",
}: {
  outpostId?: string;
  playerName?: string;
  playerGender?: Gender;
} = {}) {
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<HuntResultPayload | null>(null);
  const [replayDone, setReplayDone] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  function pushLog(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 10));
  }

  async function hunt(floor: number) {
    setBusy(true);
    // 직전 결과/replay 모두 초기화 — busy 중 재클릭 안전.
    setLastResult(null);
    setReplayDone(false);
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
        setReplayDone(true);
        return;
      }
      if (!json) {
        pushLog(`✗ http ${res.status} (빈 응답)`);
        setReplayDone(true);
        return;
      }
      if (json.stamina) {
        setStamina(json.stamina);
      }
      if (json.ok === true) {
        const cur = json.stamina?.current ?? "?";
        const r = json.result;
        if (r) {
          setLastResult(r);
          // replay 가 있으면 BattleScene 재생 — 끝나면 결과 카드.
          // 없으면 결과 카드 즉시.
          if (!r.replay) setReplayDone(true);
          const verdict = r.won ? "승리" : "패배";
          const levelUp = r.levelsGained > 0 ? ` · 레벨 +${r.levelsGained}` : "";
          const hpStr = `HP ${r.hpBefore}→${r.hpAfter}/${r.maxHp}`;
          pushLog(
            `✓ ${r.floor}층 ${r.enemyName} ${verdict} (${r.turns}턴) · ${hpStr} · EXP +${r.expGained} · GOLD +${r.goldGained}${r.goldTaxed ? ` (세금 ${r.goldTaxed} 차감, 총 ${r.goldGross})` : ""}${levelUp}${formatDrops(r.drops)} · 스태미너 ${cur}/200`,
          );
        } else {
          setReplayDone(true);
          pushLog(`✓ ${floor}층 사냥 1회 — 스태미너 ${cur}/200`);
        }
      } else {
        const err = json.error ?? "unknown";
        const errLabel =
          err === "policy_blocked"
            ? "policy_blocked (점령 길드가 자길드 멤버에게만 개방 중)"
            : err;
        const after = json.stamina ? ` (스태미너 ${json.stamina.current}/200)` : "";
        pushLog(`✗ http ${res.status} ${errLabel}${after}`);
        setReplayDone(true);
      }
    } catch (err) {
      pushLog(`✗ network: ${(err as Error).message}`);
      setReplayDone(true);
    } finally {
      setBusy(false);
    }
  }

  const replayPending = !replayDone && lastResult?.replay != null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">던전 사냥</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          층 클릭 = 단판 사냥 (스태미너 1 소모).
        </p>
      </header>

      <StaminaBar state={stamina} />

      <div className="grid grid-cols-1 gap-2">
        {MAIN_DUNGEON.floors.map((floor) => (
          <button
            key={floor.id}
            onClick={() => hunt(floor.id)}
            disabled={busy}
            className="flex items-center justify-between rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
          >
            <span className="font-medium">{floor.name}</span>
            <span className="text-xs text-zinc-500">
              {floor.requirement.kind === "level"
                ? `Lv ${floor.requirement.min}~${floor.requirement.max}`
                : `엔드 ${floor.requirement.tier}`}
            </span>
          </button>
        ))}
      </div>

      {replayPending && lastResult?.replay && (
        <ReplayBattleScene
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={lastResult.expForBar ?? 0}
          maxExp={lastResult.maxExpForBar ?? 1}
          onDone={() => setReplayDone(true)}
        />
      )}

      {replayDone && lastResult && <HuntResultCard result={lastResult} />}

      {log.length > 0 && (
        <section className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            최근 호출
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs font-mono dark:border-zinc-800 dark:bg-zinc-900/50">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
