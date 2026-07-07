"use client";

import { useRouter } from "next/navigation";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";

// /town — 마을 탭 home. 치료소/은행/상점/대장간/낚시터/발굴 진입. (지도=전투 탭, 성장의 신전=캐릭터 탭으로 이관)
export default function TownPage() {
  const router = useRouter();
  return (
    <V2TownHome
      onAction={(a: TownAction) => {
        switch (a.kind) {
          case "open-healing":
            router.push("/town/healing");
            break;
          case "open-shop":
            router.push("/town/shop");
            break;
          case "open-smithy":
            router.push("/town/smithy");
            break;
          case "open-fishing":
            router.push("/town/fishing");
            break;
          case "open-farm":
            router.push("/town/farm");
            break;
          case "open-treasure":
            router.push("/town/treasure");
            break;
          case "open-bank":
            router.push("/town/bank");
            break;
        }
      }}
    />
  );
}
