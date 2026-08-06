import { Suspense } from "react";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { UnifiedExchangeView } from "@/adventure/v2/UnifiedExchangeView";
import { PageShell } from "@/components/ui/PageShell";
import { SURFACE_CARD } from "@/components/ui/surfaces";

export const metadata = {
  title: "통합 교환소 — 무슨무슨게임",
};

function ExchangeFallback() {
  return (
    <PageShell>
      <div
        className={`${SURFACE_CARD} px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400`}
      >
        통합 교환소를 여는 중...
      </div>
    </PageShell>
  );
}

export default function UnifiedExchangePage() {
  const museunOpen =
    process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true";

  return (
    <Suspense fallback={<ExchangeFallback />}>
      <UnifiedExchangeView
        honorOpen={V2_SETTLEMENT_WARFARE}
        museunOpen={museunOpen}
      />
    </Suspense>
  );
}
