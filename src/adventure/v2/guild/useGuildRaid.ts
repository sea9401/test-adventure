"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GuildRaidAttackResult,
  GuildRaidErrorResponse,
  GuildRaidState,
} from "./guildRaidTypes";

function guildRaidRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `raid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postGuildRaidAttack(requestId: string): Promise<Response> {
  return fetch("/api/v2/guild/raid/attack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
}

export function useGuildRaid() {
  const [state, setState] = useState<GuildRaidState | null>(null);
  const [loading, setLoading] = useState(true);
  const [attacking, setAttacking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<GuildRaidAttackResult | null>(null);
  const attackingRef = useRef(false);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/v2/guild/raid");
      const body = (await response.json().catch(() => null)) as
        | GuildRaidState
        | GuildRaidErrorResponse
        | null;
      if (!response.ok || !body?.ok) {
        if (!quiet) {
          setError(
            body && "error" in body ? body.error ?? "load_failed" : "load_failed",
          );
        }
        return;
      }
      setState(body);
      if (!quiet) setError(null);
    } catch {
      if (!quiet) setError("load_failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const interval = window.setInterval(() => void load({ quiet: true }), 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const attack = useCallback(async () => {
    if (attackingRef.current) return;
    attackingRef.current = true;
    setAttacking(true);
    setError(null);
    setLastAttack(null);
    const requestId = guildRaidRequestId();
    try {
      let response: Response;
      try {
        response = await postGuildRaidAttack(requestId);
      } catch {
        // 응답 유실로 결과를 모를 때만 같은 멱등 키로 한 번 재조회한다.
        response = await postGuildRaidAttack(requestId);
      }
      const body = (await response.json().catch(() => null)) as
        | GuildRaidAttackResult
        | GuildRaidErrorResponse
        | null;
      if (!response.ok || !body?.ok) {
        setError(
          body && "error" in body
            ? body.error ?? "attack_failed"
            : "attack_failed",
        );
        await load({ quiet: true });
        return;
      }
      setLastAttack(body);
      await load({ quiet: true });
    } catch {
      setError("attack_failed");
    } finally {
      attackingRef.current = false;
      setAttacking(false);
    }
  }, [load]);

  return { state, loading, attacking, error, lastAttack, load, attack };
}
