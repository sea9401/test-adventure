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
import { MAX_FRONTIER_DEPTH, themeFirstDepth } from "@/adventure/data/v2/dungeon";

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
    viewerExp,
    viewerExpToNext,
    playerSubtitle,
    viewerProficiency,
    stamina,
    setStamina,
    hpCharges,
    mpCharges,
    hp,
    setHp,
    mp,
    setMp,
    playerCombat,
    frontierDepth,
    setFrontierDepth,
    refreshGameState,
    applyResourcePatch,
    gameStateLoaded,
    combatCooldown,
    setCombatCooldown,
    offlineHunt,
  } = useGameState();

  const n = Number(params.floorId);
  // 형식/콘텐츠 끝은 즉시 판정하되, 최고 도달 깊이(frontierDepth)는 me/state 로딩 뒤 판정한다.
  // 새로고침 직후 기본값(2)으로 깊은 사냥터를 404 처리하는 레이스를 막는다.
  const validDepthShape =
    Number.isInteger(n) && n >= 1 && n <= MAX_FRONTIER_DEPTH;
  const unlockedDepthLimit = Math.min(MAX_FRONTIER_DEPTH, frontierDepth + 1);
  const valid = validDepthShape && n <= unlockedDepthLimit;
  const waitingForGameState =
    validDepthShape && !valid && !gameStateLoaded;

  // 거점이 사라진 사고용 안전 — 사냥터 목록으로 복귀.
  useEffect(() => {
    if (gameStateLoaded && valid && !currentOutpost) {
      router.replace("/battle/dungeon");
    }
  }, [gameStateLoaded, valid, currentOutpost, router]);

  if (!validDepthShape) notFound();
  if (waitingForGameState) return null;
  if (!valid) notFound();
  if (!currentOutpost) return null;

  return (
    <V2DungeonFloorView
      floorId={n}
      outpostId={currentOutpost.id}
      outpostName={currentOutpost.name}
      playerName={viewerName}
      playerGender={viewerGender}
      initialExp={viewerExp}
      initialMaxExp={viewerExpToNext}
      initialHpCharges={hpCharges}
      initialMpCharges={mpCharges}
      playerSubtitle={playerSubtitle}
      playerProficiency={viewerProficiency}
      stamina={stamina}
      setStamina={setStamina}
      hp={hp}
      setHp={setHp}
      mp={mp}
      setMp={setMp}
      playerCombat={playerCombat}
      onSeekHealing={() => router.push("/town/healing")}
      // 뒤로 = 테마 선택이 아니라 그 테마의 깊이 선택으로(들판1→들판2 빠른 이동). 현재 깊이가
      //   속한 테마 블록의 첫 깊이를 openDepth 로 넘겨 해당 테마를 펼친 채 목록을 연다.
      onBack={() =>
        router.push(`/battle/dungeon?openDepth=${themeFirstDepth(n)}`)
      }
      frontierDepth={frontierDepth}
      onFrontierUnlocked={(newMax) => setFrontierDepth(Math.max(frontierDepth, newMax))}
      onLevelUp={refreshGameState}
      rareMapIid={rareMapIid}
      combatCooldown={combatCooldown}
      setCombatCooldown={setCombatCooldown}
      setAtRiskGold={(n) => applyResourcePatch({ atRiskGold: n })}
      onGoldChange={(n) => applyResourcePatch({ gold: n })}
      onProficiencyChange={(n) =>
        applyResourcePatch({ viewerProficiency: n })
      }
      offlineHunt={offlineHunt}
      onRefresh={refreshGameState}
    />
  );
}
