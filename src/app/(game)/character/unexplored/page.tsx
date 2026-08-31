"use client";

import { useRouter } from "next/navigation";
import { V2UnexploredTreeView } from "@/adventure/v2/V2UnexploredTreeView";

export default function UnexploredCharacterPage() {
  const router = useRouter();
  return <V2UnexploredTreeView onBack={() => router.push("/character")} />;
}
