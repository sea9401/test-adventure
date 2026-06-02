"use client";

import { useRouter } from "next/navigation";
import { V2CodexView } from "@/adventure/v2/V2CodexView";

// /character/codex — 모험의 서(재료 도감).
export default function CodexPage() {
  const router = useRouter();
  return <V2CodexView onBack={() => router.push("/character")} />;
}
