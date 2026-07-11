"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WoodcuttingPanel } from "@/adventure/v2/WoodcuttingPanel";
import { isWoodcuttingSpotId } from "@/adventure/data/v2/woodcuttingSpots";

export default function LoggingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const spotParam = params.get("spot");
  const spotId = spotParam && isWoodcuttingSpotId(spotParam) ? spotParam : null;

  useEffect(() => {
    if (!spotId) router.replace("/map");
  }, [router, spotId]);

  if (!spotId) return null;

  return (
    <WoodcuttingPanel
      key={spotId}
      spotId={spotId}
      onBack={() => router.push("/map")}
    />
  );
}
