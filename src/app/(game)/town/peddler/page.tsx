"use client";

import { useRouter } from "next/navigation";
import { PeddlerView } from "@/adventure/v2/PeddlerView";

// /town/peddler — 행상(교역로 파견·단골 등급·증표 교환).
export default function PeddlerPage() {
  const router = useRouter();
  return <PeddlerView onBack={() => router.push("/map")} />;
}
