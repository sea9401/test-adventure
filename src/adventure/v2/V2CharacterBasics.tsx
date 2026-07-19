"use client";

import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

// 내 정보 "기본 정보" 카드 — 옛 「직업 숙달」(숙련도·수행 횟수, 성장의 신전과 중복) 대체.
// 캐릭터 한눈 정보: 전투력(헤드라인) + 소속 길드·전투 횟수·숙달 포인트.
// 표시 전용 — 값은 me/state 에서 주입(실게임)·mock(/dev 하니스).

export function V2CharacterBasics({
  guildName,
  points,
  battleCount,
  power,
}: {
  guildName?: string | null;
  points: number;
  battleCount: number;
  power: number;
}) {
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

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
