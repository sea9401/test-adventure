import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { DangerousGearKind } from "@/adventure/data/v2/dangerousFishing";
import type { DangerousFishingViewModel } from "./useDangerousFishing";

export function DangerousFishingLoadoutPanel({
  model,
  busy,
  onShop,
}: {
  model: DangerousFishingViewModel;
  busy: boolean;
  onShop: (kind: DangerousGearKind | "bait", id: string, action: "buy" | "equip") => void;
}) {
  const sections = [
    ["rod", "낚싯대", model.catalogs.rods, model.state.ownedGear.rods, model.state.loadout.rodId],
    ["reel", "릴", model.catalogs.reels, model.state.ownedGear.reels, model.state.loadout.reelId],
    ["line", "낚싯줄", model.catalogs.lines, model.state.ownedGear.lines, model.state.loadout.lineId],
  ] as const;
  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">위험 해역 전용 장비</h2>
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          낚시 코인 {model.fishingCoins.toLocaleString()}
        </span>
      </div>
      {sections.map(([kind, label, catalog, ownedIds, equippedId]) => (
        <div key={kind}>
          <p className="mb-2 text-xs font-semibold text-zinc-500">{label}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.values(catalog).map((item) => {
              const owned = ownedIds.includes(item.id as never);
              const equipped = equippedId === item.id;
              return (
                <div key={item.id} className={`${SURFACE_INSET} space-y-2 p-3`}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.description}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold">
                      {item.price === 0 ? "보유" : `${item.price.toLocaleString()} 코인`}
                    </span>
                  </div>
                  {equipped ? (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">장착 중</span>
                  ) : owned ? (
                    <Button size="xs" disabled={busy} onClick={() => onShop(kind, item.id, "equip")}>장착</Button>
                  ) : (
                    <Button size="xs" variant="warning" disabled={busy || model.fishingCoins < item.price} onClick={() => onShop(kind, item.id, "buy")}>구매</Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-500">특수 미끼 보충</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(model.catalogs.baits).map((bait) => (
            <div key={bait.id} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-3`}>
              <div>
                <p className="text-sm font-semibold">{bait.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {bait.unlimited ? "무제한" : `보유 ${model.state.baitCounts[bait.id] ?? 0}개 · ${bait.packSize}개 묶음`}
                </p>
              </div>
              {bait.unlimited ? (
                <span className="text-xs font-semibold">무료</span>
              ) : (
                <Button size="xs" variant="warning" disabled={busy || model.fishingCoins < bait.price} onClick={() => onShop("bait", bait.id, "buy")}>
                  {bait.price.toLocaleString()} 코인
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
