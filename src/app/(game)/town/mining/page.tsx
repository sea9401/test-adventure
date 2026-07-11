"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MiningPanel } from "@/adventure/v2/MiningPanel";
import { isMiningSpotId } from "@/adventure/data/v2/miningSpots";

export default function MiningPage() {
  const router = useRouter();
  const params = useSearchParams();
  const spotParam = params.get("spot");
  const spotId = spotParam && isMiningSpotId(spotParam) ? spotParam : null;

  useEffect(() => {
    if (!spotId) router.replace("/map");
  }, [router, spotId]);

  if (!spotId) return null;

  return (
    <MiningPanel
      key={spotId}
      spotId={spotId}
      onBack={() => router.push("/map")}
    />
  );
}
