"use client";

import { useState } from "react";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import {
  initialStamina,
  type StaminaState,
} from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";

type HuntResponse = {
  ok?: boolean;
  stamina?: StaminaState;
  error?: string;
  result?: { floor: number };
};

// 던전 사냥 dev preview — POST /api/v2/dungeon/hunt 흐름을 시각 검증.
// 초기 stamina 는 만피 가정 (실제 서버 값은 hunt 한 번 호출 후 동기화).
// 전투 결과는 다음 PR 에서.
export function DungeonHunt() {
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function pushLog(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 10));
  }

  async function hunt(floor: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/v2/dungeon/hunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ floor }),
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
      if (json.stamina) {
        setStamina(json.stamina);
      }
      if (json.ok === true) {
        const cur = json.stamina?.current ?? "?";
        pushLog(`✓ ${floor}층 사냥 1회 — 스태미너 ${cur}/200`);
      } else {
        const err = json.error ?? "unknown";
        const after = json.stamina ? ` (스태미너 ${json.stamina.current}/200)` : "";
        pushLog(`✗ http ${res.status} ${err}${after}`);
      }
    } catch (err) {
      pushLog(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">던전 사냥 (shell)</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          하나 클릭 = POST /api/v2/dungeon/hunt → 스태미너 1 차감. 전투 결과는
          다음 PR 에서.
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
