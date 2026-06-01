"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  V2_CULTIVATE_PROFILE,
  V2_STAT_CAP_BASE,
} from "@/adventure/data/v2/proficiency";
import { V2_CLASS_DEFS, type V2Class } from "@/adventure/data/v2/classes";

// v2 수행(修行) — 사용 가능 숙련도를 써서 현 직업군 스탯 한계치(cap)를 올린다.
// 옛 "성장의 신전"(수동 스탯 분배) 대체. 분배는 레벨업 랜덤 성장이 담당하고, 여기서는
// 그 성장의 천장(cap)을 직업 프로필대로 끌어올린다. docs/v2-proficiency-redesign.md §4.

type StateShape = {
  ok?: boolean;
  // stats.base = cap 클램프 후 현 스탯(직업보정 전 — cap 과 같은 스케일). 표시 "현스탯(cap)".
  stats?: { base?: Partial<Record<V2StatKey, number>> };
  proficiency?: {
    caps?: Partial<Record<V2StatKey, number>>;
    current?: {
      group: string;
      usable: number;
      cultivations: number;
      nextCost: number;
    };
  };
};

export function V2CultivationView({ onBack }: { onBack: () => void }) {
  const [group, setGroup] = useState<string>("none");
  const [usable, setUsable] = useState(0);
  const [cultivations, setCultivations] = useState(0);
  const [nextCost, setNextCost] = useState(0);
  const [caps, setCaps] = useState<Partial<Record<V2StatKey, number>>>({});
  const [stats, setStats] = useState<Partial<Record<V2StatKey, number>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateShape | null;
      const cur = j?.proficiency?.current;
      if (j?.ok && cur) {
        setGroup(cur.group);
        setUsable(cur.usable);
        setCultivations(cur.cultivations);
        setNextCost(cur.nextCost);
        setCaps(j.proficiency?.caps ?? {});
        setStats(j.stats?.base ?? {});
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const profile = V2_CULTIVATE_PROFILE[group] ?? null;
  const disciplineName =
    group !== "none" ? V2_CLASS_DEFS[group as V2Class]?.group ?? "" : "";
  const canCultivate =
    !!profile && !busy && usable >= nextCost && nextCost > 0;

  const cultivate = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/cultivate", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        spent?: number;
        mult?: number;
        caps?: Partial<Record<V2StatKey, number>>;
        cultivations?: number;
        usable?: number;
        nextCost?: number;
        required?: number;
        have?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "no_class"
            ? "직업이 없어요 (먼저 직업을 선택하세요)"
            : j?.error === "insufficient_proficiency"
              ? `숙련도 부족 (필요 ${j.required ?? nextCost}, 보유 ${j.have ?? usable})`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      const crit = (j.mult ?? 1) > 1 ? ` ⭐크리티컬 ×${j.mult}!` : "";
      setMsg(`✓ 수행 완료 (숙련도 -${j.spent ?? nextCost})${crit}`);
      setCaps(j.caps ?? caps);
      setCultivations(j.cultivations ?? cultivations + 1);
      setUsable(j.usable ?? Math.max(0, usable - nextCost));
      setNextCost(j.nextCost ?? nextCost);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [caps, cultivations, usable, nextCost]);

  // 프로필 스탯(앵커 + 관련 2) 을 상승치 큰 순으로.
  const profileStats: V2StatKey[] = profile
    ? (Object.keys(profile) as V2StatKey[]).sort(
        (a, b) => (profile[b] ?? 0) - (profile[a] ?? 0),
      )
    : [];

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="수행" onBack={onBack} />

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {disciplineName ? `${disciplineName} 수행` : "수행"}
          </h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            사용 가능 숙련도{" "}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {usable}
            </strong>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          숙련도를 들여 직업 단련의 천장(스탯 한계치)을 끌어올린다. 레벨업 랜덤 성장이
          이 한계치까지 능력치를 채운다.
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        ) : !profile ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            직업이 없어 수행할 수 없어요. 먼저 직업을 선택하세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {profileStats.map((k) => {
              const cap = caps[k] ?? V2_STAT_CAP_BASE;
              const cur = stats[k] ?? 0;
              const gain = profile[k] ?? 0;
              return (
                <li
                  key={k}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-semibold uppercase">
                      {k.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {V2_STAT_LABELS[k]}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 tabular-nums text-sm">
                    {/* 현스탯(한계) — 예 200(300). 수행은 한계만 올림. */}
                    <span className="font-semibold">
                      {cur}
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        ({cap})
                      </span>
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      한계 +{gain}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {profile && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              수행 {cultivations}회 · 다음 비용{" "}
              <strong
                className={`tabular-nums ${
                  usable >= nextCost
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {nextCost}
              </strong>
            </span>
            <button
              type="button"
              onClick={cultivate}
              disabled={!canCultivate}
              className="rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "수행 중…" : "수행"}
            </button>
          </div>
        )}
      </Card>

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
