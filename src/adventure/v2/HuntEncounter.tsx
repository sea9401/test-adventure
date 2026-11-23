import { SURFACE_INSET } from "@/components/ui/surfaces";

// 방금 전투 — 사냥 결과 카드 머리에서 승패와 싸운 상대의 이름을 한 줄로 알려 준다.
//   몬스터 그림과 HP는 여기에 넣지 않는다. 그림과 턴별 진행은 전투 기록 화면에서만 본다
//   (2026-11-24 오너 결정: 한때 나와 몬스터를 그림으로 마주 보게 놓았다가 되돌렸다).

export function HuntEncounter({
  label,
  won,
  enemyName,
}: {
  /** "방금 전투"처럼 이 전투가 무엇인지 알려 주는 짧은 말. */
  label: string;
  won: boolean;
  enemyName: string;
}) {
  return (
    <div
      data-hunt-encounter
      className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5"
    >
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <strong
        className={`text-lg font-extrabold ${
          won
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-rose-700 dark:text-rose-400"
        }`}
      >
        {won ? "승리" : "패배"}
      </strong>
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        · {enemyName}
      </span>
    </div>
  );
}

/** 아직 사냥하지 않았을 때 전투 카드 자리에 두는 안내. */
export function HuntEncounterPlaceholder() {
  return (
    <p
      className={`${SURFACE_INSET} px-4 py-3 text-center text-sm text-zinc-500 dark:text-zinc-400`}
    >
      사냥하면 여기에 전투 결과가 나옵니다
    </p>
  );
}
