"use client";

import Link from "next/link";
import {
  CheckCircle,
  CoinVertical,
  Gauge,
  Lightning,
  Percent,
  Storefront,
  Sword,
} from "@phosphor-icons/react";
import {
  ADVENTURE_SUPPORT_PASS,
  MUSEUN_COIN_PACKAGES,
} from "@/adventure/data/v2/adventureSupport";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { MAX_STAMINA } from "@/adventure/v2/stamina";

const SUPPORT_BENEFITS = [
  {
    Icon: Gauge,
    label: `최대 에너지 ${(MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toLocaleString()}으로 변경`,
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
            <p className="mt-1 text-lg font-bold tabular-nums">무슨 코인 0개</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            미리보기 잔액
          </span>
        </div>
      </Card>

      <section className="space-y-3" aria-labelledby="coin-charge-heading">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 id="coin-charge-heading" className="text-base font-bold">
              무슨 코인 충전
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              구매한 코인은 만료되지 않습니다.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {MUSEUN_COIN_PACKAGES.map((item) => (
            <Card key={item.id} padding="md" className="flex flex-col">
              <div className="flex items-center gap-2">
                <MuseunCoinMark size="sm" />
                <div>
                  <p className="font-bold tabular-nums">
                    {item.coins.toLocaleString()}개
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.priceKrw.toLocaleString()}원
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="ui-game-button mt-4 w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
              >
                결제 준비 중
              </button>
            </Card>
          ))}
        </div>
      </section>

      <Card padding="lg" className="border-amber-300 dark:border-amber-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              30일 이용권
            </p>
            <h2 className="mt-1 text-lg font-bold">
              {ADVENTURE_SUPPORT_PASS.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              더 넉넉한 에너지와 거래소·일괄 전투 혜택으로 모험을 지원합니다.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-300">
              무슨 코인 {ADVENTURE_SUPPORT_PASS.coinPrice.toLocaleString()}개
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
          지원권이 없으면 일괄 전투는 최대{" "}
          {ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch}회까지 이용할 수 있습니다. 최초
          활성화 시 에너지 {ADVENTURE_SUPPORT_PASS.staminaActivationGrant.toLocaleString()}이
          즉시 지급됩니다.
        </p>
        <button
          type="button"
          disabled
          className="ui-game-button mt-4 w-full rounded-md border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
        >
          지원권 구매 준비 중
        </button>
      </Card>

      <div className="text-center">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          모험으로 돌아가기
        </Link>
      </div>
    </PageShell>
  );
}
