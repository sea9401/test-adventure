"use client";

import { useRouter } from "next/navigation";
import { V2BattleHome, type BattleAction } from "@/adventure/v2/V2BattleHome";

// /battle — 전투 탭 home. 사냥터/지도/아레나 진입.
export default function BattlePage() {
  const router = useRouter();
  return (
    <V2BattleHome
      onAction={(a: BattleAction) => {
        if (a.kind === "open-dungeons") router.push("/battle/dungeon");
        else if (a.kind === "open-map") router.push("/map");
        else if (a.kind === "open-arena") router.push("/battle/arena");
      }}
    />
  );
}
