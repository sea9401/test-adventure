"use client";

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { FloppyDisk, Trash, ArrowCounterClockwise } from "@phosphor-icons/react";

type Loadout = {
  id: string;
  name: string;
  savedAt: string;
  skills: string[];
  pattern: { blocks?: unknown[] } | null;
  equipment: Record<string, string>;
};

const MAX = 6;

export function V2ArenaLoadoutTab() {
  const { refreshGameState } = useGameState();
  const [loadouts, setLoadouts] = useState<Loadout[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(false);
    try {
      const res = await fetch("/api/v2/arena/loadout");
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        loadouts?: Loadout[];
      } | null;
      if (j?.ok && Array.isArray(j.loadouts)) setLoadouts(j.loadouts);
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 마운트 1회 fetch
    load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/v2/arena/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return (await res.json().catch(() => null)) as
        | { ok: true; loadouts?: Loadout[]; applied?: { skills: string[]; equipmentSlots: number } }
        | { ok: false; error: string }
        | null;
    },
    [],
  );

  const saveCurrent = useCallback(async () => {
    if (busy || loadouts.length >= MAX) return;
    setBusy(true);
    setNotice(null);
    const j = await post({ action: "save", name });
    if (j && j.ok && j.loadouts) {
      setLoadouts(j.loadouts);
      setName("");
      setNotice("현재 세팅을 저장했어요.");
    } else {
      setNotice("저장에 실패했어요.");
    }
    setBusy(false);
  }, [busy, loadouts.length, name, post]);

  const apply = useCallback(
    async (l: Loadout) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const j = await post({ action: "apply", id: l.id });
      if (j && j.ok && j.applied) {
        await refreshGameState();
        setNotice(
          `'${l.name}' 적용됨 — 스킬 ${j.applied.skills.length} · 장비 ${j.applied.equipmentSlots}칸`,
        );
      } else {
        setNotice("적용에 실패했어요.");
      }
      setBusy(false);
    },
    [busy, post, refreshGameState],
  );

  const remove = useCallback(
    async (l: Loadout) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const j = await post({ action: "delete", id: l.id });
      if (j && j.ok && j.loadouts) setLoadouts(j.loadouts);
      setBusy(false);
    },
    [busy, post],
  );

  if (err) return <LoadErrorBanner onRetry={load} />;

  return (
    <section className="space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        현재 장착한 스킬·스킬 패턴·장비를 한 세팅으로 저장해 두고, 눌러서 그대로 불러올 수 있어요.
        (판매·미습득으로 사라진 항목은 자동으로 건너뜁니다.)
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="세팅 이름 (예: 크리 빌드)"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
        <button
          type="button"
          disabled={busy || loadouts.length >= MAX}
          onClick={saveCurrent}
          className="flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-amber-500 dark:hover:bg-amber-400 dark:disabled:bg-zinc-700"
        >
          <FloppyDisk size={16} /> 현재 세팅 저장
        </button>
      </div>
      {loadouts.length >= MAX && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          세팅은 최대 {MAX}개까지 저장할 수 있어요. 하나 지우고 저장해 주세요.
        </p>
      )}

      {notice && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-zinc-500">불러오는 중...</div>
      ) : loadouts.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">
          저장된 세팅이 없어요. 위에서 현재 세팅을 저장해 보세요.
        </div>
      ) : (
        <ul className="space-y-2">
          {loadouts.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{l.name}</div>
                <div className="text-xs text-zinc-500">
                  스킬 {l.skills?.length ?? 0} · 장비{" "}
                  {Object.keys(l.equipment ?? {}).length}칸
                  {l.pattern?.blocks?.length ? " · 스킬 패턴" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => apply(l)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-amber-500 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                <ArrowCounterClockwise size={14} /> 적용
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(l)}
                aria-label="삭제"
                className="shrink-0 rounded-md border border-zinc-300 p-1.5 text-zinc-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-rose-950/40"
              >
                <Trash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
