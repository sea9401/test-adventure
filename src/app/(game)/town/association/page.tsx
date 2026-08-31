"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdventurerAssociationView } from "@/adventure/v2/association/AdventurerAssociationView";
import { useGameState } from "@/adventure/v2/GameStateProvider";

export default function AdventurerAssociationPage() {
  const router = useRouter();
  const { gameStateLoaded, viewerGuildId } = useGameState();

  useEffect(() => {
    if (gameStateLoaded && viewerGuildId != null) {
      router.replace("/town");
    }
  }, [gameStateLoaded, router, viewerGuildId]);

  if (!gameStateLoaded || viewerGuildId != null) return null;
  return <AdventurerAssociationView onBack={() => router.push("/town")} />;
}
