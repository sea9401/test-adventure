"use client";

import { useRouter } from "next/navigation";
import { WorldRumorMapView } from "@/adventure/v2/WorldRumorMapView";

export default function MapPage() {
  const router = useRouter();
  return <WorldRumorMapView onBack={() => router.push("/town")} />;
}
