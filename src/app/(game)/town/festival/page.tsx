"use client";

import { useRouter } from "next/navigation";
import { LifeFestivalView } from "@/adventure/v2/LifeFestivalView";

// /town/festival — 생활 축제(주간 테마·축제 주문·주간 순위·축제 상점).
export default function LifeFestivalPage() {
  const router = useRouter();
  return <LifeFestivalView onBack={() => router.push("/map")} />;
}
