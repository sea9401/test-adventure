"use client";

import { useRouter } from "next/navigation";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";

// /character/info — 내 정보(레벨·능력치·장비).
export default function CharacterInfoPage() {
  const router = useRouter();
  return <V2CharacterScreen onBack={() => router.push("/character")} />;
}
