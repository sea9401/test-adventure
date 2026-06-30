"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { outpostDisplayName } from "@/adventure/data/v2/tileWarfare";
import { IntruderPanel } from "./IntruderPanel";

// 전투 탭 > 토벌 — 내 길드가 보유한 거점들의 침입자 목록 + 토벌.
// 거점 화면에 있던 침입자 패널을 전투 동선으로 이관 (기능 자체는 점령 길드원
// 전용 — intruders/eject 서버 게이트 그대로).

type MyGuildOutpost = {
  outpostId: string;
  // 창립자가 지은 설정 이름(tile_settlements.name 등). 없으면 좌표 폴백명 사용.
  villageName?: string | null;
  fortHp: number;
  fortMaxHp: number;
  underAttack: boolean;
  intruderCount: number;
};

type OverviewResponse = {
  ok?: boolean;
  myGuild?: { guildId: number; outposts: MyGuildOutpost[] } | null;
};

export function V2SubjugationView({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [myGuild, setMyGuild] = useState<OverviewResponse["myGuild"]>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/war/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: OverviewResponse | null) => {
        if (!alive) return;
        setMyGuild(j?.ok ? (j.myGuild ?? null) : null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const outposts = myGuild?.outposts ?? [];
  const totalIntruders = outposts.reduce((sum, o) => sum + o.intruderCount, 0);
  const threatenedOutposts = outposts.filter((o) => o.intruderCount > 0).length;
  const underAttack = outposts.filter((o) => o.underAttack).length;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="토벌" onBack={onBack} />

      {loading ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : !myGuild ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          길드에 소속되어 있지 않습니다 — 토벌은 거점을 보유한 길드원만 사용할
          수 있습니다.
        </div>
      ) : outposts.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          보유 거점이 없습니다 — 거점을 점령하면 침입자를 토벌할 수 있습니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <SubjugationStat label="침입자" value={totalIntruders} tone="rose" />
            <SubjugationStat label="위험 거점" value={threatenedOutposts} tone="amber" />
            <SubjugationStat label="공성 중" value={underAttack} tone="sky" />
          </div>
          {/* 침입자 있는 거점 상단 (overview 가 위협 거점 우선 정렬을 이미 해주지만,
              토벌 화면에선 침입자 수가 1순위). */}
          {[...outposts]
            .sort((a, b) => b.intruderCount - a.intruderCount)
            .map((o) => (
              <IntruderPanel
                key={o.outpostId}
                outpostId={o.outpostId}
                title={`${o.villageName ?? outpostDisplayName(o.outpostId)} — 침입자`}
                collapsible
                // 침입자 있는 거점만 기본 펼침 — 나머지는 접어서 한눈에.
                defaultOpen={o.intruderCount > 0}
                countHint={o.intruderCount}
              />
            ))}
        </div>
      )}
    </main>
  );
}

function SubjugationStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "sky";
}) {
  const cls = {
    rose: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    amber:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    sky: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200",
  }[tone];
  return (
    <div
      className={`war-stat-card rounded-md border px-3 py-2 ${value > 0 ? "is-hot" : ""} ${cls} ${
        value > 0 ? "war-status-hot" : ""
      }`}
    >
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
