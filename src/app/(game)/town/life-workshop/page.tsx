"use client";

import { useRouter } from "next/navigation";
import { LifeWorkshopView } from "@/adventure/v2/LifeWorkshopView";

export default function LifeWorkshopPage() {
  const router = useRouter();
  return <LifeWorkshopView onBack={() => router.back()} />;
}
