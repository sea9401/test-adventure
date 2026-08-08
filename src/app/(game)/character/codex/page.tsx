"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { V2CodexView } from "@/adventure/v2/V2CodexView";

// /character/codex — 사냥터 드랍과 수집·성장 기록을 모아 보는 모험의 서.
export default function CodexPage() {
  const router = useRouter();
  return (
    <Suspense fallback={null}>
      <V2CodexView onBack={() => router.push("/character")} />
    </Suspense>
  );
}
