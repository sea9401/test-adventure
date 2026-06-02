"use client";

import { useRouter } from "next/navigation";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";

// /character/inventory — 인벤토리(보유 아이템·재료, 장착).
export default function InventoryPage() {
  const router = useRouter();
  return <V2InventoryView onBack={() => router.push("/character")} />;
}
