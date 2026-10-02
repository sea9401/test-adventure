"use client";

import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import type { BuildAlignmentAdvisory } from "@/adventure/data/v2/buildAlignment";

// 내 정보 "기본 정보" 카드 — 옛 「직업 숙달」(숙련도·수행 횟수, 성장의 신전과 중복) 대체.
// 캐릭터 한눈 정보: 스탯 합계(헤드라인) + 소속 길드·전투 횟수·숙달 포인트.
// 표시 전용 — 값은 me/state 에서 주입(실게임)·mock(/dev 하니스).

export function V2CharacterBasics({
  guildName,
  points,
  battleCount,
  power,
  buildAdvisory,
}: {
  guildName?: string | null;
  points: number;
  battleCount: number;
  power: number;
  buildAdvisory?: BuildAlignmentAdvisory | null;
}) {
  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold">기본 정보</h2>

      {/* 스탯 합계 — 공격·방어·생존·속도 가중 합산 참고 수치(헤드라인).
          상단 요소라 툴팁은 아래(placement="bottom")로 띄워 헤더를 안 가린다. */}
      <Tooltip
        className="mt-3"
        placement="bottom"
        content="물리·마법 공격과 방어, 치명타, 생존, 피해 감소, 회복, 속도를 가중 합산한 참고 수치예요. 실제 전투 성능은 스킬과 장비 조합, 상대에 따라 달라져요."
        triggerClassName={`${SURFACE_ACCENT} flex w-full cursor-help flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:border-amber-400 dark:hover:border-amber-800`}
      >
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          스탯 합계
        </span>
        <span className="min-w-0 break-all text-right text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
          {power.toLocaleString()}
        </span>
      </Tooltip>

      {buildAdvisory ? (
        <div className={`${SURFACE_ACCENT} mt-3 p-3`} role="status">
          <div className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            세팅 방향 확인
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            {buildAdvisory.message}
          </p>
        </div>
      ) : null}

      <dl className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-700">
        <InfoRow label="소속 길드" value={guildName?.trim() || "무소속"} />
        <InfoRow label="전투 횟수" value={battleCount.toLocaleString()} />
        <InfoRow
          label="숙달 포인트"
          value={points.toLocaleString()}
          valueClass="text-emerald-700 dark:text-emerald-400"
        />
      </dl>

      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        직업 숙련도와 수행 횟수는 성장의 신전에서 확인할 수 있습니다.
      </p>
    </Card>
  );
}

// 정보 1행 — 왼쪽 라벨, 오른쪽 값(문자/숫자 공용). 상자 없이 행 구분선으로 나눈다.
function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right font-semibold tabular-nums ${valueClass ?? "text-zinc-800 dark:text-zinc-200"}`}
      >
        {value}
      </dd>
    </div>
  );
}
