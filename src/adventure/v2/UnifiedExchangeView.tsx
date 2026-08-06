"use client";

import { useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CoinVertical,
  FishSimple,
  Medal,
  PottedPlant,
  Scales,
  Storefront,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  normalizeUnifiedExchangeShopId,
  unifiedExchangeShops,
  type UnifiedExchangeShopId,
} from "./unifiedExchange";

function ShopLoading() {
  return (
    <div
      className={`${SURFACE_INSET} px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400`}
      role="status"
    >
      상점 정보를 불러오는 중...
    </div>
  );
}

const GeneralShopPanel = dynamic(
  () => import("./V2ShopView").then((module) => module.V2ShopView),
  { loading: ShopLoading },
);
const FarmShopPanel = dynamic(
  () =>
    import("./AdventurerFarmPanel").then(
      (module) => module.FarmExchangeShopPanel,
    ),
  { loading: ShopLoading },
);
const FishingShopPanel = dynamic(
  () =>
    import("./FishingShopPanel").then((module) => module.FishingShopPanel),
  { loading: ShopLoading },
);
const ArenaShopPanel = dynamic(
  () => import("./ArenaShopPanel").then((module) => module.ArenaShopPanel),
  { loading: ShopLoading },
);
const CoopShopPanel = dynamic(
  () =>
    import("./coop/V2CoopShopView").then(
      (module) => module.V2CoopShopView,
    ),
  { loading: ShopLoading },
);
const GuildShopPanel = dynamic(
  () =>
    import("./guild/GuildTradePostPanel").then(
      (module) => module.GuildTradePostPanel,
    ),
  { loading: ShopLoading },
);
const HonorShopPanel = dynamic(() => import("./HonorShopPanel"), {
  loading: ShopLoading,
});
const MuseunShopPanel = dynamic(
  () =>
    import("./MuseunCoinShopView").then(
      (module) => module.MuseunCoinShopView,
    ),
  { loading: ShopLoading },
);

const SHOP_ICONS: Record<UnifiedExchangeShopId, ReactNode> = {
  general: <Storefront size={16} weight="duotone" />,
  farm: <PottedPlant size={16} weight="duotone" />,
  fishing: <FishSimple size={16} weight="duotone" />,
  arena: <Trophy size={16} weight="duotone" />,
  coop: <UsersThree size={16} weight="duotone" />,
  guild: <Scales size={16} weight="duotone" />,
  honor: <Medal size={16} weight="duotone" />,
  museun: <CoinVertical size={16} weight="duotone" />,
};

export function UnifiedExchangeView({
  honorOpen,
  museunOpen,
}: {
  honorOpen: boolean;
  museunOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shops = useMemo(
    () => unifiedExchangeShops({ honorOpen, museunOpen }),
    [honorOpen, museunOpen],
  );
  const activeShopId = normalizeUnifiedExchangeShopId(
    searchParams.get("shop"),
    shops,
  );
  const activeShop =
    shops.find((shop) => shop.id === activeShopId) ?? shops[0];
  const tabs = shops.map((shop) => ({
    key: shop.id,
    label: shop.label,
    icon: SHOP_ICONS[shop.id],
  }));

  const selectShop = (shopId: UnifiedExchangeShopId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("shop", shopId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title="통합 교환소"
        onBack={() => router.push("/town")}
      />

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="space-y-1 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h1 className="text-base font-bold">모든 콘텐츠 상점</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            전용 재화와 구매 제한은 그대로 유지되며, 선택한 상점만 불러옵니다.
          </p>
        </div>

        <TabBar
          tabs={tabs}
          active={activeShopId}
          onChange={selectShop}
          ariaLabel="통합 교환소 상점 선택"
          variant="underline"
          scrollable
          className="px-1"
        />

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-bold">{activeShop.label}</h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {activeShop.description}
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {activeShop.category}
            </span>
          </div>

          <ActiveShop shopId={activeShopId} />
        </div>
      </section>
    </PageShell>
  );
}

function ActiveShop({ shopId }: { shopId: UnifiedExchangeShopId }) {
  switch (shopId) {
    case "general":
      return <GeneralShopPanel embedded />;
    case "farm":
      return <FarmShopPanel />;
    case "fishing":
      return <FishingShopPanel embedded />;
    case "arena":
      return <ArenaShopPanel />;
    case "coop":
      return <CoopShopPanel embedded />;
    case "guild":
      return <GuildShopPanel shopOnly />;
    case "honor":
      return <HonorShopPanel />;
    case "museun":
      return <MuseunShopPanel embedded />;
  }
}
