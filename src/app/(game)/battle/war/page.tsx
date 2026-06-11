"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { V2WarView } from "@/adventure/v2/V2WarView";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { outpostsWithinHops } from "@/adventure/data/v2/outpostGraph";

// /battle/war — 전쟁 허브(전황 탭 + 작전 지도 탭). 전투 탭으로 묶인다.
// 지도 탭 = 현 위치 2홉 이내 거점만 보이는 국지 지도(전체 지도는 마을 탭).
const WAR_MAP_HOPS = 2;

export default function WarPage() {
  const router = useRouter();
  const {
    enterOutpost,
    travelTo,
    occupations,
    treasuries,
    viewerUserId,
    currentOutpost,
    discoveredIds,
  } = useGameState();

  const visibleIds = useMemo(
    () =>
      currentOutpost
        ? outpostsWithinHops(currentOutpost.id, WAR_MAP_HOPS)
        : null,
    [currentOutpost],
  );

  return (
    <V2WarView
      onBack={() => router.push("/battle")}
      onOpenOutpost={(id) => router.push(`/outpost/${id}?from=war`)}
      mapSlot={
        visibleIds ? (
          <ContinentMap
            onOutpostEnter={(o) => enterOutpost(o, { from: "war" })}
            onTravelTo={travelTo}
            occupations={occupations}
            treasuries={treasuries}
            viewerUserId={viewerUserId}
            currentOutpostId={currentOutpost?.id ?? null}
            discoveredIds={discoveredIds}
            visibleIds={visibleIds}
          />
        ) : undefined
      }
    />
  );
}
