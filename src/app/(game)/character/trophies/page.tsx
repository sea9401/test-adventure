"use client";

import { useRouter } from "next/navigation";
import { V2TrophyCabinetView } from "@/adventure/v2/V2TrophyCabinetView";

export default function TrophyCabinetPage() {
  const router = useRouter();
  return (
    <V2TrophyCabinetView onBack={() => router.push("/character")} />
  );
}
