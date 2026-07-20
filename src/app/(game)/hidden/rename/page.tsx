"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2RenameView } from "@/adventure/v2/V2RenameView";

// /hidden/rename?map=<iid> — 열린 「개명 신전 지도」로 입장.
// ?cashItem=rename_permit 은 별도의 캐시 개명 허가증 진입 경로.
export default function RenamePage() {
  const router = useRouter();
  const mapIid = useSearchParams().get("map") ?? "";
  const cashItemId =
    useSearchParams().get("cashItem") === "rename_permit"
      ? "rename_permit"
      : undefined;
  const { viewerName, refreshGameState } = useGameState();
  return (
    <V2RenameView
      mapIid={mapIid}
      cashItemId={cashItemId}
      currentName={viewerName}
      onBack={() =>
        router.push(cashItemId ? "/character/inventory" : "/battle/dungeon")
      }
      onRenamed={() => {
        void refreshGameState();
        router.push(cashItemId ? "/character/inventory" : "/battle/dungeon");
      }}
    />
  );
}
