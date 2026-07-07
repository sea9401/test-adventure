"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2GridDungeonView } from "@/adventure/v2/grid-dungeon/V2GridDungeonView";

export default function GridDungeonPage() {
  const router = useRouter();
  const { refreshGameState } = useGameState();
  return (
    <V2GridDungeonView
      onBackToMap={() => router.push("/battle")}
      onRefreshGameState={refreshGameState}
    />
  );
}
