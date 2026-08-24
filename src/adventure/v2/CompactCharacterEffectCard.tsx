"use client";

import { useEffect, useState } from "react";
import { CookingPot, Sparkle, X } from "@phosphor-icons/react";
import { ADVENTURE_SUPPORT_PASS } from "@/adventure/data/v2/adventureSupport";
import { MAX_STAMINA } from "@/adventure/v2/stamina";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import {
  cookingEffectText,
  cookingQualityName,
  type ActiveCookingBuff,
} from "./cooking/food";
import {
  formatAdventureSupportExpiry,
  formatAdventureSupportRemaining,
} from "./adventureSupportDisplay";
import { itemCardPosition } from "./item-card/V2ItemCardPopover";
import type { ItemCardAnchor } from "./V2ItemCard";

const VIEWPORT_MARGIN = 8;

function visibleViewport() {
  if (typeof window === "undefined") {
    return { width: 360, height: 640, top: VIEWPORT_MARGIN };
  }

  const topBar = document.querySelector<HTMLElement>("[data-game-top-bar]");
  const topBarRect = topBar?.getBoundingClientRect();
  const top =
    topBarRect && topBarRect.bottom > 0 && topBarRect.top < window.innerHeight
      ? topBarRect.bottom + VIEWPORT_MARGIN
      : VIEWPORT_MARGIN;
  return { width: window.innerWidth, height: window.innerHeight, top };
}

export type CompactCharacterEffectDetail =
  | {
      kind: "support";
      activeUntil: number;
      regenBonusPct: number;
    }
  | {
      kind: "food";
      buff: ActiveCookingBuff;
    };

function formatFoodRemaining(expiresAt: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  if (minutes <= 0) return "만료됨";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}분 남음`;
  return remainder > 0
    ? `${hours}시간 ${remainder}분 남음`
    : `${hours}시간 남음`;
}

export function CompactCharacterEffectCard({
  detail,
  anchor,
  onClose,
}: {
  detail: CompactCharacterEffectDetail;
  anchor: ItemCardAnchor;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const { width, left, pos } = itemCardPosition(anchor, visibleViewport());
  useEscapeKey(onClose);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const isSupport = detail.kind === "support";
  const title = isSupport ? "모험 지원권" : detail.buff.recipeName;
  const supportBenefits = isSupport
    ? [
        `에너지 회복량 ${detail.regenBonusPct}% 증가`,
        `최대 에너지 ${ADVENTURE_SUPPORT_PASS.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toLocaleString()})`,
        `거래소 등록 ${ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus}개 추가`,
        `거래소 수수료 ${ADVENTURE_SUPPORT_PASS.marketplaceTaxRate * 100}%로 감소`,
      ]
    : [];
  const activeUntil = isSupport ? detail.activeUntil : detail.buff.expiresAt;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={isSupport ? "모험 지원권 정보" : `${detail.buff.recipeName} 음식 효과`}
        style={{ position: "fixed", width, left, ...pos }}
        className={`${SURFACE_CARD} ui-floating-reveal z-50 overflow-y-auto p-4 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {isSupport ? (
              <Sparkle size={22} weight="duotone" className="shrink-0 text-amber-500" aria-hidden />
            ) : (
              <CookingPot size={22} weight="duotone" className="shrink-0 text-orange-500" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                {isSupport ? "혜택 적용 중" : `${cookingQualityName(detail.buff.quality)} · 음식 효과 적용 중`}
              </p>
              <h2 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        </div>

        {isSupport ? (
          <ul className={`${SURFACE_INSET} mt-3 space-y-1.5 p-3 text-xs text-zinc-700 dark:text-zinc-200`}>
            {supportBenefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className="font-bold text-amber-500" aria-hidden>•</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={`${SURFACE_INSET} mt-3 p-3`}>
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">적용 효과</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">
              {cookingEffectText(detail.buff.effect) || "효과 없음"}
            </p>
          </div>
        )}

        <div className={`${SURFACE_INSET} mt-3 px-3 py-2.5 text-center`}>
          <p className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {isSupport
              ? formatAdventureSupportRemaining(detail.activeUntil, now)
              : formatFoodRemaining(detail.buff.expiresAt, now)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {formatAdventureSupportExpiry(activeUntil)}까지
          </p>
        </div>
      </section>
    </>
  );
}
