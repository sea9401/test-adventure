import { SparringPageClient } from "@/adventure/v2/SparringPageClient";

// /battle/sparring — 훈련장(허수아비 모의전). 옛 마을 훈련장에서 전투 탭으로 이동.
export default async function SparringPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[];
    target?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <SparringPageClient
      initialMode={query.mode === "friendly" ? "friendly" : "dummy"}
      initialTargetName={
        typeof query.target === "string" ? query.target : undefined
      }
    />
  );
}
