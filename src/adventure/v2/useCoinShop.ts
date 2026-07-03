"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameState } from "./GameStateProvider";

// 코인 상점 공용 코어 — 낚시/발굴/투기장 상점 훅이 같은 mount fetch + 구매 사다리
// (성공 / insufficient_coins / already_owned)를 각자 복붙하던 것의 단일화(2026-07).
// 상점별 차이는 옵션으로: endpoint · coinLabel(부족 메시지의 재화 이름) ·
// parseState(GET 응답 → 상태) · applyServer(구매 응답의 추가 필드 반영 — 스태미나
// 포션·낚시 진행 등. coins 는 코어가 처리). 낚시 전용 buyGear 는 래퍼(useFishingShop)가
// 코어의 setState/setBuying 을 받아 자체 구현한다.

export type BuyResult = { ok: boolean; message: string };
export type CoinShopCoreState = { coins: number; ownedTitleIds: string[] };
type Json = Record<string, unknown>;

export function useCoinShop<S extends CoinShopCoreState>(opts: {
  endpoint: string;
  coinLabel: string;
  parseState: (j: Json) => S;
  applyServer?: (s: S, j: Json) => S;
}) {
  const { applyResourcePatch } = useGameState();
  const [state, setState] = useState<S | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  // 옵션(상점별 상수 + 파서 클로저)을 ref 로 고정 — buy/buyConsumable 의 참조 안정성을
  // 원본 훅들([] deps)과 동일하게 유지한다(useAsyncData 의 fetcherRef 패턴).
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    let alive = true;
    fetch(optsRef.current.endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok) {
          if (typeof j.staminaPotions === "number") {
            applyResourcePatch({ staminaPotions: j.staminaPotions });
          }
          setState(optsRef.current.parseState(j as Json));
        } else {
          setError("상점을 불러오지 못했다.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("상점을 불러오지 못했다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applyResourcePatch]);

  // 구매 응답 반영 — coins(코어) + 상점별 추가 필드(applyServer).
  const applyResponse = useCallback((s: S, j: Json): S => {
    const base =
      typeof j.coins === "number" ? { ...s, coins: j.coins } : { ...s };
    const { applyServer } = optsRef.current;
    return applyServer ? applyServer(base as S, j) : (base as S);
  }, []);

  const buy = useCallback(
    async (titleId: string): Promise<BuyResult> => {
      const { endpoint, coinLabel } = optsRef.current;
      setBuying(titleId);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ titleId }),
        });
        const j = (await res.json().catch(() => null)) as Json | null;
        if (res.ok && j?.ok) {
          if (typeof j.staminaPotions === "number") {
            applyResourcePatch({ staminaPotions: j.staminaPotions });
          }
          setState((s) =>
            s
              ? {
                  ...applyResponse(s, j),
                  ownedTitleIds: [...new Set([...s.ownedTitleIds, titleId])],
                }
              : s,
          );
          return { ok: true, message: "칭호를 손에 넣었다." };
        }
        if (j?.error === "insufficient_coins") {
          if (typeof j.coins === "number") {
            const coins = j.coins;
            setState((s) => (s ? { ...s, coins } : s));
          }
          return { ok: false, message: `${coinLabel}이 부족하다.` };
        }
        if (j?.error === "already_owned") {
          if (typeof j.staminaPotions === "number") {
            applyResourcePatch({ staminaPotions: j.staminaPotions });
          }
          setState((s) =>
            s
              ? {
                  ...applyResponse(s, j),
                  ownedTitleIds: [...new Set([...s.ownedTitleIds, titleId])],
                }
              : s,
          );
          return { ok: false, message: "이미 보유한 칭호다." };
        }
        return { ok: false, message: "구매하지 못했다." };
      } catch {
        return { ok: false, message: "구매 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [applyResponse, applyResourcePatch],
  );

  const buyConsumable = useCallback(
    async (itemId: string): Promise<BuyResult> => {
      const { endpoint, coinLabel } = optsRef.current;
      setBuying(itemId);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const j = (await res.json().catch(() => null)) as Json | null;
        if (res.ok && j?.ok) {
          if (typeof j.staminaPotions === "number") {
            applyResourcePatch({ staminaPotions: j.staminaPotions });
          }
          setState((s) => (s ? applyResponse(s, j) : s));
          return { ok: true, message: "스태미나 회복약을 구매했다." };
        }
        if (j?.error === "insufficient_coins") {
          if (typeof j.coins === "number") {
            const coins = j.coins;
            setState((s) => (s ? { ...s, coins } : s));
          }
          return { ok: false, message: `${coinLabel}이 부족하다.` };
        }
        return { ok: false, message: "구매하지 못했다." };
      } catch {
        return { ok: false, message: "구매 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [applyResponse, applyResourcePatch],
  );

  return { state, setState, loading, error, buying, setBuying, buy, buyConsumable };
}
