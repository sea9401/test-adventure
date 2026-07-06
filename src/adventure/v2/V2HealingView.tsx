"use client";

import { useCallback, useEffect, useState } from "react";
import { FirstAid } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { StatBar } from "@/components/ui/StatBar";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import type { WarVigor } from "@/adventure/data/v2/warVigor";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { MAX_CHARGE } from "@/lib/v2-charge-config";

// v2 치료소 — 만피 회복(무료, 전쟁 건강도 회복 통합) + HP/MP 충전약 구매.
// 옛 V2ShopView 의 충전 섹션 + 옛 WarVigorCard 의 건강도 회복이 여기로 통합 — 상점은 장비만 취급.

type StateResponse = {
  ok?: boolean;
  character?: {
    hp: number;
    maxHp: number;
    mp?: number;
    maxMp?: number;
    gold: number;
    bankedGold?: number;
  };
};

type InventoryResponse = {
  hpCharges?: number;
  mpCharges?: number;
};

type ChargeKind = "hp" | "mp";

export function V2HealingView({ onBack }: { onBack: () => void }) {
  // 사냥터 게이트·상단 HP바가 읽는 공유 HP. 치료 직후 동기화해 stale "회복 필요" 차단 방지.
  const { coreLoopOn, applyResourcePatch } = useGameState();
  const [hp, setHp] = useState<number | null>(null);
  const [maxHp, setMaxHp] = useState<number | null>(null);
  const [mp, setMp] = useState<number | null>(null);
  const [maxMp, setMaxMp] = useState<number | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [bankedGold, setBankedGold] = useState(0);
  const [hpCharges, setHpCharges] = useState<number | null>(null);
  const [mpCharges, setMpCharges] = useState<number | null>(null);
  // 전쟁 건강도(war vigor) — 정착지 전쟁 플래그 ON 일 때만 표시·회복. 저장값(회복 미적용) 기준.
  const [warVigor, setWarVigor] = useState<WarVigor | null>(null);
  const [busy, setBusy] = useState<"heal" | ChargeKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(false);
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
        setBankedGold(j.character.bankedGold ?? 0);
        applyResourcePatch({
          gold: j.character.gold,
          bankedGold: j.character.bankedGold ?? 0,
          hp: j.character.hp,
          maxHp: j.character.maxHp,
          mp: j.character.mp ?? j.character.maxMp ?? 0,
          maxMp: j.character.maxMp ?? 0,
        });
      }
      const invJ = invRes.ok
        ? ((await invRes.json().catch(() => null)) as InventoryResponse | null)
        : null;
      setHpCharges(invJ?.hpCharges ?? 0);
      setMpCharges(invJ?.mpCharges ?? 0);
      // 건강도는 표시용으로 현재 저장값(회복 미적용)을 읽는다. 플래그 off 면 404 → 미표시.
      if (V2_SETTLEMENT_WARFARE) {
        const vRes = await fetch("/api/v2/me/war-vigor/recover");
        const vJ = vRes.ok
          ? ((await vRes.json().catch(() => null)) as {
              ok?: boolean;
              warVigor?: WarVigor;
            } | null)
          : null;
        if (vJ?.ok && vJ.warVigor) setWarVigor(vJ.warVigor);
      }
    } catch {
      setLoadError(true);
    }
  }, [applyResourcePatch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
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
        bankedGold?: number;
        cost?: number;
        warVigor?: WarVigor;
        error?: string;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      if (j.warVigor) setWarVigor(j.warVigor);
      if (typeof j.hp === "number") setHp(j.hp);
      if (typeof j.maxHp === "number") setMaxHp(j.maxHp);
      if (typeof j.mp === "number") setMp(j.mp);
      if (typeof j.maxMp === "number") setMaxMp(j.maxMp);
      if (typeof j.gold === "number") setGold(j.gold);
      if (typeof j.bankedGold === "number") {
        setBankedGold(j.bankedGold);
      }
      applyResourcePatch({
        gold: typeof j.gold === "number" ? j.gold : undefined,
        bankedGold:
          typeof j.bankedGold === "number" ? j.bankedGold : undefined,
        hp: typeof j.hp === "number" ? j.hp : undefined,
        maxHp: typeof j.maxHp === "number" ? j.maxHp : undefined,
        mp: typeof j.mp === "number" ? j.mp : undefined,
        maxMp: typeof j.maxMp === "number" ? j.maxMp : undefined,
      });
      setMsg(`✓ 회복 완료 (${j.cost ?? 0} G)`);
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [applyResourcePatch]);

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
              bankedGold?: number;
              hpCharges?: number;
              mpCharges?: number;
            }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setMsg(
          `✓ ${kind === "hp" ? "HP" : "MP"} +${(j.charged ?? amount).toLocaleString()} 충전`,
        );
        if (typeof j.gold === "number") setGold(j.gold);
        if (typeof j.bankedGold === "number") {
          setBankedGold(j.bankedGold);
        }
        if (typeof j.hpCharges === "number") setHpCharges(j.hpCharges);
        if (typeof j.mpCharges === "number") setMpCharges(j.mpCharges);
        applyResourcePatch({
          gold: typeof j.gold === "number" ? j.gold : undefined,
          bankedGold:
            typeof j.bankedGold === "number" ? j.bankedGold : undefined,
          hpCharges:
            typeof j.hpCharges === "number" ? j.hpCharges : undefined,
          mpCharges:
            typeof j.mpCharges === "number" ? j.mpCharges : undefined,
        });
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [applyResourcePatch],
  );

  // 충전약 지불 게이트 — flag on 이면 보유+은행(은행 골드로도 충전). 무료치료 기준(아래)은 보유 기준 유지.
  const spendable = coreLoopOn ? (gold ?? 0) + bankedGold : gold ?? 0;
  const hpFull = hp != null && maxHp != null && hp >= maxHp;
  const mpFull = mp != null && maxMp != null && mp >= maxMp;
  const isFull = hpFull && mpFull;
  // 건강도 만충 여부 — 미로드(null) 또는 플래그 off 면 게이트에서 제외(HP/MP 기준만).
  const vigorFull =
    !V2_SETTLEMENT_WARFARE ||
    warVigor == null ||
    (warVigor.hp >= 1 && warVigor.mp >= 1);
  // HP/MP·건강도 모두 만충일 때만 "이미 가득". 건강도만 미달이어도 회복 가능.
  const allFull = isFull && vigorFull;
  const vigorPct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="치료소" onBack={onBack} />
      {loadError && <LoadErrorBanner onRetry={refresh} />}
      <Card padding="md">
        <div className="flex items-center gap-3">
          <FirstAid
            size={32}
            weight="duotone"
            className="shrink-0 text-rose-500"
          />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            체력과 마력을 모두 회복할 수 있습니다.
          </p>
        </div>
        {hp != null && maxHp != null && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <StatBar label="HP" value={hp} max={maxHp} color="bg-red-500" />
              </div>
              {warVigor && (
                <span className="shrink-0 text-xs tabular-nums text-amber-600 dark:text-amber-400">
                  건강도 {vigorPct(warVigor.hp)}%
                </span>
              )}
            </div>
            {maxMp != null && maxMp > 0 && mp != null && (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <StatBar label="MP" value={mp} max={maxMp} color="bg-blue-500" />
                </div>
                {warVigor && (
                  <span className="shrink-0 text-xs tabular-nums text-amber-600 dark:text-amber-400">
                    건강도 {vigorPct(warVigor.mp)}%
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {warVigor && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            건강도(전쟁 전용)는 약탈·정복 전투에 쓰이며, 회복할 때 시간 누적분만큼 함께 차오릅니다.
          </p>
        )}
        <button
          type="button"
          onClick={handleHeal}
          disabled={allFull || busy !== null || hp == null}
          className="mt-4 w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hp == null
            ? "..."
            : allFull
              ? "이미 가득 차 있다"
              : "전부 회복 (무료)"}
        </button>
      </Card>

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">충전약</h2>
          {/* 보유 골드 — 충전약 결제 통화. 코어루프면 지갑+은행 합산(spendable)이 곧 쓸 수 있는 골드.
              메인 상단바는 코어루프 중 골드를 안 보여줘서 여기서 노출(사용자 요청). */}
          {gold != null && (
            <span className="shrink-0 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
              보유 골드 {spendable.toLocaleString()} G
            </span>
          )}
        </div>
        {gold != null && coreLoopOn && bankedGold > 0 && (
          <p className="mt-0.5 text-right text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
            지갑 {gold.toLocaleString()} · 은행 {bankedGold.toLocaleString()}
          </p>
        )}
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          1 G 당 1 충전, 최대 {MAX_CHARGE.toLocaleString()}. 사냥 후 부족분 만큼 자동 소모.
        </p>
        <ChargeRow
          label="HP 충전약"
          kind="hp"
          current={hpCharges ?? 0}
          gold={spendable}
          busy={busy === "hp"}
          onBuy={buyCharge}
        />
        {/* MP 충전약 — MP 를 쓰는 빌드(maxMp>0)만 노출. MP 바와 동일 게이트. */}
        {maxMp != null && maxMp > 0 && (
          <ChargeRow
            label="MP 충전약"
            kind="mp"
            current={mpCharges ?? 0}
            gold={spendable}
            busy={busy === "mp"}
            onBuy={buyCharge}
          />
        )}
      </Card>

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
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
  const [amountText, setAmountText] = useState("1000");
  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount > 0;
  const actual = validAmount ? Math.min(amount, room) : 0;
  const affordable = gold >= actual && actual > 0;
  return (
    <section className="mt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
          {current.toLocaleString()} / {MAX_CHARGE.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={room}
          step={1}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !full && affordable) {
              onBuy(kind, amount);
            }
          }}
          disabled={busy || full}
          className="min-h-9 w-36 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm tabular-nums text-zinc-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => onBuy(kind, amount)}
          disabled={busy || full || !affordable}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
        >
          충전 ({actual.toLocaleString()}g)
        </button>
        <button
          type="button"
          onClick={() => onBuy(kind, room)}
          disabled={busy || full || gold < room}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
        >
          가득 ({room.toLocaleString()}g)
        </button>
      </div>
      {full && <p className="text-xs text-zinc-500 dark:text-zinc-400">최대치.</p>}
    </section>
  );
}
