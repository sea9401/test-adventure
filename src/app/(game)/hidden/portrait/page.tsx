"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2PortraitView } from "@/adventure/v2/V2PortraitView";

// /hidden/portrait?map=<iid> — 화공의 공방. 「화공의 공방 지도」(인벤토리 소모품 탭)로 입장.
export default function PortraitPage() {
  const router = useRouter();
  const mapIid = useSearchParams().get("map") ?? "";
  const { viewerGender, refreshGameState } = useGameState();
  return (
    <V2PortraitView
      mapIid={mapIid}
      currentAvatar={viewerGender}
      onBack={() => router.push("/character/inventory")}
      onChanged={() => void refreshGameState()}
    />
  );
}
