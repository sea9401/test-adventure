"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { V2WarView } from "@/adventure/v2/V2WarView";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import {
  ClaimResultCard,
  type ClaimResult,
} from "@/adventure/v2/ClaimResultCard";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { outpostsWithinHops } from "@/adventure/data/v2/outpostGraph";

// /battle/war — 전쟁 허브(작전 지도 탭 + 전황 탭). 전투 탭으로 묶인다.
// 지도 탭 = 현 위치 2홉 이내 거점만 보이는 국지 지도(전체 지도는 마을 탭).
// 작전 지도는 전쟁 전용(warMode) — 인접 1칸 거점에 "공격" 버튼, 이동은 마을 지도만.
const WAR_MAP_HOPS = 2;

export default function WarPage() {
  const router = useRouter();
  const {
    occupations,
    treasuries,
    viewerUserId,
    viewerGuildId,
    currentOutpost,
    refreshOccupations,
  } = useGameState();

  const visibleIds = useMemo(
    () =>
      currentOutpost
        ? outpostsWithinHops(currentOutpost.id, WAR_MAP_HOPS)
        : null,
    [currentOutpost],
  );

  // 지도 공격 — 거점 화면의 점령 시도와 동일한 claim 흐름을 지도 팝업에서 바로.
  const [attackBusy, setAttackBusy] = useState(false);
  const [lastClaimResult, setLastClaimResult] = useState<{
    outpostId: string;
    result: ClaimResult;
  } | null>(null);

  async function attack(outpostId: string) {
    setAttackBusy(true);
    setLastClaimResult(null);
    try {
      const res = await fetch("/api/v2/outpost/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId }),
      });
      let json: ClaimResult | null = null;
      try {
        json = (await res.json()) as ClaimResult;
      } catch {
        setLastClaimResult({
          outpostId,
          result: { ok: false, error: `http ${res.status} (응답 JSON 아님)` },
        });
        return;
      }
      if (!json) {
        setLastClaimResult({
          outpostId,
          result: { ok: false, error: `http ${res.status} (빈 응답)` },
        });
        return;
      }
      // 친절한 에러 문구 — OutpostView attemptClaim 과 동일 매핑 + 인접/보급선.
      const raw = json as ClaimResult & {
        requiredPower?: number;
        playerPower?: number;
      };
      if (!raw.ok && raw.error === "insufficient_power") {
        setLastClaimResult({
          outpostId,
          result: {
            ok: false,
            error: `수비 전투력 ${(raw.requiredPower ?? 0).toLocaleString()} 필요 — 내 전투력 ${(raw.playerPower ?? 0).toLocaleString()}`,
          },
        });
        return;
      }
      if (!raw.ok && raw.error === "not_adjacent") {
        setLastClaimResult({
          outpostId,
          result: {
            ok: false,
            error: "현재 거점 또는 인접 1칸 거점만 공격할 수 있습니다",
          },
        });
        return;
      }
      if (!raw.ok && raw.error === "no_supply_line") {
        setLastClaimResult({
          outpostId,
          result: {
            ok: false,
            error: "보급선 없음 — 아군 보유 거점이나 중립 자유도시에 인접한 거점만 점령 가능",
          },
        });
        return;
      }
      setLastClaimResult({ outpostId, result: json });
      if (json.ok && (json.won || json.pvp)) {
        void refreshOccupations();
      }
    } catch (err) {
      setLastClaimResult({
        outpostId,
        result: { ok: false, error: `network: ${(err as Error).message}` },
      });
    } finally {
      setAttackBusy(false);
    }
  }

  return (
    <V2WarView
      onBack={() => router.push("/battle")}
      onOpenOutpost={(id) => router.push(`/outpost/${id}?from=war`)}
      mapSlot={
        visibleIds ? (
          <div className="space-y-3">
            <ContinentMap
              warMode
              onAttack={(o) => void attack(o.id)}
              attackBusy={attackBusy}
              occupations={occupations}
              treasuries={treasuries}
              viewerUserId={viewerUserId}
              viewerGuildId={viewerGuildId}
              currentOutpostId={currentOutpost?.id ?? null}
              visibleIds={visibleIds}
            />
            {lastClaimResult && (
              <ClaimResultCard
                result={lastClaimResult.result}
                outpostName={
                  OUTPOST_BY_ID.get(lastClaimResult.outpostId)?.name ?? ""
                }
                onClose={() => setLastClaimResult(null)}
              />
            )}
          </div>
        ) : undefined
      }
    />
  );
}
