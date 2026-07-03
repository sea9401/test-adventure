"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2RenameView } from "@/adventure/v2/V2RenameView";

// /hidden/rename?map=<iid> — 개명 신전. 「개명 신전 입장권」(인벤토리 소모품 탭)으로 입장.
export default function RenamePage() {
  const router = useRouter();
  const mapIid = useSearchParams().get("map") ?? "";
  const { viewerName, refreshGameState } = useGameState();
  return (
    <V2RenameView
      mapIid={mapIid}
      currentName={viewerName}
      onBack={() => router.push("/character/inventory")}
      onRenamed={() => void refreshGameState()}
    />
  );
}
