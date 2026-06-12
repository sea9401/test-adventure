"use client";

import { useRouter } from "next/navigation";
import { V2BattleHome, type BattleAction } from "@/adventure/v2/V2BattleHome";

// /battle — 전투 탭 home. 사냥터/전황/아레나/허수아비 진입. (지도는 마을 탭)
export default function BattlePage() {
  const router = useRouter();
  return (
    <V2BattleHome
      onAction={(a: BattleAction) => {
        if (a.kind === "open-dungeons") router.push("/battle/dungeon");
        else if (a.kind === "open-coop") router.push("/battle/coop");
        else if (a.kind === "open-war") router.push("/battle/war");
        else if (a.kind === "open-subjugation")
          router.push("/battle/subjugation");
        else if (a.kind === "open-arena") router.push("/battle/arena");
        else if (a.kind === "open-sparring") router.push("/battle/sparring");
      }}
    />
  );
}
