"use client";

import { useRouter } from "next/navigation";
import {
  V2CharacterMenu,
  type CharacterAction,
} from "@/adventure/v2/V2CharacterMenu";

// /character — 캐릭터 탭 home. 내 정보/인벤토리/모험의 서 진입.
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
          case "open-codex":
            router.push("/character/codex");
            break;
        }
      }}
    />
  );
}
