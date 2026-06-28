"use client";

import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { V2_ELEMENT_LABEL, type V2Element } from "@/adventure/data/v2/elements";

// 내 정보 "기본 정보" 카드 — 옛 「직업 숙달」(숙련도·수행 횟수, 성장의 신전과 중복) 대체.
// 캐릭터 한눈 정보: 전투력(헤드라인) + 속성·소속 길드·전투 횟수·숙달 포인트.
// 표시 전용 — 값은 me/state 에서 주입(실게임)·mock(/dev 하니스).

// 속성별 색 — 라벨에 살짝 결을 준다(전투 상성·세계관 색감).
const ELEMENT_COLOR: Record<V2Element, string> = {
  neutral: "text-zinc-600 dark:text-zinc-300",
  water: "text-sky-600 dark:text-sky-400",
  fire: "text-rose-600 dark:text-rose-400",
  wind: "text-emerald-600 dark:text-emerald-400",
  starlight: "text-amber-600 dark:text-amber-400",
  void: "text-violet-600 dark:text-violet-400",
  earth: "text-yellow-700 dark:text-yellow-500",
  lightning: "text-indigo-600 dark:text-indigo-400",
};

function isV2Element(v: string | undefined): v is V2Element {
  return v != null && v in V2_ELEMENT_LABEL;
}

export function V2CharacterBasics({
  element,
  guildName,
  points,
  battleCount,
  power,
}: {
  element?: string;
  guildName?: string | null;
  points: number;
  battleCount: number;
  power: number;
}) {
  const el = isV2Element(element) ? element : null;
  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold">기본 정보</h2>

      {/* 전투력 — 공격·방어·생존·속도 합산 콘텐츠 강도 지표(헤드라인).
          상단 요소라 툴팁은 아래(placement="bottom")로 띄워 헤더를 안 가린다. */}
      <Tooltip
        className="mt-3"
        placement="bottom"
        content="공격·방어·생존·속도를 모두 합산한 콘텐츠 강도 지표예요. 장비·능력치·숙련을 올리면 함께 오릅니다."
        triggerClassName="flex w-full cursor-help flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:border-amber-300 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:border-amber-800"
      >
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          전투력
        </span>
        <span className="min-w-0 break-all text-right text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
          {power.toLocaleString()}
        </span>
      </Tooltip>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <InfoTile
          label="속성"
          value={el ? V2_ELEMENT_LABEL[el] : "—"}
          valueClass={el ? ELEMENT_COLOR[el] : undefined}
        />
        <InfoTile label="소속 길드" value={guildName?.trim() || "무소속"} />
        <InfoTile label="전투 횟수" value={battleCount.toLocaleString()} />
        <InfoTile
          label="숙달 포인트"
          value={points.toLocaleString()}
          valueClass="text-emerald-700 dark:text-emerald-400"
        />
      </div>

      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        직업 숙련도와 수행 횟수는 성장의 신전에서 확인할 수 있습니다.
      </p>
    </Card>
  );
}

// 정보 1칸 — 라벨 + 값(문자/숫자 공용).
function InfoTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div
        className={`mt-0.5 break-all font-semibold leading-tight tabular-nums ${valueClass ?? "text-zinc-700 dark:text-zinc-300"}`}
      >
        {value}
      </div>
    </div>
  );
}
