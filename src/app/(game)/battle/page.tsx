"use client";

import { useRouter } from "next/navigation";
import { isAtGridDungeonEntrance } from "@/adventure/data/v2/gridDungeon";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2BattleHome, type BattleAction } from "@/adventure/v2/V2BattleHome";

// /battle — 전투 탭 home. 사냥터/아레나/훈련장/토벌/지도 진입.
export default function BattlePage() {
  const router = useRouter();
  const { tilePos } = useGameState();
  const showGridDungeonEntry = tilePos ? isAtGridDungeonEntrance(tilePos) : false;

  return (
    <V2BattleHome
      showGridDungeonEntry={showGridDungeonEntry}
      onAction={(a: BattleAction) => {
        if (a.kind === "open-dungeons") router.push("/battle/dungeon");
        else if (a.kind === "open-grid-dungeon")
          router.push("/battle/grid-dungeon");
        else if (a.kind === "open-coop") router.push("/battle/coop");
        else if (a.kind === "open-subjugation")
          router.push("/battle/subjugation");
        else if (a.kind === "open-arena") router.push("/battle/arena");
        else if (a.kind === "open-sparring") router.push("/battle/sparring");
        else if (a.kind === "open-mastery-tower")
          router.push("/battle/mastery-tower");
        else if (a.kind === "open-map") router.push("/map");
      }}
    />
  );
}
