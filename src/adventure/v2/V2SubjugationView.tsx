"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { IntruderPanel } from "./IntruderPanel";

// 전투 탭 > 토벌 — 내 길드가 보유한 거점들의 침입자 목록 + 토벌.
// 거점 화면에 있던 침입자 패널을 전투 동선으로 이관 (기능 자체는 점령 길드원
// 전용 — intruders/eject 서버 게이트 그대로).

type MyGuildOutpost = {
  outpostId: string;
  fortHp: number;
  fortMaxHp: number;
  underAttack: boolean;
  intruderCount: number;
};

type OverviewResponse = {
  ok?: boolean;
  myGuild?: { guildId: number; outposts: MyGuildOutpost[] } | null;
};

function outpostName(id: string): string {
  return OUTPOST_BY_ID.get(id)?.name ?? id;
}

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
          {/* 침입자 있는 거점 상단 (overview 가 위협 거점 우선 정렬을 이미 해주지만,
              토벌 화면에선 침입자 수가 1순위). */}
          {[...outposts]
            .sort((a, b) => b.intruderCount - a.intruderCount)
            .map((o) => (
              <IntruderPanel
                key={o.outpostId}
                outpostId={o.outpostId}
                title={`${outpostName(o.outpostId)} — 침입자`}
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
