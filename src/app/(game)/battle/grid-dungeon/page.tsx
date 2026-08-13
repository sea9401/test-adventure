"use client";

import { useRouter } from "next/navigation";
import { useRefreshGameState } from "@/adventure/v2/GameStateRefreshContext";
import { V2GridDungeonView } from "@/adventure/v2/grid-dungeon/V2GridDungeonView";

export default function GridDungeonPage() {
  const router = useRouter();
  const refreshGameState = useRefreshGameState();
  return (
    <V2GridDungeonView
      onBackToMap={() => router.push("/battle")}
      onRefreshGameState={refreshGameState}
    />
  );
}
