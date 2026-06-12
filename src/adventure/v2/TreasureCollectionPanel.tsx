"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TreasureCollectionView,
  type CollectionInstance,
} from "./TreasureCollectionView";

// 발굴 보관함 패널 — /api/v2/treasure/collection 에서 인스턴스·조각·코인을 가져와 뷰에 주입.
// 분해(/dismantle)=코인 적립, 판매(/sell)=골드 적립(감정가×배수). 상점 진입은 onOpenShop 위임.
export function TreasureCollectionPanel({
  onBack,
  onOpenShop,
  onOpenDig,
  onOpenLeaderboard,
}: {
  onBack: () => void;
  onOpenShop: () => void;
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
}) {
  const [instances, setInstances] = useState<CollectionInstance[]>([]);
  const [fragments, setFragments] = useState(0);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dismantling, setDismantling] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/treasure/collection")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok) {
          if (Array.isArray(j.instances)) {
            setInstances(j.instances as CollectionInstance[]);
          }
          if (typeof j.fragments === "number") setFragments(j.fragments);
          if (typeof j.coins === "number") setCoins(j.coins);
        }
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onDismantle = useCallback(async (instanceId: string) => {
    setDismantling(instanceId);
    try {
      const res = await fetch("/api/v2/treasure/dismantle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setInstances((xs) => xs.filter((x) => x.instanceId !== instanceId));
        if (typeof j.coins === "number") setCoins(j.coins);
      }
    } catch {
      // 무시 — 상태 유지(다음 시도 가능).
    } finally {
      setDismantling(null);
    }
  }, []);

  const onSell = useCallback(async (instanceId: string) => {
    setSelling(instanceId);
    try {
      const res = await fetch("/api/v2/treasure/sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setInstances((xs) => xs.filter((x) => x.instanceId !== instanceId));
      }
    } catch {
      // 무시 — 상태 유지(다음 시도 가능).
    } finally {
      setSelling(null);
    }
  }, []);

  return (
    <TreasureCollectionView
      onOpenDig={onOpenDig}
      onOpenLeaderboard={onOpenLeaderboard}
      instances={instances}
      fragments={fragments}
      coins={coins}
      loading={loading}
      dismantling={dismantling}
      selling={selling}
      onBack={onBack}
      onDismantle={onDismantle}
      onSell={onSell}
      onOpenShop={onOpenShop}
    />
  );
}
