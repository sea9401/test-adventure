"use client";

import { useEffect, useState } from "react";
import type { Listing } from "./marketplaceShared";

export function useMarketplaceUnsold(enabled: boolean) {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      setRows(null);
      setError(null);
      try {
        const response = await fetch("/api/v2/marketplace/history?mine=1&status=unsold", { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error("미판매 내역을 불러오지 못했어요.");
        if (controller.signal.aborted) return;
        setRows(payload.trades.map((trade: {
          id: number; kind: Listing["kind"]; itemId: string; itemName: string;
          quantity: number; price: number; instancePayload: unknown;
          closedAt: string; status: "expired" | "cancelled";
        }): Listing => ({
          ...trade, closedStatus: trade.status, isMine: true, isHighestBidder: false,
          hasMyBid: false, createdAt: trade.closedAt, bidEndsAt: trade.closedAt,
          expiresAt: trade.closedAt, highestBid: null, bidCount: 0,
          bidResolvedAt: trade.closedAt, nextBid: 1,
        })));
      } catch {
        if (!controller.signal.aborted) setError("미판매 내역을 불러오지 못했어요.");
      }
    }
    void load();
    return () => controller.abort();
  }, [enabled, revision]);
  return { rows, error, retry: () => setRevision(value => value + 1) };
}
