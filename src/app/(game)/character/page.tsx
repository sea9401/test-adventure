"use client";

import { useRouter } from "next/navigation";
import {
  V2CharacterMenu,
  type CharacterAction,
} from "@/adventure/v2/V2CharacterMenu";

// /character — 캐릭터 탭 home. 생활 기록은 내 정보 요약에서 진입하고, 이 메뉴에는 별도로 두지 않는다.
export default function CharacterPage() {
  const router = useRouter();
  return (
    <V2CharacterMenu
      onAction={(a: CharacterAction) => {
        switch (a.kind) {
          case "open-info":
            router.push("/character/info");
            break;
          case "open-inventory":
            router.push("/character/inventory");
            break;
          case "open-skills":
            router.push("/character/skills");
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
        }
      }}
    />
  );
}
