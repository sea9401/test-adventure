"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CheckCircle,
  CoinVertical,
  Gauge,
  IdentificationCard,
  Lightning,
  Percent,
  Storefront,
  Sword,
  X,
} from "@phosphor-icons/react";
import {
  ADVENTURE_SUPPORT_PASS,
  MUSEUN_COIN_PACKAGES,
} from "@/adventure/data/v2/adventureSupport";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { MAX_STAMINA } from "@/adventure/v2/stamina";
import {
  MUSEUN_CASH_ITEMS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";

const SUPPORT_BENEFITS = [
  {
    Icon: Gauge,
    label: `최대 에너지 ${ADVENTURE_SUPPORT_PASS.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toLocaleString()})`,
  },
  {
    Icon: Lightning,
    label: `에너지 회복량 ${ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct}% 증가`,
  },
  {
    Icon: Storefront,
    label: `거래소 등록 ${ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus}개 추가`,
  },
  {
    Icon: Percent,
    label: `거래소 수수료 ${ADVENTURE_SUPPORT_PASS.marketplaceTaxRate * 100}%로 감소`,
  },
  {
    Icon: Sword,
    label: `일괄 전투 최대 ${ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch}회`,
  },
] as const;

function MuseunCoinMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8" : "size-12";
  const iconSize = size === "sm" ? 25 : 38;
  return (
    <span
      aria-hidden
      className={`${box} relative inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800`}
    >
      <CoinVertical size={iconSize} weight="duotone" />
      <span className="absolute text-[10px] font-black text-amber-900 dark:text-amber-100">
        ?
      </span>
    </span>
  );
}

