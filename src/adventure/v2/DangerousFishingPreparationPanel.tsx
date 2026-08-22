"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousBaitId,
  DangerousDepthId,
  DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type { DangerousFishingViewModel } from "./useDangerousFishing";
import {
  dangerousBaitAttractionCopy,
  dangerousBaitRealtimeEffectCopy,
} from "./dangerousFishingBaitCopy";

export function DangerousFishingPreparationPanel({
  model,
  zoneId,
  depthId,
  baitId,
  busy,
  onZoneChange,
  onDepthChange,
  onBaitChange,
  onStartVoyage,
  onStartEncounter,
  onOpenShop,
}: {
  model: DangerousFishingViewModel;
  zoneId: DangerousZoneId;
  depthId: DangerousDepthId;
  baitId: DangerousBaitId;
  busy: boolean;
  onZoneChange: (zoneId: DangerousZoneId) => void;
  onDepthChange: (depthId: DangerousDepthId) => void;
  onBaitChange: (baitId: DangerousBaitId) => void;
  onStartVoyage: () => void;
  onStartEncounter: () => void;
  onOpenShop?: () => void;
}) {
  if (model.state.voyage) {
    return (
      <section className={`${SURFACE_CARD} space-y-3 p-4`}>
        <div>
          <h2 className="font-bold">다음 어획</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            선택한 수심의 어종이 가장 자주 나오지만, 다른 수심을 선호하는 어종도 낮은 확률로 출현합니다.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(model.catalogs.baits).map((bait) => {
            const count = model.state.baitCounts[bait.id] ?? 0;
            const unavailable = !bait.unlimited && count <= 0;
            const selected = baitId === bait.id;
            return (
              <button
                key={bait.id}
                type="button"
                disabled={unavailable}
                aria-pressed={selected}
                onClick={() => onBaitChange(bait.id)}
                className={`${SURFACE_INSET} flex min-h-28 items-center gap-3 p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  selected
                    ? "border-cyan-500 ring-2 ring-cyan-500/30 dark:border-cyan-400"
                    : "hover:border-cyan-300 dark:hover:border-cyan-700"
                }`}
              >
                <Image src={bait.imageSrc} alt="" width={58} height={58} className="h-14 w-14 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{bait.name}</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                    {bait.unlimited ? "무제한" : unavailable ? "보유 없음" : `보유 ${count}개`}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {dangerousBaitAttractionCopy(bait)}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    {dangerousBaitRealtimeEffectCopy(bait)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Button fullWidth variant="info" disabled={busy} onClick={onStartEncounter}>
            낚싯줄 던지기
          </Button>
          {onOpenShop ? (
            <Button variant="secondary" disabled={busy} onClick={onOpenShop}>
              미끼 보충
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const selectedZone = model.catalogs.zones[zoneId];
  const selectedDepth = model.catalogs.depths[depthId];
  const loadout = model.state.loadout;
  const gear = [
    model.catalogs.rods[loadout.rodId],
    model.catalogs.reels[loadout.reelId],
    model.catalogs.lines[loadout.lineId],
  ];
  const expectedRisk = selectedZone.baseRisk + selectedDepth.riskBonus;

  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`}>
      <div>
        <h2 className="font-bold">출항 준비</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          해역과 수심이 깊을수록 사고 위험과 희귀 어종 기회가 커집니다.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">해역</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.values(model.catalogs.zones).map((zone) => {
            const locked = model.heritage.fishingLevel < zone.unlockLevel;
            const selected = zoneId === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                disabled={locked}
                aria-disabled={locked}
                aria-pressed={selected}
                onClick={() => onZoneChange(zone.id)}
                className={`${SURFACE_INSET} overflow-hidden text-left transition-colors disabled:cursor-not-allowed ${
                  selected
                    ? "border-cyan-500 ring-2 ring-cyan-500/30 dark:border-cyan-400"
                    : "hover:border-cyan-300 dark:hover:border-cyan-700"
                }`}
              >
                <span className="relative block aspect-[16/9] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                  <Image src={zone.imageSrc} alt="" fill sizes="(min-width: 640px) 220px, 100vw" className="object-cover" />
                </span>
                <span className="block space-y-1 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{zone.name}</span>
                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                      {locked ? `낚시 Lv ${zone.unlockLevel} 필요` : `위험 +${zone.baseRisk}`}
                    </span>
                  </span>
                  <span className="block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                    {zone.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">수심</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(model.catalogs.depths).map((depth) => (
            <button
              key={depth.id}
              type="button"
              aria-pressed={depthId === depth.id}
              onClick={() => onDepthChange(depth.id)}
              className={`${SURFACE_INSET} min-h-12 px-2 py-2 text-center text-sm font-semibold transition-colors ${
                depthId === depth.id
                  ? "border-cyan-500 text-cyan-700 ring-2 ring-cyan-500/30 dark:border-cyan-400 dark:text-cyan-300"
                  : "hover:border-cyan-300 dark:hover:border-cyan-700"
              }`}
            >
              <span className="block">{depth.name}</span>
              <span className="block text-[10px] font-normal text-zinc-500 dark:text-zinc-400">위험 +{depth.riskBonus}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${SURFACE_INSET} space-y-3 p-3`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">현재 장비</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">예상 위험도 {expectedRisk}</p>
          </div>
          {onOpenShop ? (
            <Button size="xs" variant="secondary" disabled={busy} onClick={onOpenShop}>
              위험 해역 장비 상점
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {gear.map((item) => (
            <div key={item.id} className={`${SURFACE_CARD} flex items-center gap-2 p-2`}>
              <Image src={item.imageSrc} alt="" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
              <span className="text-xs font-semibold">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      <Button
        fullWidth
        variant="danger"
        disabled={busy || model.activeAutoActivity !== null}
        onClick={onStartVoyage}
      >
        {model.activeAutoActivity ? "자동 채집 정산 필요" : "출항하기"}
      </Button>
    </section>
  );
}
