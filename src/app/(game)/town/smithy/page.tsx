"use client";

import { useRouter } from "next/navigation";
import { V2CraftView } from "@/adventure/v2/V2CraftView";

// /town/smithy — 대장간(재료로 장비 제작).
export default function SmithyPage() {
  const router = useRouter();
  return <V2CraftView onBack={() => router.push("/town")} />;
}
