"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  COOP_SHOP_ENTRIES,
  type CoopShopEntry,
} from "@/adventure/v2/coop/coopShop";
import { useCoopShop } from "@/adventure/v2/coop/useCoopShop";
import { V2CoopTabs } from "@/adventure/v2/coop/V2CoopTabs";

const COOP_SHOP_GROUPS: {
  key: CoopShopEntry["category"];
  label: string;
}[] = [
  { key: "equipment_box", label: "장비 상자" },
  { key: "consumable", label: "보급품" },
  { key: "title", label: "칭호" },
];

function materialName(id: string): string {
  return V2_MATERIALS[id]?.name ?? id;
}

function costLabel(entry: CoopShopEntry): string {
  return Object.entries(entry.cost.materials)
    .map(([id, count]) => `${materialName(id)} ${count.toLocaleString()}`)
    .join(" + ");
}

function hasShopCost(
  entry: CoopShopEntry,
  materials: Record<string, number>,
): boolean {
  return Object.entries(entry.cost.materials).every(
    ([id, count]) => (materials[id] ?? 0) >= count,
  );
}

export function V2CoopShopView({
  onBack,
  onOpenBosses,
}: {
  onBack: () => void;
  onOpenBosses?: () => void;
}) {
  const coopShop = useCoopShop();
  const [shopMessage, setShopMessage] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleShopBuy = async (entry: CoopShopEntry) => {
    const result = await coopShop.buy(entry.itemId);
    setShopMessage(result);
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="협동 보스"
        onBack={onBack}
        right={
          coopShop.loading ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              불러오는 중…
            </span>
          ) : null
        }
      />

      <V2CoopTabs active="shop" onOpenBosses={onOpenBosses} />

      <Card padding="md" className="space-y-3">
        <div>
          <div className="text-sm font-semibold">협동 교환소</div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            토벌 보상으로 얻은 주화와 보스 재료를 교환합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            COOP_COIN_MATERIAL_ID,
            ...Object.values(COOP_BOSS_MATERIAL).map((m) => m.id),
          ].map((id) => (
            <span
              key={id}
              className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {materialName(id)}{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {(coopShop.state?.materials[id] ?? 0).toLocaleString()}
              </span>
            </span>
          ))}
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            스태미나 회복약{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {(coopShop.state?.staminaPotions ?? 0).toLocaleString()}
            </span>
          </span>
        </div>

        {coopShop.error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {coopShop.error}
          </p>
        )}
        {shopMessage && (
          <p
            className={`text-xs ${
              shopMessage.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {shopMessage.message}
          </p>
        )}

        <div className="space-y-3">
          {COOP_SHOP_GROUPS.map((group) => {
            const entries = COOP_SHOP_ENTRIES.filter(
              (entry) => entry.category === group.key,
            );
            return (
              <div key={group.key} className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {group.label}
                </div>
                <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {entries.map((entry) => {
                    const limit = coopShop.state?.limits[entry.itemId];
                    const limitReached = Boolean(
                      limit && limit.used >= limit.limit,
                    );
                    const owned =
                      entry.output.kind === "title" &&
                      Boolean(
                        coopShop.state?.ownedTitleIds.includes(
                          entry.output.titleId,
                        ),
                      );
                    const affordable = hasShopCost(
                      entry,
                      coopShop.state?.materials ?? {},
                    );
                    const disabled =
                      coopShop.loading ||
                      coopShop.buying != null ||
                      !coopShop.state ||
                      !affordable ||
                      limitReached ||
                      owned;
                    const buttonLabel = owned
                      ? "보유"
                      : limitReached
                        ? "제한"
                        : !affordable
                          ? "부족"
                          : coopShop.buying === entry.itemId
                            ? "교환 중"
                            : "교환";
                    return (
                      <div
                        key={entry.itemId}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold">
                              {entry.name}
                            </span>
                            {limit && (
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {limit.scope === "daily" ? "일일" : "주간"}{" "}
                                {limit.used}/{limit.limit}
                              </span>
                            )}
                            {owned && (
                              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                보유 중
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {entry.description}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                            비용: {costLabel(entry)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void handleShopBuy(entry)}
                          className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                        >
                          {buttonLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
