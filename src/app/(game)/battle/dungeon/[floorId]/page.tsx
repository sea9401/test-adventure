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
import {
  isHuntStageDepth,
  nextHuntStageDepth,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import {
  dungeonFloorBackHref,
  normalHuntFloorHref,
  rareMapEntryHref,
} from "@/adventure/v2/dungeonNavigation";

// /battle/dungeon/[floorId] — 무한 프론티어 던전 층 전투.
// floorId 는 내부 depth 숫자. 일반 사냥은 테마당 대표 깊이 2·4·6만 사용하며,
// 레거시 희귀 지도는 기존 깊이를 그대로 허용한다. 서버가 최종 소유·해금 검증한다.
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
    viewerLevel,
    viewerLevelCap,
    viewerJobTier,
    viewerClass,
    viewerExp,
    viewerExpToNext,
    playerSubtitle,
    viewerProficiency,
    stamina,
    staminaMax,
    adventureSupportActive,
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
  const nextStageDepth = nextHuntStageDepth(frontierDepth);
  const normalStageUnlocked =
    isHuntStageDepth(n) &&
    (n <= frontierDepth || n === nextStageDepth);
  const rareMapDepthUnlocked =
    rareMapIid != null && n <= Math.min(MAX_FRONTIER_DEPTH, frontierDepth + 1);
  const valid =
    validDepthShape && (normalStageUnlocked || rareMapDepthUnlocked);
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
      currentLevel={viewerLevel}
      currentLevelCap={viewerLevelCap}
      currentJobTier={viewerJobTier}
      initialExp={viewerExp}
      initialMaxExp={viewerExpToNext}
      initialHpCharges={hpCharges}
      initialMpCharges={mpCharges}
      playerSubtitle={playerSubtitle}
      playerProficiency={viewerProficiency}
      stamina={stamina}
      staminaMax={staminaMax}
      adventureSupportActive={adventureSupportActive}
      setStamina={setStamina}
      hp={hp}
      setHp={setHp}
      mp={mp}
      setMp={setMp}
      playerCombat={playerCombat}
      playerPrimaryAttack={viewerClass === "mage" ? "magic" : "physical"}
      onSeekHealing={() => router.push("/town/healing")}
      // 일반 사냥은 현재 테마의 깊이 선택으로, 레어맵은 다른 열린 지도를 바로 고를 수 있게
      // 사냥터 메인으로 돌아간다. 비밀 상점·개명 신전의 레어맵 복귀 위치와도 통일한다.
      onBack={() => router.push(dungeonFloorBackHref(n, rareMapIid))}
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
      onRecoveryChargesChange={applyResourcePatch}
      onEnterRareMap={(map) => router.push(rareMapEntryHref(map))}
      onReturnToNormalHunt={() =>
        router.push(normalHuntFloorHref(n))
      }
      offlineHunt={offlineHunt}
      onRefresh={refreshGameState}
    />
  );
}
