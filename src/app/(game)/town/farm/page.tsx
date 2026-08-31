"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdventurerFarmPanel } from "@/adventure/v2/AdventurerFarmPanel";
import { acknowledgeFarmReadyNotification } from "@/adventure/v2/farmReadyNotificationClient";

// /town/farm — 모험가 농장(생활 재배 루프).
export default function FarmPage() {
  const router = useRouter();
  useEffect(() => {
    void acknowledgeFarmReadyNotification();
  }, []);

  return (
    <AdventurerFarmPanel
      onBack={() => router.push("/town")}
      onOpenKitchen={() => router.push("/town/kitchen")}
      onOpenLifeWorkshop={() => router.push("/town/life-workshop/craft")}
    />
  );
}
