"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { MARKETPLACE_AUCTION_DURATIONS } from "./auctionDuration";
import {
  MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT,
  MARKETPLACE_AUTO_RELIST_MAX_CUT_PCT,
  MARKETPLACE_AUTO_RELIST_MIN_CUT_PCT,
  isMarketplaceAutoRelistCutPct,
  marketplaceAutoRelistPrice,
} from "./autoRelist";

export function MarketplaceAuctionSettings({
  durationHours, busy, onDurationChange, defaultHours, extensionWindowMinutes, extensionMinutes,
  autoRelist = false, onAutoRelistChange,
  autoRelistCutPct = MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT, onAutoRelistCutPctChange,
}: {
  /** 유찰 시 자동 인하 재등록. 바꿀 수 있는 화면에서만 onAutoRelistChange 를 준다. */
  autoRelist?: boolean;
  onAutoRelistChange?: (value: boolean) => void;
  /** 자동으로 다시 올릴 때의 인하 폭(%). 판매자가 정한다. */
  autoRelistCutPct?: number;
  onAutoRelistCutPctChange?: (value: number) => void;
  durationHours: number;
  busy: boolean;
  onDurationChange: (hours: number) => void;
  defaultHours: number;
  extensionWindowMinutes: number;
  extensionMinutes: number;
}) {
  return (
          <Card padding="sm">
            <label className="flex items-center gap-3 text-sm font-semibold">
              경매 등록 시간
              <select aria-label="경매 등록 시간" value={durationHours} disabled={busy} onChange={(event) => onDurationChange(Number(event.target.value))} className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                {MARKETPLACE_AUCTION_DURATIONS.map(hours => <option key={hours} value={hours}>{hours}시간</option>)}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
              기본 {defaultHours}시간이며, 모든 품목은 등록 즉시 경매가 시작됩니다. 마감 {extensionWindowMinutes}분 미만에 새 입찰이 들어오면 기존 마감에서 {extensionMinutes}분씩 연장됩니다.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              스택 아이템은 등록한 묶음 전체가 한 번에 낙찰됩니다. 나누어 팔려면 수량을 나눠 여러 번 등록해 주세요.
            </p>
            {onAutoRelistChange && (
              <AutoRelistSetting
                enabled={autoRelist}
                cutPct={autoRelistCutPct}
                busy={busy}
                onEnabledChange={onAutoRelistChange}
                onCutPctChange={onAutoRelistCutPctChange}
              />
            )}
          </Card>
  );
}

const EXAMPLE_PRICE = 10_000;

/** 유찰 시 자동 인하 재등록 설정. 인하 폭은 판매자가 직접 적는다. */
export function AutoRelistSetting({
  enabled,
  cutPct,
  busy,
  onEnabledChange,
  onCutPctChange,
}: {
  enabled: boolean;
  cutPct: number;
  busy: boolean;
  onEnabledChange: (value: boolean) => void;
  onCutPctChange?: (value: number) => void;
}) {
  // 입력 중인 글자. 범위 안의 정수일 때만 위로 올리고, 벗어난 채로 나가면 마지막 값으로 되돌린다.
  const [text, setText] = useState(String(cutPct));
  const examplePrice = marketplaceAutoRelistPrice(EXAMPLE_PRICE, cutPct);
  return (
    <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="size-4"
        />
        유찰되면 가격을 낮춰 한 번 더 올리기
      </label>
      {enabled && onCutPctChange && (
        <label className="flex items-center gap-2 text-sm">
          인하 폭
          <input
            type="number"
            inputMode="numeric"
            aria-label="유찰 시 인하 폭(%)"
            min={MARKETPLACE_AUTO_RELIST_MIN_CUT_PCT}
            max={MARKETPLACE_AUTO_RELIST_MAX_CUT_PCT}
            step={1}
            value={text}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              const value = Number(event.target.value);
              if (isMarketplaceAutoRelistCutPct(value)) onCutPctChange(value);
            }}
            onBlur={() => setText(String(cutPct))}
            className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-right tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
          />
          %
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ({MARKETPLACE_AUTO_RELIST_MIN_CUT_PCT}~{MARKETPLACE_AUTO_RELIST_MAX_CUT_PCT})
          </span>
        </label>
      )}
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
        입찰 없이 끝나면 물품을 돌려받지 않고, 시작 입찰가를 정한 만큼 낮춰 같은 등록 시간으로
        자동 등록합니다. 그때도 입찰이 없으면 물품이 돌아옵니다. 지금부터 등록하는 매물에
        적용됩니다.
        {enabled && examplePrice !== null && (
          <>
            {" "}
            예: {EXAMPLE_PRICE.toLocaleString("ko-KR")}골드에 올린 매물은{" "}
            {examplePrice.toLocaleString("ko-KR")}골드로 다시 올라갑니다.
          </>
        )}
      </p>
    </div>
  );
}

/** 내 매물 줄에 붙이는 표시: 유찰되면 가격을 낮춰 자동으로 다시 올라간다. */
export function AutoRelistNote({ cutPct }: { cutPct?: number }) {
  return (
    <span className="text-xs text-zinc-500 dark:text-zinc-400">
      유찰 시 {cutPct ?? MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT}% 인하 재등록
    </span>
  );
}
