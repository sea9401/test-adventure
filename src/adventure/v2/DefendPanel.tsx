"use client";

import { useCallback, useEffect, useState } from "react";

// 정착지 전쟁 — 참여형 수비 등록 패널. 길드원이 내 길드 점령 거점의 수비대에 등록/해제한다.
//   등록순(서버 registeredAt)으로 큐가 잡히고, 공격 시 그 순서로 배치돼 막는다(약탈=1번 격파,
//   정복=전원 격파+성벽). 설계: docs/v2-settlement-warfare-plan.md §2.2.
//   PR-2 = 등록/해제 + 큐 표시. 공격 흐름(건강도 전투)은 PR-3 에서 배선.

type Defender = {
  userId: string;
  name: string;
  registeredAt: string;
  isMe: boolean;
};

export default function DefendPanel({ outpostId }: { outpostId: string }) {
  const [queue, setQueue] = useState<Defender[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/v2/outpost/defend?outpostId=${encodeURIComponent(outpostId)}`,
      );
      const j = r.ok ? await r.json() : null;
      setQueue(Array.isArray(j?.queue) ? j.queue : []);
    } catch {
      setQueue([]);
    }
  }, [outpostId]);

  useEffect(() => {
    void load();
  }, [load]);

  const amRegistered = !!queue?.some((d) => d.isMe);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/v2/outpost/defend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outpostId,
          action: amRegistered ? "unregister" : "register",
        }),
      });
      const j = r.ok ? await r.json() : null;
      if (j?.ok && Array.isArray(j.queue)) setQueue(j.queue as Defender[]);
      else await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }, [outpostId, amRegistered, load]);

  return (
    <div className="space-y-3 px-1 py-2">
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        수비대에 등록하면 <strong>등록한 순서대로</strong> 배치되어 공격자를
        막습니다. 전투는 건강도(전쟁 전용 체력)로 치러지고, 패배하면 큐에서
        빠집니다. 건강도는 치료소에서 회복됩니다.
      </p>

      <button
        type="button"
        onClick={toggle}
        disabled={busy || queue === null}
        className={
          amRegistered
            ? "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            : "w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        }
      >
        {queue === null
          ? "불러오는 중…"
          : amRegistered
            ? "수비 해제"
            : "수비대 등록"}
      </button>

      <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          수비자 목록 {queue ? `(${queue.length})` : ""}
        </div>
        <div className="min-h-[200px]">
          {queue && queue.length > 0 ? (
            <ol className="space-y-1">
              {queue.map((d, i) => (
                <li
                  key={d.userId}
                  className={
                    d.isMe
                      ? "flex items-center gap-2 rounded-md bg-emerald-100 px-2 py-1 text-sm dark:bg-emerald-950/40"
                      : "flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                  }
                >
                  <span className="w-5 text-right text-xs tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="font-medium">{d.name}</span>
                  {d.isMe && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      나
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-400">
              {queue === null ? "" : "아직 등록된 수비대가 없습니다."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
