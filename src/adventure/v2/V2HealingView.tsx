"use client";

import { useCallback, useEffect, useState } from "react";
import { FirstAid } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// v2 치료소 — 라이브 룰 차용: gold < 50 무료, 아니면 1G 에 만피.
// /api/v2/me/state 로 hp/maxHp/gold 받고, /api/v2/me/heal 로 실행.

type StateResponse = {
  ok?: boolean;
  character?: {
    hp: number;
    maxHp: number;
    mp?: number;
    maxMp?: number;
    gold: number;
  };
};

const HEAL_FREE_GOLD_THRESHOLD = 50;

export function V2HealingView({ onBack }: { onBack: () => void }) {
  const [hp, setHp] = useState<number | null>(null);
  const [maxHp, setMaxHp] = useState<number | null>(null);
  const [mp, setMp] = useState<number | null>(null);
  const [maxMp, setMaxMp] = useState<number | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateResponse | null;
      if (j?.character) {
        setHp(j.character.hp);
        setMaxHp(j.character.maxHp);
        setMp(j.character.mp ?? j.character.maxMp ?? 0);
        setMaxMp(j.character.maxMp ?? 0);
        setGold(j.character.gold);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleHeal = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/heal", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        hp?: number;
        maxHp?: number;
        mp?: number;
        maxMp?: number;
        gold?: number;
        cost?: number;
        error?: string;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      if (typeof j.hp === "number") setHp(j.hp);
      if (typeof j.maxHp === "number") setMaxHp(j.maxHp);
      if (typeof j.mp === "number") setMp(j.mp);
      if (typeof j.maxMp === "number") setMaxMp(j.maxMp);
      if (typeof j.gold === "number") setGold(j.gold);
      setMsg(`✓ 회복 완료 (${j.cost ?? 0} G)`);
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  // 둘 다 풀이어야 disabled. MP 미달이면 HP 풀이어도 회복 가능.
  const hpFull = hp != null && maxHp != null && hp >= maxHp;
  const mpFull = mp != null && maxMp != null && mp >= maxMp;
  const isFull = hpFull && mpFull;
  const cost =
    gold == null ? 0 : gold < HEAL_FREE_GOLD_THRESHOLD ? 0 : 1;

  return (
    <main className="mx-auto max-w-4xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="치료소" onBack={onBack} />
      <Card padding="md">
        <div className="flex items-center gap-3">
          <FirstAid
            size={32}
            weight="duotone"
            className="shrink-0 text-rose-500"
          />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            체력과 마력을 모두 회복할 수 있다. 비용 1 G — 소지금이 50 G 미만이면 무료.
          </p>
        </div>
        {hp != null && maxHp != null && (
          <div className="mt-4 space-y-2">
            <StatBar label="HP" value={hp} max={maxHp} color="bg-red-500" />
            {maxMp != null && maxMp > 0 && mp != null && (
              <StatBar label="MP" value={mp} max={maxMp} color="bg-blue-500" />
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleHeal}
          disabled={isFull || busy || hp == null}
          className="mt-4 w-full rounded-md border border-rose-500 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-400 dark:text-rose-300"
        >
          {hp == null
            ? "..."
            : isFull
              ? "이미 가득 차 있다"
              : cost > 0
                ? `전부 회복 (${cost} G)`
                : "전부 회복 (무료)"}
        </button>
        {msg && (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">{msg}</p>
        )}
      </Card>
    </main>
  );
}
