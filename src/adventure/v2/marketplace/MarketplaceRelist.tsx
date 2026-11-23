"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  NumberInput,
  formatThousands,
  parseAmount,
} from "@/components/ui/NumberInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { MARKETPLACE_AUCTION_DURATIONS } from "./auctionDuration";
import { readMarketplaceSellOverview } from "./marketplaceReadClient";
import type { Listing } from "./marketplaceShared";
import {
  RELIST_DEFAULT_CUT,
  RELIST_PRICE_CUTS,
  canRelist,
  relistCutLabel,
  relistPrice,
  relistRequest,
  type RelistTarget,
} from "./relist";

type SellInventory = Parameters<typeof relistRequest>[1];
type Submit = (body: Record<string, unknown>, okMessage: string) => Promise<boolean | undefined>;

/** 유찰 내역 한 줄의 "다시 올리기". 유찰된 장비·재료에만 보인다. */
export function MarketplaceRelistButton({
  listing,
  busy,
  submit,
}: {
  listing: Listing;
  busy: boolean;
  submit: Submit;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!canRelist(listing)) return null;
  if (done) {
    return (
      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
        다시 올렸어요
      </span>
    );
  }
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        className="mt-1"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        다시 올리기
      </Button>
      {open && (
        <RelistDialog
          listing={listing}
          busy={busy}
          onClose={() => setOpen(false)}
          onSubmit={async (body, okMessage) => {
            const ok = await submit(body, okMessage);
            if (ok) {
              setDone(true);
              setOpen(false);
            }
          }}
        />
      )}
    </>
  );
}

export function relistUnavailableText(target: RelistTarget): string | null {
  if (target.ok) return null;
  if (target.reason === "missing_material") {
    return `보유 수량이 모자랍니다(보유 ${(target.holding ?? 0).toLocaleString("ko-KR")}개). 팔기 탭에서 수량을 정해 올려 주세요.`;
  }
  return "가방에서 이 장비를 찾지 못했습니다. 장착했거나 잠갔거나, 돌아온 뒤 강화했다면 팔기 탭에서 올려 주세요.";
}

export function RelistDialog({
  listing,
  busy,
  inventory: initialInventory = null,
  onClose,
  onSubmit,
}: {
  listing: Listing;
  busy: boolean;
  /** 미리 받은 가방 내용. 없으면 열릴 때 불러온다. */
  inventory?: SellInventory | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>, okMessage: string) => void;
}) {
  const [inventory, setInventory] = useState<SellInventory | null>(initialInventory);
  const [loadError, setLoadError] = useState(false);
  const [cut, setCut] = useState<string | null>(String(RELIST_DEFAULT_CUT));
  const [price, setPrice] = useState(
    formatThousands(String(relistPrice(listing.price, RELIST_DEFAULT_CUT))),
  );
  const [hours, setHours] = useState<number>(MARKETPLACE_AUCTION_DURATIONS[0]);

  useEffect(() => {
    if (initialInventory) return;
    let alive = true;
    readMarketplaceSellOverview()
      .then((json) => {
        if (!alive) return;
        setInventory({
          owned: json.owned ?? [],
          equipped: json.equipped ?? {},
          materials: json.materials ?? {},
        });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [initialInventory]);

  const amount = parseAmount(price);
  const priceValid = Number.isSafeInteger(amount) && amount >= 1;
  const target = inventory
    ? relistRequest(listing, inventory, priceValid ? amount : 1, hours)
    : null;
  const unavailable = target ? relistUnavailableText(target) : null;
  const quantityText =
    listing.kind === "material"
      ? ` ${listing.quantity.toLocaleString("ko-KR")}개 묶음`
      : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="다시 올리기"
        className="w-full max-w-sm space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            다시 올리기
          </h2>
          <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {listing.itemName}
            {quantityText}
          </p>
        </div>
        <div className={`${SURFACE_INSET} p-2.5 text-xs`}>
          <div className="text-zinc-500 dark:text-zinc-400">
            유찰된 시작 입찰가
          </div>
          <div className="mt-0.5 font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
            {listing.price.toLocaleString("ko-KR")}G
          </div>
        </div>
        <div className="space-y-1.5">
          <SegmentedControl
            ariaLabel="가격 인하 폭"
            options={RELIST_PRICE_CUTS.map((value) => ({
              key: String(value),
              label: relistCutLabel(value),
            }))}
            value={cut}
            onChange={(key) => {
              setCut(key);
              setPrice(
                formatThousands(String(relistPrice(listing.price, Number(key)))),
              );
            }}
          />
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            새 시작 입찰가
            <NumberInput
              value={price}
              onValueChange={(value) => {
                setPrice(value);
                setCut(null);
              }}
              aria-label="새 시작 입찰가"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            입찰이 없어 유찰된 매물은 같은 가격으로 다시 올려도 잘 팔리지
            않았습니다. 가격을 낮춘 값을 먼저 넣어 두었습니다.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          경매 등록 시간
          <select
            aria-label="경매 등록 시간"
            value={hours}
            disabled={busy}
            onChange={(event) => setHours(Number(event.target.value))}
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {MARKETPLACE_AUCTION_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {value}시간
              </option>
            ))}
          </select>
        </label>
        {loadError && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            가방을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.
          </p>
        )}
        {unavailable && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {unavailable}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !priceValid || !target?.ok}
            loading={busy}
            loadingLabel="다시 올리는 중"
            onClick={() => {
              if (!target?.ok) return;
              onSubmit(
                target.body,
                `✓ ${listing.itemName}${quantityText} 다시 등록`,
              );
            }}
          >
            {inventory || loadError ? "등록" : "가방 확인 중"}
          </Button>
        </div>
      </div>
    </div>
  );
}
