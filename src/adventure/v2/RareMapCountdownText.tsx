"use client";

import { useEffect, useRef, useState } from "react";
import {
  correctedRareMapExpiry,
  formatRareMapRemaining,
} from "@/adventure/v2/rareMapCountdown";

export function RareMapCountdownText({
  foundAt,
  serverNow,
  onExpire,
}: {
  foundAt: number;
  serverNow: number;
  onExpire?: () => void;
}) {
  const [expiresAt] = useState(() => {
    const clientNow = Date.now();
    return correctedRareMapExpiry(foundAt, serverNow, clientNow);
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const expiredAtRef = useRef<number | null>(null);
  const remainingMs = Math.max(0, expiresAt - clockNow);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remainingMs > 0 || expiredAtRef.current === expiresAt) return;
    expiredAtRef.current = expiresAt;
    onExpire?.();
  }, [expiresAt, onExpire, remainingMs]);

  return (
    <span className="tabular-nums">
      남은 시간 {formatRareMapRemaining(remainingMs)}
    </span>
  );
}
