"use client";

import { useEffect } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2BossView } from "@/adventure/v2/V2BossView";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { getFieldBoss } from "@/adventure/data/v2/dungeonBosses";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// /battle/dungeon/[floorId]/boss — 사냥터 필드 보스 전용 페이지(사냥 화면과 분리).
// 보스 없는 floor 거나 거점 없으면 안전 폴백.
export default function DungeonBossPage() {
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
    Number.isInteger(n) &&
    MAIN_DUNGEON.floors.some((f) => f.id === n) &&
    getFieldBoss(n as DungeonFloorId) != null;

  // 거점이 사라진 사고용 안전 — 사냥터 목록으로 복귀.
  useEffect(() => {
    if (valid && !currentOutpost) router.replace("/battle/dungeon");
  }, [valid, currentOutpost, router]);

  if (!valid) notFound();
  if (!currentOutpost) return null;

  const floorId = n as DungeonFloorId;
  return (
    <V2BossView
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
