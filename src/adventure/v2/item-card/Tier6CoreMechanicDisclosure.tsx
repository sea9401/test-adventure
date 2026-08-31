import { SURFACE_INSET } from "@/components/ui/surfaces";

const CORE_MECHANIC_LABELS = [
  "중력 반발",
  "상처 파열",
  "추적 사격",
  "그림자 잔상",
  "맹독 폭발",
  "과부하 낙뢰",
  "성역 소비",
] as const;

export function Tier6CoreMechanicDisclosure() {
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer select-none font-medium text-zinc-600 underline decoration-dotted underline-offset-2 dark:text-zinc-300">
        핵심 기믹이란?
      </summary>
      <div
        className={`${SURFACE_INSET} mt-1.5 p-2.5 text-zinc-600 dark:text-zinc-300`}
      >
        <p>6티어 유니크의 다음 발동 효과를 뜻합니다.</p>
        <ul className="mt-2 grid list-inside list-disc grid-cols-2 gap-x-3 gap-y-1">
          {CORE_MECHANIC_LABELS.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <p className="mt-2">
          한 전투에서 서로 다른 3종이 발동하면 조건을 충족합니다.
        </p>
        <p className="mt-1 font-medium text-amber-600 dark:text-amber-400">
          합일 강화: 공격·회복 +18% (3행동)
        </p>
      </div>
    </details>
  );
}
