"use client";

import { useEffect, useState } from "react";
import {
  TreasureCollectionView,
  type CollectionInstance,
} from "./TreasureCollectionView";

// 발굴 보관함 패널 — 마운트 시 /api/v2/treasure/collection 에서 인스턴스·조각 수를 가져와
// TreasureCollectionView 에 주입. V2GameFlow 마을 탭에서 마운트.
export function TreasureCollectionPanel({ onBack }: { onBack: () => void }) {
  const [instances, setInstances] = useState<CollectionInstance[]>([]);
  const [fragments, setFragments] = useState(0);
  const [loading, setLoading] = useState(true);

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

  return (
    <TreasureCollectionView
      instances={instances}
      fragments={fragments}
      loading={loading}
      onBack={onBack}
    />
  );
}
