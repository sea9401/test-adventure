import { Card } from "@/components/ui/Card";
import { MARKETPLACE_AUCTION_DURATIONS } from "./auctionDuration";

export function MarketplaceAuctionSettings({
  durationHours, busy, onDurationChange, defaultHours, extensionWindowMinutes, extensionMinutes,
}: {
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
          </Card>
  );
}
