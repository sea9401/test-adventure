"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { FloppyDisk, Shield, Star, Sword, Trash } from "@phosphor-icons/react";

type Loadout = {
  id: string;
  name: string;
  savedAt: string;
  element?: string;
  skills: string[];
  pattern: { blocks?: unknown[] } | null;
  equipment: Record<string, string>;
  summary?: {
    elementLabel: string | null;
    skills: { id: string; name: string; passive: boolean }[];
    equipment: { slot: string; slotLabel: string; iid: string; name: string }[];
    patternBlocks: number;
  };
};

function formatKst(iso: string | undefined): string {
  if (!iso) return "-";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-bold text-amber-600 dark:text-amber-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function V2ArenaLoadoutTab() {
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(false);
    try {
      const res = await fetch("/api/v2/arena/loadout");
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        loadout?: Loadout | null;
      } | null;
      if (j?.ok) setLoadout(j.loadout ?? null);
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

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/v2/arena/loadout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json().catch(() => null)) as
      | { ok: true; loadout?: Loadout | null }
      | { ok: false; error: string }
      | null;
  }, []);

  const saveCurrent = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const j = await post({ action: "save" });
    if (j && j.ok) {
      setLoadout(j.loadout ?? null);
      setNotice("현재 세팅을 아레나 전투 템플릿으로 저장했어요.");
    } else {
      setNotice("저장에 실패했어요.");
    }
    setBusy(false);
  }, [busy, post]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const j = await post({ action: "delete" });
    if (j && j.ok) {
      setLoadout(null);
      setNotice("아레나 전투 템플릿을 삭제했어요.");
    } else {
      setNotice("삭제에 실패했어요.");
    }
    setBusy(false);
  }, [busy, post]);

  if (err) return <LoadErrorBanner onRetry={load} />;

  const passiveSkills = loadout?.summary?.skills.filter((s) => s.passive) ?? [];
  const activeSkills = loadout?.summary?.skills.filter((s) => !s.passive) ?? [];

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          현재 장착된 속성, 어빌리티, 스킬, 장비를 아레나 전투용 템플릿으로 저장합니다.
          아레나에서는 공격할 때도, 다른 모험가가 나를 상대할 때도 이 템플릿이 사용됩니다.
          직업과 현재 스탯은 저장하지 않습니다.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={saveCurrent}
            className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-amber-500 dark:hover:bg-amber-400 dark:disabled:bg-zinc-700"
          >
            <FloppyDisk size={16} /> 현재 세팅 저장
          </button>
          {loadout && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-rose-950/40"
            >
              <Trash size={16} /> 삭제
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-zinc-500">불러오는 중...</div>
      ) : !loadout ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          저장된 아레나 전투 템플릿이 없어요. 현재 세팅을 저장하면 다음 아레나 전투부터 사용됩니다.
        </div>
      ) : (
        <>
          <div className="text-sm font-semibold text-amber-600 dark:text-amber-300">
            현재 저장된 템플릿 ({formatKst(loadout.savedAt)})
          </div>

          <Section title="속성">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <Star size={16} weight="fill" className="text-amber-500" />
                현재 속성
              </span>
              <span className="text-right font-semibold text-fuchsia-600 dark:text-fuchsia-300">
                {loadout.summary?.elementLabel ?? "중립"}
              </span>
            </div>
          </Section>

          <Section title="어빌리티">
            {passiveSkills.length === 0 ? (
              <div className="text-sm text-zinc-500">저장된 어빌리티가 없어요.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {passiveSkills.map((skill) => (
                  <li key={skill.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{skill.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">항상</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="스킬">
            {activeSkills.length === 0 ? (
              <div className="text-sm text-zinc-500">저장된 스킬이 없어요.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {activeSkills.map((skill) => (
                  <li key={skill.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{skill.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {loadout.summary?.patternBlocks ? "패턴" : "장착"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="장비">
            {loadout.summary?.equipment.length ? (
              <ul className="space-y-2">
                {loadout.summary.equipment.map((item) => (
                  <li
                    key={`${item.slot}:${item.iid}`}
                    className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    {item.slot === "weapon" ? (
                      <Sword size={16} className="shrink-0 text-zinc-500" />
                    ) : (
                      <Shield size={16} className="shrink-0 text-zinc-500" />
                    )}
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                      {item.slotLabel}
                    </span>
                    <span className="min-w-0 truncate font-semibold">{item.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500">저장된 장비가 없어요.</div>
            )}
          </Section>
        </>
      )}
    </section>
  );
}
