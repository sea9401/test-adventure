"use client";

import { useRouter } from "next/navigation";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";

// /town — 마을 탭 home. 생활 지도/치료소/은행/상점/대장간/농장/주방 진입.
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
          case "open-exchange":
            router.push("/town/exchange");
            break;
          case "open-smithy":
            router.push("/town/smithy");
            break;
          case "open-farm":
            router.push("/town/farm");
            break;
          case "open-kitchen":
            router.push("/town/kitchen");
            break;
          case "open-bank":
            router.push("/town/bank");
            break;
          case "open-map":
            router.push("/map");
            break;
        }
      }}
    />
  );
}
