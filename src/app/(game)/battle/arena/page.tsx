"use client";

import { useRouter } from "next/navigation";
import { V2ArenaView } from "@/adventure/v2/V2ArenaView";

// /battle/arena — 아레나(1:1 단판 결투).
export default function ArenaPage() {
  const router = useRouter();
  return <V2ArenaView onBack={() => router.push("/battle")} />;
}
