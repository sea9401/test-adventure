"use client";

import { useCallback, useEffect, useState } from "react";
import { FirstAid } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// v2 치료소 — 만피 회복(라이브 룰: gold<50 무료, 1G 만피) + HP/MP 충전약 구매.
// 옛 V2ShopView 의 충전 섹션이 여기로 이전 — 상점은 장비만 취급.

const HEAL_FREE_GOLD_THRESHOLD = 50;
const MAX_CHARGE = 10000;

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

type InventoryResponse = {
  hpCharges?: number;
  mpCharges?: number;
};

type ChargeKind = "hp" | "mp";

export function V2HealingView({ onBack }: { onBack: () => void }) {
  const [hp, setHp] = useState<number | null>(null);
  const [maxHp, setMaxHp] = useState<number | null>(null);
  const [mp, setMp] = useState<number | null>(null);
  const [maxMp, setMaxMp] = useState<number | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [hpCharges, setHpCharges] = useState<number | null>(null);
  const [busy, setBusy] = useState<"heal" | ChargeKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, invRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        fetch("/api/v2/me/inventory"),
      ]);
      const j = (await stateRes.json().catch(() => null)) as StateResponse | null;
      if (j?.character) {
        setHp(j.character.hp);
        setMaxHp(j.character.maxHp);
        setMp(j.character.mp ?? j.character.maxMp ?? 0);
        setMaxMp(j.character.maxMp ?? 0);
        setGold(j.character.gold);
      }
      const invJ = invRes.ok
        ? ((await invRes.json().catch(() => null)) as InventoryResponse | null)
        : null;
      setHpCharges(invJ?.hpCharges ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleHeal = useCallback(async () => {
    setBusy("heal");
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
      setBusy(null);
    }
  }, []);

  const buyCharge = useCallback(
    async (kind: ChargeKind, amount: number) => {
      setBusy(kind);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/shop/charge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, amount }),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              charged?: number;
              gold?: number;
              hpCharges?: number;
              mpCharges?: number;
            }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setMsg(`✓ HP +${j.charged ?? amount} 충전`);
        if (typeof j.gold === "number") setGold(j.gold);
        if (typeof j.hpCharges === "number") setHpCharges(j.hpCharges);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const hpFull = hp != null && maxHp != null && hp >= maxHp;
  const mpFull = mp != null && maxMp != null && mp >= maxMp;
  const isFull = hpFull && mpFull;
  const healCost =
    gold == null ? 0 : gold < HEAL_FREE_GOLD_THRESHOLD ? 0 : 1;

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
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
          disabled={isFull || busy !== null || hp == null}
          className="mt-4 w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hp == null
            ? "..."
            : isFull
              ? "이미 가득 차 있다"
              : healCost > 0
                ? `전부 회복 (${healCost} G)`
                : "전부 회복 (무료)"}
        </button>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold">충전약</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          1 G 당 1 충전, 최대 {MAX_CHARGE.toLocaleString()}. 사냥 후 부족분 만큼 자동 소모.
          {/* MP 충전약 폐지 — MP 는 전투마다 풀충전(물리=버스트). HP 만 판매. */}
        </p>
        <ChargeRow
          label="HP 충전약"
          kind="hp"
          current={hpCharges ?? 0}
          gold={gold ?? 0}
          busy={busy === "hp"}
          onBuy={buyCharge}
        />
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

function ChargeRow({
  label,
  kind,
  current,
  gold,
  busy,
  onBuy,
}: {
  label: string;
  kind: ChargeKind;
  current: number;
  gold: number;
  busy: boolean;
  onBuy: (kind: ChargeKind, amount: number) => void;
}) {
  const room = MAX_CHARGE - current;
  const full = room <= 0;
  const amounts = [10, 100, 1000];
  return (
    <section className="mt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
          {current.toLocaleString()} / {MAX_CHARGE.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {amounts.map((amt) => {
          const actual = Math.min(amt, room);
          const cost = actual;
          const affordable = gold >= cost && actual > 0;
          return (
            <button
              key={amt}
              type="button"
              onClick={() => onBuy(kind, amt)}
              disabled={busy || full || !affordable}
              className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
            >
              +{amt} ({cost}g)
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onBuy(kind, room)}
          disabled={busy || full || gold < room}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
        >
          꽉 채우기 ({room}g)
        </button>
      </div>
      {full && <p className="text-xs text-zinc-500 dark:text-zinc-400">최대치.</p>}
    </section>
  );
}
