"use client";

import { useRouter } from "next/navigation";
import { V2HousingView } from "@/adventure/v2/V2HousingView";

export default function HousingPage() {
  const router = useRouter();
  return <V2HousingView onBack={() => router.push("/character")} />;
}
