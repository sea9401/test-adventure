"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import {
  V2CharacterMenu,
  unexploredLockLabel,
  type CharacterAction,
} from "@/adventure/v2/V2CharacterMenu";

// /character — 캐릭터 탭 home. 생활 기록은 내 정보 요약에서 진입하고, 이 메뉴에는 별도로 두지 않는다.
export default function CharacterPage() {
  const router = useRouter();
  const { viewerLevel, gameStateLoaded } = useGameState();
  return (
    <V2CharacterMenu
      unexploredLocked={unexploredLockLabel(viewerLevel, gameStateLoaded)}
      onAction={(a: CharacterAction) => {
        switch (a.kind) {
          case "open-emblems":
            router.push("/character/emblems");
            break;
          case "open-info":
            router.push("/character/info");
            break;
          case "open-inventory":
            router.push("/character/inventory");
            break;
          case "open-skills":
            router.push("/character/skills");
            break;
          case "open-presets":
            router.push("/character/presets");
            break;
          case "open-shrine":
            router.push("/character/shrine");
            break;
          case "open-quests":
            router.push("/quests");
            break;
          case "open-trophies":
            router.push("/character/trophies");
            break;
          case "open-codex":
            router.push("/character/codex");
            break;
          case "open-unexplored":
            router.push("/character/unexplored");
            break;
        }
      }}
    />
  );
}
