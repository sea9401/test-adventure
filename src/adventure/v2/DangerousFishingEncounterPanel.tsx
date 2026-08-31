import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  recommendedDangerousFishingAction,
  type DangerousFishingFeedback,
} from "./dangerousFishingFeedback";
import type {
  DangerousEncounterView,
  DangerousFishingAction,
} from "./dangerousFishingEncounter";
import { DangerousFishingFeedbackCard } from "./DangerousFishingFeedbackCard";

const BEHAVIOR_COPY = {
  charge: ["돌진", "줄 풀기로 충격을 흘리세요."],
  thrash: ["몸부림", "버티기로 자세를 잡으세요."],
  turn: ["급선회", "감아올려 거리를 좁히세요."],
  dive: ["잠수", "버티며 체력을 소모시키세요."],
} as const;

export function DangerousFishingEncounterPanel({
  encounter,
  sceneImageSrc,
  targetImageSrc,
  targetName,
  busy,
  feedback = null,
  embedded = false,
  onAction,
}: {
  encounter: DangerousEncounterView;
  sceneImageSrc: string;
  targetImageSrc: string;
  targetName: string;
  busy: boolean;
  feedback?: DangerousFishingFeedback | null;
  embedded?: boolean;
  onAction: (action: DangerousFishingAction) => void;
}) {
  const [behavior, guidance] = BEHAVIOR_COPY[encounter.behavior];
  const recommended = recommendedDangerousFishingAction(encounter.behavior);
  const tensionPct = Math.min(100, (encounter.tension / encounter.maxTension) * 100);
  const staminaPct = Math.min(100, (encounter.stamina / encounter.maxStamina) * 100);
  const distancePct = Math.min(100, (encounter.distance / encounter.startDistance) * 100);
  const situation =
    tensionPct >= 85
      ? "줄이 끊어질 위험 · 줄 풀기나 버티기로 장력을 낮추세요."
      : encounter.tension <= 5
        ? "바늘이 빠질 위험 · 감아올려 장력을 확보하세요."
        : encounter.stamina === 0
          ? "어체력 소진 · 감아올려 인양에 집중하세요."
          : encounter.distance === 0
            ? "인양 거리 확보 · 버티며 어체력을 소모시키세요."
            : "상태 안정 · 현재 행동에 맞춰 제압 중입니다.";
  return (
    <section
      className={`${embedded ? "" : `${SURFACE_CARD} p-4`} space-y-4`}
      aria-label="위험 해역 조우"
    >
      <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
        <Image src={sceneImageSrc} alt="" fill sizes="(min-width: 780px) 720px, 100vw" className="object-cover" loading="eager" />
        <div className="absolute inset-2">
          <Image src={targetImageSrc} alt={targetName} fill sizes="(min-width: 780px) 360px, 70vw" className="object-contain drop-shadow-2xl" />
        </div>
      </div>
      <div className="text-center">
        <h2 className="mb-1 font-bold">{targetName}</h2>
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
          현재 행동 · {behavior}
        </p>
        <p className="mt-1 text-sm font-bold">{guidance}</p>
        {(encounter.telegraph?.length ?? 0) > 0 ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            다음 징후 · {encounter.telegraph?.map((next) => BEHAVIOR_COPY[next][0]).join(" → ")}
          </p>
        ) : null}
        <p className="mt-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          {situation}
        </p>
      </div>
      {feedback ? <DangerousFishingFeedbackCard feedback={feedback} /> : null}
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
          className={`min-h-14 flex-col ${recommended === "reel" ? "ring-2 ring-sky-300 dark:ring-sky-700" : ""}`}
          disabled={busy}
          onClick={() => onAction("reel")}
        >
          감아올리기
          {recommended === "reel" ? (
            <span className="text-[10px] font-bold">추천</span>
          ) : null}
          <span className="text-[10px] opacity-80">A</span>
        </Button>
        <Button
          size="md"
          variant="secondary"
          className={`min-h-14 flex-col ${recommended === "give" ? "ring-2 ring-zinc-300 dark:ring-zinc-700" : ""}`}
          disabled={busy}
          onClick={() => onAction("give")}
        >
          줄 풀기
          {recommended === "give" ? (
            <span className="text-[10px] font-bold">추천</span>
          ) : null}
          <span className="text-[10px] opacity-80">S</span>
        </Button>
        <Button
          size="md"
          variant="warning"
          className={`min-h-14 flex-col ${recommended === "brace" ? "ring-2 ring-amber-300 dark:ring-amber-700" : ""}`}
          disabled={busy}
          onClick={() => onAction("brace")}
        >
          버티기
          {recommended === "brace" ? (
            <span className="text-[10px] font-bold">추천</span>
          ) : null}
          <span className="text-[10px] opacity-80">D</span>
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
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
