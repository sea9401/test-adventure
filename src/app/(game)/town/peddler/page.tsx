"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PeddlerView } from "@/adventure/v2/PeddlerView";
import { acknowledgePeddlerArrivalNotification } from "@/adventure/v2/peddlerArrivalNotificationClient";

// /town/peddler — 행상(교역로 파견·교역 등급·증표 교환).
export default function PeddlerPage() {
  const router = useRouter();
  // 행상 화면을 열면 도착해 있는 수레를 확인한 것으로 보고 종 알림을 지운다.
  useEffect(() => {
    void acknowledgePeddlerArrivalNotification();
  }, []);
  return <PeddlerView onBack={() => router.push("/map")} />;
}
