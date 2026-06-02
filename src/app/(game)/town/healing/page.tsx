"use client";

import { useRouter } from "next/navigation";
import { V2HealingView } from "@/adventure/v2/V2HealingView";

// /town/healing — 치료소(HP 회복).
export default function HealingPage() {
  const router = useRouter();
  return <V2HealingView onBack={() => router.push("/town")} />;
}
