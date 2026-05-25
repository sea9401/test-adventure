"use client";

import { useCallback, useEffect, useState } from "react";

// 길드 3:3 토너먼트 라인업 설정 카드.
// 마스터만 변경 가능. 멤버 1~3명을 순서대로 선택. v2 길드는 1인 길드 default 이라
// 다인 길드 시점에만 의미 있음. 1인 길드면 마스터 1명 표시.

type Member = { userId: string; role: string };

type LineupResponse = {
  ok?: boolean;
  guildId?: number;
  isMaster?: boolean;
  members?: Member[];
  lineup?: string[] | null;
  error?: string;
  offending?: string;
};

const MAX_LINEUP = 3;

export function LineupCard() {
  const [data, setData] = useState<LineupResponse | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/guild/me/lineup");
      if (res.ok) {
        const j = (await res.json()) as LineupResponse;
        setData(j);
        const initial = j.lineup && j.lineup.length > 0 ? j.lineup : [];
        setDraft(initial);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    if (draft.length === 0) {
      setMsg("✗ 1명 이상 선택해야 합니다");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/guild/me/lineup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberUserIds: draft }),
      });
      const j = (await res.json()) as LineupResponse;
      if (j.ok) {
        setMsg(`✓ 라인업 ${draft.length}명 저장됨`);
        refresh();
      } else {
        setMsg(`✗ ${j.error ?? `http ${res.status}`}`);
      }
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
        길드 정보 로딩…
      </div>
    );
  }

  const members = data.members ?? [];
  const isMaster = !!data.isMaster;

  return (
    <div className="border-b border-zinc-200 bg-zinc-50/50 px-4 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">3:3 토너먼트 라인업</span>
        <span className="text-zinc-500">
          길드 {data.guildId} · 멤버 {members.length}명
          {isMaster ? " · 마스터" : ""}
        </span>
        {!isMaster && (
          <span className="text-zinc-400">— 마스터만 변경 가능</span>
        )}
      </div>
      {isMaster && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {[0, 1, 2].map((slot) => (
            <select
              key={slot}
              value={draft[slot] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const next = draft.slice();
                if (v === "") {
                  next.splice(slot, 1);
                } else {
                  next[slot] = v;
                  // 빈 슬롯 채우기
                  while (next.length < slot) next.push("");
                }
                // 중복 제거 — 다른 슬롯에 같은 id 가 있으면 제거.
                const seen = new Set<string>();
                const cleaned: string[] = [];
                for (let i = 0; i < next.length; i++) {
                  const id = next[i];
                  if (!id || seen.has(id)) continue;
                  seen.add(id);
                  cleaned.push(id);
                }
                setDraft(cleaned.slice(0, MAX_LINEUP));
              }}
              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">{slot + 1}번 (없음)</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.role === "master" ? "★" : "·"} {m.userId.slice(0, 8)}
                </option>
              ))}
            </select>
          ))}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
          {msg && <span className="font-mono text-xs">{msg}</span>}
        </div>
      )}
      {!isMaster && data.lineup && data.lineup.length > 0 && (
        <div className="mt-1 text-zinc-500">
          현재 라인업: {data.lineup.map((id) => id.slice(0, 8)).join(" → ")}
        </div>
      )}
    </div>
  );
}