export function MuseunCoinShopView() {
  const [chargeOpen, setChargeOpen] = useState(false);
  const [coins, setCoins] = useState(0);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [buying, setBuying] = useState<MuseunCashItemId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/v2/museun-coin-shop", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          coins?: number;
          cashItems?: MuseunCashItemCounts;
        } | null) => {
          if (!alive || !data) return;
          setCoins(Math.max(0, Math.floor(data.coins ?? 0)));
          setCashItems(data.cashItems ?? {});
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function purchase(itemId: MuseunCashItemId) {
    if (buying) return;
    setBuying(itemId);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/museun-coin-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        itemName?: string;
        coins?: number;
        cashItems?: MuseunCashItemCounts;
      } | null;
      if (!res.ok || !data?.ok) {
        setMessage(
          data?.error === "insufficient_coins"
            ? "무슨 코인이 부족합니다."
            : "상품을 구매하지 못했습니다.",
        );
        return;
      }
      setCoins(data.coins ?? 0);
      setCashItems(data.cashItems ?? {});
      setMessage(`${data.itemName ?? "캐시 아이템"}을 가방에 넣었습니다.`);
    } catch {
      setMessage("상품을 구매하지 못했습니다.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <PageShell spacing="loose">
      <Card padding="lg">
        <div className="flex items-center gap-3">
          <MuseunCoinMark />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              관리자 전용 UI 미리보기
            </p>
            <h1 className="mt-0.5 text-xl font-bold">무슨 코인 상점</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              결제 기능은 아직 연결되지 않았습니다.
            </p>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">보유 재화</p>
            <p className="mt-1 text-lg font-bold tabular-nums">
              무슨 코인 {coins.toLocaleString()}개
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              미리보기 잔액
            </span>
            <button
              type="button"
              onClick={() => setChargeOpen(true)}
              className="ui-game-button rounded-md border border-amber-500 bg-amber-500 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-amber-600"
            >
              충전
            </button>
          </div>
        </div>
      </Card>

      {message && (
        <StatusBanner
          tone={message.includes("넣었습니다") ? "success" : "error"}
        >
          {message}
        </StatusBanner>
      )}

      <Card padding="lg" className="border-amber-300 dark:border-amber-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              거래 가능한 30일 이용권
            </p>
            <h2 className="mt-1 text-lg font-bold">
              {MUSEUN_CASH_ITEMS.adventure_support_30d.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              더 넉넉한 에너지와 거래소·일괄 전투 혜택으로 모험을 지원합니다.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-300">
              무슨 코인 {MUSEUN_CASH_ITEMS.adventure_support_30d.coinPrice.toLocaleString()}개
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              약 7,900원 상당
            </p>
          </div>
        </div>

        <div className={`${SURFACE_INSET} mt-4 grid gap-2 p-3 sm:grid-cols-2`}>
          {SUPPORT_BENEFITS.map(({ Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
            >
              <CheckCircle
                size={17}
                weight="fill"
                className="shrink-0 text-emerald-500"
              />
              <Icon size={17} weight="duotone" className="shrink-0 text-amber-500" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          구매하면 가방에 들어오며, 사용한 시점부터 30일이 적용됩니다. 거래소에서
          다른 모험가와 거래할 수도 있습니다. 지원권이 없으면 일괄 전투는 최대{" "}
          {ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch}회까지 이용할 수 있습니다. 최초
          활성화 시 에너지 {ADVENTURE_SUPPORT_PASS.staminaActivationGrant.toLocaleString()}이
          즉시 지급됩니다.
        </p>
        <button
          type="button"
          onClick={() => void purchase("adventure_support_30d")}
          disabled={
            buying !== null ||
            coins < MUSEUN_CASH_ITEMS.adventure_support_30d.coinPrice
          }
          className="ui-game-button mt-4 w-full rounded-md border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
        >
          {buying === "adventure_support_30d"
            ? "구매 중…"
            : coins < MUSEUN_CASH_ITEMS.adventure_support_30d.coinPrice
              ? "무슨 코인 부족"
              : "지원권 구매"}
        </button>
        {(cashItems.adventure_support_30d ?? 0) > 0 && (
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            가방에 {cashItems.adventure_support_30d}개 보유
          </p>
        )}
      </Card>

      <Card padding="lg">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-sky-100 p-2 text-sky-600 dark:bg-sky-950 dark:text-sky-300">
            <IdentificationCard size={26} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                  거래 가능한 이름 변경권
                </p>
                <h2 className="mt-1 text-lg font-bold">
                  {MUSEUN_CASH_ITEMS.rename_permit.name}
                </h2>
              </div>
              <p className="font-bold tabular-nums text-amber-600 dark:text-amber-300">
                무슨 코인 {MUSEUN_CASH_ITEMS.rename_permit.coinPrice.toLocaleString()}개
              </p>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              구매 후 가방에서 사용하면 캐릭터 이름을 한 번 변경할 수 있습니다.
              사용하기 전에는 거래소에 등록할 수 있습니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void purchase("rename_permit")}
          disabled={
            buying !== null || coins < MUSEUN_CASH_ITEMS.rename_permit.coinPrice
          }
          className="ui-game-button mt-4 w-full rounded-md border border-sky-600 bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
        >
          {buying === "rename_permit"
            ? "구매 중…"
            : coins < MUSEUN_CASH_ITEMS.rename_permit.coinPrice
              ? "무슨 코인 부족"
              : "개명 허가증 구매"}
        </button>
        {(cashItems.rename_permit ?? 0) > 0 && (
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            가방에 {cashItems.rename_permit}개 보유
          </p>
        )}
      </Card>

      <div className="text-center">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          모험으로 돌아가기
        </Link>
      </div>

      {chargeOpen && (
        <MuseunCoinChargeDialog onClose={() => setChargeOpen(false)} />
      )}
    </PageShell>
  );
}

function MuseunCoinChargeDialog({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="museun-coin-charge-title"
        className={`${SURFACE_CARD} w-full max-w-lg overflow-hidden`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <MuseunCoinMark size="sm" />
          <div className="min-w-0 flex-1">
            <h2 id="museun-coin-charge-title" className="text-base font-bold">
              무슨 코인 충전
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              구매한 코인은 만료되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="충전창 닫기"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          {MUSEUN_COIN_PACKAGES.map((item) => (
            <div key={item.id} className={`${SURFACE_INSET} flex flex-col p-3`}>
              <div className="flex items-center gap-2">
                <MuseunCoinMark size="sm" />
                <div className="min-w-0">
                  <p className="font-bold tabular-nums">
                    {item.coins.toLocaleString()}코인
                  </p>
                  <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {item.priceKrw.toLocaleString()}원
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="ui-game-button mt-3 w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
              >
                결제 준비 중
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
