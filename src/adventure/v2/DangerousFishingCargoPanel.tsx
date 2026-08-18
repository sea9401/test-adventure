import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { DangerousFishingViewModel } from "./useDangerousFishing";

export function DangerousFishingCargoPanel({
  model,
  busy,
  onReturn,
}: {
  model: DangerousFishingViewModel;
  busy: boolean;
  onReturn: () => void;
}) {
  const voyage = model.state.voyage;
  if (!voyage) return null;
  const cargoValue = voyage.cargo.reduce((sum, item) => sum + item.totalValue, 0);
  return (
    <section className={`${SURFACE_CARD} space-y-3 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">귀환 전 화물</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            한 마리만 잡고도 돌아갈 수 있습니다. 귀환해야 거래 가능한 재료가 됩니다.
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold">가치 {cargoValue.toLocaleString()}</span>
      </div>
      {voyage.cargo.length === 0 ? (
        <div className={`${SURFACE_INSET} p-3 text-center text-sm text-zinc-500`}>
          아직 실은 어획물이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {voyage.cargo.map((item) => (
            <li key={item.fishId} className={`${SURFACE_INSET} flex items-center justify-between gap-3 p-3 text-sm`}>
              <span className="flex min-w-0 items-center gap-3">
                {model.catalogs.fish[item.fishId]?.imageSrc ? (
                  <Image
                    src={model.catalogs.fish[item.fishId].imageSrc}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 object-contain"
                  />
                ) : null}
                <span>{model.catalogs.fish[item.fishId]?.name ?? item.fishId}</span>
              </span>
              <span className="font-semibold">{item.quantity}개 · {item.totalValue.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <Button
        fullWidth
        variant="success"
        disabled={busy || voyage.encounter !== null}
        onClick={onReturn}
      >
        안전 귀환
      </Button>
    </section>
  );
}
import Image from "next/image";
