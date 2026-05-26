"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// v2 스킬 화면 — PR-5 부터 마법 카탈로그 + 슬롯 + 장착/해제.
//
// 슬롯 모델: 라이브 스킬 슬롯 시스템(layout.normalSlots) 과 공유.
// 학습: INT 임계값 자동 (flame 5 / bolt 15 / meteor 30).
// 발동: 전투 시작 시 1회 sweep — 큰 비용 마법부터 MP 가능한 만큼 (engine.ts).

type SpellEntry = {
  id: "flame" | "bolt" | "meteor";
  name: string;
  description: string;
  mpCost: number;
  intMultiplier: number;
  learnThreshold: number;
  learned: boolean;
};

type SkillsResponse = {
  ok?: boolean;
  spells?: SpellEntry[];
  learnedSpells?: SpellEntry["id"][];
  equippedSpells?: SpellEntry["id"][];
  slotCount?: number;
  intStat?: number;
  error?: string;
};

export function V2SkillsView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/skills");
      const j = (await res.json().catch(() => null)) as SkillsResponse | null;
      setData(j ?? { ok: false });
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateEquipped = useCallback(
    async (next: SpellEntry["id"][]) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/skills/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ equippedSpells: next }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const equipped = data?.equippedSpells ?? [];
  const spells = data?.spells ?? [];
  const slotCount = data?.slotCount ?? 0;
  const intStat = data?.intStat ?? 0;

  const handleToggle = (id: SpellEntry["id"], isEquipped: boolean) => {
    if (busy) return;
    if (isEquipped) {
      void updateEquipped(equipped.filter((x) => x !== id));
    } else {
      if (equipped.length >= slotCount) {
        setMsg(`✗ 슬롯이 가득 찼어요 (${slotCount}/${slotCount}).`);
        return;
      }
      void updateEquipped([...equipped, id]);
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <h1 className="text-lg font-bold">마법</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          INT 를 찍어 마법을 해금하고, 슬롯에 장착하면 전투 시작 시 자동 발동.
          INT {intStat} · 슬롯 {equipped.length}/{slotCount}
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : !data?.ok ? (
        <div className="text-sm text-rose-600 dark:text-rose-400">
          정보를 불러오지 못했어요 ({data?.error ?? "unknown"}).
        </div>
      ) : (
        <ul className="space-y-2">
          {spells.map((s) => {
            const isEquipped = equipped.includes(s.id);
            const canEquip = s.learned && (isEquipped || equipped.length < slotCount);
            return (
              <li
                key={s.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{s.name}</span>
                    {!s.learned && (
                      <span className="rounded bg-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        INT {s.learnThreshold} 필요
                      </span>
                    )}
                    {isEquipped && (
                      <span className="rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        장착
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle(s.id, isEquipped)}
                    disabled={busy || !canEquip}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {isEquipped ? "해제" : "장착"}
                  </button>
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {s.description}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  MP {s.mpCost} · 데미지 INT×{s.intMultiplier}
                  {s.learned && intStat > 0 && (
                    <span className="ml-1 text-indigo-600 dark:text-indigo-400">
                      (현재 = {intStat * s.intMultiplier})
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}

      <Card padding="md">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          발동 방식: 전투 시작 시 1회 sweep — 큰 비용 마법부터 MP 가능한 만큼 자동 발동.
          MP 풀충전 = INT × 10. DEF 무시.
        </div>
      </Card>
    </main>
  );
}
