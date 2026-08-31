"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { V2EnhanceView } from "@/adventure/v2/V2EnhanceView";

// /town/smithy — 대장간(장비 강화). 옛 제작 화면(V2CraftView)은 제작 콘텐츠 삭제(#621)
// 이후 빈 깡통이라 강화 허브로 교체 — docs/v2-equipment-enhance-plan.md PR-3.
function SmithyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const initialMode = requestedMode === "liberation" ? requestedMode : undefined;
  const initialItemIid = initialMode
    ? searchParams.get("item") ?? undefined
    : undefined;
  return (
    <V2EnhanceView
      onBack={() => router.push("/town")}
      initialMode={initialMode}
      initialItemIid={initialItemIid}
    />
  );
}

export default function SmithyPage() {
  return (
    <Suspense fallback={null}>
      <SmithyPageContent />
    </Suspense>
  );
}
