"use client";

import { useRouter } from "next/navigation";
import { V2CombatLoadoutPresetsView } from "@/adventure/v2/V2CombatLoadoutPresetsView";

export default function CombatLoadoutPresetsPage() {
  const router = useRouter();
  return (
    <V2CombatLoadoutPresetsView onBack={() => router.push("/character")} />
  );
}
