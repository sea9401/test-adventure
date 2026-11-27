"use client";

import { useRouter } from "next/navigation";
import { V2PlazaHome, type PlazaAction } from "@/adventure/v2/V2PlazaHome";
import { useHubMenuStatus } from "@/adventure/v2/useHubMenuStatus";

// /plaza — 광장 탭 home. 게시판/랭킹/전체 소식 진입.
export default function PlazaPage() {
  const router = useRouter();
  const menuStatus = useHubMenuStatus();
  return (
    <V2PlazaHome
      menuStatus={menuStatus}
      onAction={(a: PlazaAction) => {
        switch (a.kind) {
          case "open-bulletin":
            router.push("/plaza/bulletin");
            break;
          case "open-rankings":
            router.push("/plaza/rankings");
            break;
          case "open-feed":
            router.push("/plaza/feed");
            break;
          case "open-inbox":
            router.push("/plaza/inbox");
            break;
          case "open-market":
            router.push("/plaza/market");
            break;
        }
      }}
    />
  );
}
