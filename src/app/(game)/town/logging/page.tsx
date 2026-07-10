"use client";

import { useRouter } from "next/navigation";
import { WoodcuttingPanel } from "@/adventure/v2/WoodcuttingPanel";

export default function LoggingPage() {
  const router = useRouter();
  return <WoodcuttingPanel onBack={() => router.push("/town")} />;
}
