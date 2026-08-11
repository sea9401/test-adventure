import { Button } from "@/components/ui/Button";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  type FishId,
} from "@/adventure/data/v2/fish";
import type { FishSpecimenInventory } from "@/adventure/v2/fishSpecimens";
import { FishIcon } from "@/adventure/v2/FishIcon";

export function FishSpecimenSection({
  specimens,
  registeredIds,
  busyFishId,
  onUse,
}: {
  specimens: FishSpecimenInventory["items"];
  registeredIds: readonly string[];
  busyFishId: FishId | null;
  onUse: (fishId: FishId) => void;
}) {
  const registered = new Set(registeredIds);
  const held = FISH_IDS.flatMap((fishId) => {
    const quantity = specimens[fishId] ?? 0;
    return quantity > 0 ? [{ fishId, quantity }] : [];
  });
  if (held.length === 0) return null;

  return (
    <section>
      <div className="mb-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
        어종 표본 · 거래 가능 · 빈 도감 등록
      </div>
      <ul className="space-y-1.5">
        {held.map(({ fishId, quantity }) => {
          const fish = FISH[fishId];
          const alreadyRegistered = registered.has(fishId);
          const busy = busyFishId === fishId;
          return (
            <li key={fishId} className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FishIcon fishId={fishId} name={fish.name} className="h-8 w-8 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {fish.name} 표본 <span className="font-normal text-zinc-500">×{quantity}</span>
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {FISH_TIERS[fish.tier].label} · 포획 기록은 추가되지 않음
                    </div>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="info"
                  disabled={alreadyRegistered || busy}
                  onClick={() => onUse(fishId)}
                  title={alreadyRegistered ? "이 어종은 이미 도감에 등록되어 있습니다." : undefined}
                >
                  {alreadyRegistered ? "이미 등록됨" : busy ? "등록 중…" : "도감 등록"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
