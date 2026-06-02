"use client";

import { useEffect } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2DungeonFloorView } from "@/adventure/v2/V2DungeonFloorView";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// /battle/dungeon/[floorId] — 던전 층 전투. floorId 검증 + 거점 없음 안전 폴백.
export default function DungeonFloorPage() {
  const router = useRouter();
  const params = useParams<{ floorId: string }>();
  const {
    currentOutpost,
    viewerName,
    viewerGender,
    playerSubtitle,
    stamina,
    setStamina,
    hp,
    setHp,
  } = useGameState();

  const n = Number(params.floorId);
  const valid =
    Number.isInteger(n) && MAIN_DUNGEON.floors.some((f) => f.id === n);

  // 거점이 사라진 사고용 안전 — 사냥터 목록으로 복귀. 보통 currentOutpost 는 시작 거점으로
  // 시드돼 null 이 아니므로 방어적 경로.
  useEffect(() => {
    if (valid && !currentOutpost) router.replace("/battle/dungeon");
  }, [valid, currentOutpost, router]);

  if (!valid) notFound();
  if (!currentOutpost) return null;

  const floorId = n as DungeonFloorId;
  return (
    <V2DungeonFloorView
      floorId={floorId}
      outpostId={currentOutpost.id}
      outpostName={currentOutpost.name}
      playerName={viewerName}
      playerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      stamina={stamina}
      setStamina={setStamina}
      hp={hp}
      setHp={setHp}
      onSeekHealing={() => router.push("/town/healing")}
      onBack={() => router.push("/battle/dungeon")}
    />
  );
}
