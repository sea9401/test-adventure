import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousEncounterView,
  DangerousFishingAction,
} from "./dangerousFishingEncounter";

const BEHAVIOR_COPY = {
  charge: ["돌진", "줄 풀기로 충격을 흘리세요."],
  thrash: ["몸부림", "버티기로 자세를 잡으세요."],
  turn: ["급선회", "감아올려 거리를 좁히세요."],
  dive: ["잠수", "버티며 체력을 소모시키세요."],
} as const;

export function DangerousFishingEncounterPanel({
  encounter,
  busy,
  onAction,
}: {
  encounter: DangerousEncounterView;
  busy: boolean;
  onAction: (action: DangerousFishingAction) => void;
}) {
  const [behavior, guidance] = BEHAVIOR_COPY[encounter.behavior];
  const tensionPct = Math.min(100, (encounter.tension / encounter.maxTension) * 100);
  const staminaPct = Math.min(100, (encounter.stamina / encounter.maxStamina) * 100);
  const distancePct = Math.min(100, (encounter.distance / encounter.startDistance) * 100);
  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`} aria-label="위험 해역 조우">
      <div className="text-center">
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
          현재 행동 · {behavior}
        </p>
        <p className="mt-1 text-sm font-bold">{guidance}</p>
        {(encounter.telegraph?.length ?? 0) > 0 ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            다음 징후 · {encounter.telegraph?.map((next) => BEHAVIOR_COPY[next][0]).join(" → ")}
          </p>
        ) : null}
      </div>
      <div className={`${SURFACE_INSET} space-y-3 p-3`}>
        <Meter
          label={`장력 ${encounter.tension} / ${encounter.maxTension}`}
          value={tensionPct}
          color="bg-rose-500"
        />
        <Meter
          label={`어체력 ${encounter.stamina} / ${encounter.maxStamina}`}
          value={staminaPct}
          color="bg-violet-500"
        />
        <Meter
          label={`거리 ${encounter.distance} / ${encounter.startDistance}`}
          value={distancePct}
          color="bg-sky-500"
        />
      </div>
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-lg dark:bg-zinc-900">
        <Button
          size="md"
          variant="info"
          className="min-h-14 flex-col"
          disabled={busy}
          onClick={() => onAction("reel")}
        >
          감아올리기 <span className="text-[10px] opacity-80">A</span>
        </Button>
        <Button
          size="md"
          variant="secondary"
          className="min-h-14 flex-col"
          disabled={busy}
          onClick={() => onAction("give")}
        >
          줄 풀기 <span className="text-[10px] opacity-80">S</span>
        </Button>
        <Button
          size="md"
          variant="warning"
          className="min-h-14 flex-col"
          disabled={busy}
          onClick={() => onAction("brace")}
        >
          버티기 <span className="text-[10px] opacity-80">D</span>
        </Button>
      </div>
    </section>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
