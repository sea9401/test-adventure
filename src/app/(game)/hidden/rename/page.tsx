"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2RenameView } from "@/adventure/v2/V2RenameView";

// /hidden/rename?map=<iid> 또는 ?cashItem=rename_permit — 개명 신전.
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
      onBack={() => router.push("/character/inventory")}
      onRenamed={() => void refreshGameState()}
    />
  );
}
