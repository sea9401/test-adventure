"use client";

import { useEffect } from "react";
import {
  notFound,
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2DungeonFloorView } from "@/adventure/v2/V2DungeonFloorView";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";

// /battle/dungeon/[floorId] — 무한 프론티어 던전 층 전투.
// floorId 는 depth 숫자(1~6→들판, 7+→프론티어 밴드). 들판만 authored, 7+ 는 데이터 도출.
// 최고 도달 깊이(frontierDepth)+1 까지 입장 가능 — 서버에서 depth_locked 로 최종 차단.
export default function DungeonFloorPage() {
  const router = useRouter();
  const params = useParams<{ floorId: string }>();
  // ?rareMap=<iid> = 레어맵 입장 모드 — 보유 지도로 농축 사냥(서버가 소유/깊이/판수 검증).
  const searchParams = useSearchParams();
  const rareMapIid = searchParams.get("rareMap");
  const {
    currentOutpost,
    viewerName,
    viewerGender,
    playerSubtitle,
    stamina,
    setStamina,
    hp,
    setHp,
    mp,
    setMp,
    frontierDepth,
    setFrontierDepth,
    refreshGameState,
    combatCooldown,
    setCombatCooldown,
    setAtRiskGold,
    offlineHunt,
  } = useGameState();

  const n = Number(params.floorId);
  // 유효한 깊이: 양의 정수, 최고 도달+1 이하. 단 MAX_FRONTIER_DEPTH(마지막 테마 끝)에서 캡 —
  //   그 너머는 콘텐츠 없음(서버 frontier_end). 레거시 >42 저장값도 여기서 막혀 우아하게 notFound.
  const valid =
    Number.isInteger(n) &&
    n >= 1 &&
    n <= Math.min(MAX_FRONTIER_DEPTH, frontierDepth + 1);

  // 거점이 사라진 사고용 안전 — 사냥터 목록으로 복귀.
  useEffect(() => {
    if (valid && !currentOutpost) router.replace("/battle/dungeon");
  }, [valid, currentOutpost, router]);

  if (!valid) notFound();
  if (!currentOutpost) return null;

  return (
    <V2DungeonFloorView
      floorId={n}
      outpostId={currentOutpost.id}
      outpostName={currentOutpost.name}
      playerName={viewerName}
      playerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      stamina={stamina}
      setStamina={setStamina}
      hp={hp}
      setHp={setHp}
      mp={mp}
      setMp={setMp}
      onSeekHealing={() => router.push("/town/healing")}
      onBack={() => router.push("/battle/dungeon")}
      frontierDepth={frontierDepth}
      onFrontierUnlocked={(newMax) => setFrontierDepth(Math.max(frontierDepth, newMax))}
      onLevelUp={refreshGameState}
      rareMapIid={rareMapIid}
      combatCooldown={combatCooldown}
      setCombatCooldown={setCombatCooldown}
      setAtRiskGold={setAtRiskGold}
      offlineHunt={offlineHunt}
      onRefresh={refreshGameState}
    />
  );
}
