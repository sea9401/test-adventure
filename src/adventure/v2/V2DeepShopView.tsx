"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useSystemToast } from "@/adventure/v2/RewardToastProvider";
import type { DeepShopEntry } from "./deepShop";
import { useRefreshGameState } from "./GameStateRefreshContext";

// 심층 교환소. 던전 심층 단계를 완주해 얻은 심층 증표와 골드를 함께 내고 재료를 받는다.

type ShopEntry = DeepShopEntry & { remaining: number };
type ShopStatus = {
  ok: boolean;
  error?: string;
  tokens: number;
  gold: number;
  bankedGold: number;
  entries: ShopEntry[];
};

const ERRORS: Record<string, string> = {
  weekly_limit: "이번 주 한도를 모두 썼습니다.",
  insufficient_tokens: "증표가 모자랍니다.",
  insufficient_gold: "골드가 모자랍니다.",
  unknown_item: "교환할 수 없는 품목입니다.",
  invalid_quantity: "교환 수량이 올바르지 않습니다.",
  unauthorized: "로그인 상태를 확인해 주세요.",
};

function entryLabel(entry: ShopEntry): string {
  return entry.count > 1 ? `${entry.name} ${entry.count}개` : entry.name;
}

/** 지금 살 수 없는 이유. 살 수 있으면 null. */
function blockedReason(entry: ShopEntry, status: ShopStatus): string | null {
  if (entry.remaining <= 0) return ERRORS.weekly_limit;
  if (status.tokens < entry.tokenCost) return ERRORS.insufficient_tokens;
  if (status.gold + status.bankedGold < entry.goldCost) return ERRORS.insufficient_gold;
  return null;
}

export function V2DeepShopView() {
  const router = useRouter();
  const refreshGameState = useRefreshGameState();
  const { notifySystem } = useSystemToast();
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v2/deep-shop", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as ShopStatus;
        if (!response.ok || !data.ok) throw new Error("load_failed");
        if (!controller.signal.aborted) {
          setStatus(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [reload]);

  const buy = useCallback(
    async (entry: ShopEntry) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const response = await fetch("/api/v2/deep-shop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: entry.itemId, quantity: 1 }),
        });
        const data = (await response.json()) as ShopStatus;
        if (Array.isArray(data.entries)) setStatus({ ...data, ok: true });
        if (!response.ok || !data.ok) {
          notifySystem(`✗ ${ERRORS[data.error ?? ""] ?? "교환하지 못했습니다. 다시 시도해 주세요."}`, "error");
          return;
        }
        notifySystem(`✓ ${entryLabel(entry)}를 받았습니다`);
        await refreshGameState();
      } catch {
        notifySystem("✗ 교환하지 못했습니다. 다시 시도해 주세요.", "error");
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [notifySystem, refreshGameState],
  );

  return (
    <PageShell className={SURFACE_CARD}>
      <SubViewHeader title="심층 교환소" onBack={() => router.push("/battle/dungeons")} />
      {loadFailed && <LoadErrorBanner onRetry={() => setReload((value) => value + 1)} />}
      {!status && !loadFailed && <p role="status">교환소 정보를 불러오는 중...</p>}
      {status && (
        <>
          <Card padding="md" className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={`${SURFACE_INSET} px-3 py-2`}>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">심층 증표</p>
                <p className="font-bold tabular-nums">{status.tokens.toLocaleString("ko-KR")}개</p>
              </div>
              <div className={`${SURFACE_INSET} px-3 py-2`}>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">골드(은행 포함)</p>
                <p className="font-bold tabular-nums">
                  {(status.gold + status.bankedGold).toLocaleString("ko-KR")} G
                </p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              폭풍 원정과 태초의 성소의 심층 단계를 실전으로 완주하면 심층 증표를 받습니다. 교환에는
              증표와 골드가 함께 들고, 한도는 매주 월요일 00:00에 초기화됩니다.
            </p>
          </Card>
          <Card padding="md">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {status.entries.map((entry) => {
                const reason = blockedReason(entry, status);
                const label = entryLabel(entry);
                return (
                  <li
                    key={entry.itemId}
                    aria-label={label}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-semibold">{label}</p>
                      <p className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
                        증표 {entry.tokenCost.toLocaleString("ko-KR")}개 ·{" "}
                        {entry.goldCost.toLocaleString("ko-KR")} G
                      </p>
                      {entry.remaining > 0 && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-300">
                          이번 주 {entry.remaining} / {entry.weeklyLimit}회 남음
                        </p>
                      )}
                      {reason && (
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {reason}
                        </p>
                      )}
                    </div>
                    <Button
                      aria-label={`${label} 교환`}
                      size="sm"
                      disabled={busy || reason !== null}
                      onClick={() => void buy(entry)}
                    >
                      교환
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </PageShell>
  );
}
