"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousGearKind,
  DangerousLine,
  DangerousReel,
  DangerousRod,
} from "@/adventure/data/v2/dangerousFishing";
import type { BuyResult } from "./useFishingShop";
import type { DangerousFishingViewModel } from "./useDangerousFishing";
import { CoinAmount } from "./CoinAmount";
import {
  DangerousFishingExchangeSection,
  type DangerousFishingExchangeSectionProps,
} from "./DangerousFishingExchangeSection";
import {
  dangerousBaitAttractionCopy,
  dangerousBaitRealtimeEffectCopy,
} from "./dangerousFishingBaitCopy";

export type DangerousFishingShopAction = (
  kind: DangerousGearKind | "bait",
  id: string,
  action: "buy" | "equip",
) => Promise<BuyResult>;

function signedStat(label: string, value: number): string {
  return `${label} ${value >= 0 ? "+" : ""}${value}`;
}

function gearEffectLabels(
  kind: DangerousGearKind,
  item: DangerousRod | DangerousReel | DangerousLine,
): string[] {
  if (kind === "rod") {
    const rod = item as DangerousRod;
    return [signedStat("최대 장력", rod.maxTensionBonus), signedStat("제압력", rod.staminaDamageBonus)];
  }
  if (kind === "reel") {
    const reel = item as DangerousReel;
    return [signedStat("회수력", reel.reelPowerBonus), signedStat("장력 제어", reel.tensionControlBonus)];
  }
  const line = item as DangerousLine;
  return [signedStat("최대 장력", line.maxTensionBonus), `느슨함 허용 +${line.slackTolerance}회`];
}

export function DangerousFishingShopSection({
  model,
  coins,
  buying,
  onShop,
  exchange,
}: {
  model: DangerousFishingViewModel;
  coins: number;
  buying: string | null;
  onShop: DangerousFishingShopAction;
  exchange?: DangerousFishingExchangeSectionProps;
}) {
  const gearSections = [
    {
      kind: "rod" as const,
      label: "낚싯대",
      items: Object.values(model.catalogs.rods),
      owned: new Set<string>(model.state.ownedGear.rods),
      equippedId: model.state.loadout.rodId,
    },
    {
      kind: "reel" as const,
      label: "릴",
      items: Object.values(model.catalogs.reels),
      owned: new Set<string>(model.state.ownedGear.reels),
      equippedId: model.state.loadout.reelId,
    },
    {
      kind: "line" as const,
      label: "낚싯줄",
      items: Object.values(model.catalogs.lines),
      owned: new Set<string>(model.state.ownedGear.lines),
      equippedId: model.state.loadout.lineId,
    },
  ];
  const anyInFlight = buying !== null;

  if (!model.heritage.unlocked) {
    return (
      <section className={`${SURFACE_CARD} p-5 text-center`}>
        <h2 className="font-bold">낚시 레벨 15에 열립니다</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          현재 {model.heritage.fishingLevel}레벨입니다. 위험 해역 해금과 함께 전용 스타터 장비를 받습니다.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className={`${SURFACE_CARD} space-y-2 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">위험 해역 전용 장비</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              위험 해역 조우에만 적용되며 일반 낚시 장비와는 별도로 장착됩니다.
            </p>
          </div>
          <CoinAmount amount={coins} className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300" />
        </div>
      </section>

      {gearSections.map((section) => (
        <section key={section.kind} className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {section.label}
          </h3>
          <div className={`${SURFACE_CARD} divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-700`}>
            {section.items.map((item) => {
              const owned = section.owned.has(item.id);
              const equipped = section.equippedId === item.id;
              const inFlight = buying === `${section.kind}:${item.id}`;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`${SURFACE_INSET} flex h-16 w-16 shrink-0 items-center justify-center p-1`}>
                      <Image src={item.imageSrc} alt="" width={60} height={60} className="h-14 w-14 object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{item.name}</span>
                        {equipped ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">장착 중</span>
                        ) : owned ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">보유</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {gearEffectLabels(section.kind, item).map((label) => (
                          <span
                            key={label}
                            className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant={owned ? "secondary" : "info"}
                    disabled={equipped || anyInFlight || (!owned && coins < item.price)}
                    onClick={() => void onShop(section.kind, item.id, owned ? "equip" : "buy")}
                  >
                    {equipped
                      ? "장착 중"
                      : inFlight
                        ? owned
                          ? "장착 중…"
                          : "구매 중…"
                        : owned
                          ? "장착"
                          : <CoinAmount amount={item.price} />}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-1.5">
        <h3 className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">특수 미끼</h3>
        <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
          아래 효과는 위험 해역 실시간 조우에만 적용되며 일반 낚시는 바뀌지 않습니다.
        </p>
        <div className={`${SURFACE_CARD} divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-700`}>
          {Object.values(model.catalogs.baits).map((bait) => {
            const count = model.state.baitCounts[bait.id] ?? 0;
            const inFlight = buying === `bait:${bait.id}`;
            return (
              <div key={bait.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`${SURFACE_INSET} flex h-16 w-16 shrink-0 items-center justify-center p-1`}>
                    <Image src={bait.imageSrc} alt="" width={60} height={60} className="h-14 w-14 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{bait.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {bait.unlimited ? "무제한 사용" : `보유 ${count}개 · ${bait.packSize}개 묶음`}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{bait.description}</p>
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      어종 유인 · {dangerousBaitAttractionCopy(bait)}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                      실시간 효과 · {dangerousBaitRealtimeEffectCopy(bait)}
                    </p>
                  </div>
                </div>
                {bait.unlimited ? (
                  <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300">기본 지급</span>
                ) : (
                  <Button
                    size="xs"
                    variant="info"
                    disabled={anyInFlight || coins < bait.price}
                    onClick={() => void onShop("bait", bait.id, "buy")}
                  >
                    {inFlight ? "구매 중…" : <CoinAmount amount={bait.price} />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {exchange ? <DangerousFishingExchangeSection {...exchange} /> : null}
    </div>
  );
}
