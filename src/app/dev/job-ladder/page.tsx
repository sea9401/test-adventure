"use client";

import { V2JobLadder, type JobLadderEntry } from "@/adventure/v2/V2JobLadder";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";

// 직업 사다리(전직 화면) 프리뷰 — 로그인 없이 V2JobLadder 렌더 확인. (prod 404 = /dev layout 가드.)
// 코어루프 운영에서 V2CultivationView 가 /api/v2/me/state 의 jobsV2 로 넘기는 모양과 동일한 mock.
// 잠긴 직업은 목록에서 숨김(해금된 것만) + 직업 옆 "해금 조건" 표기 — 핵심 UX 두 가지를 점검.
// ⚠️ 전직 버튼은 실제 /api/v2/me/advance-class 를 호출 → 로그인 없는 여기선 동작 안 함(렌더 확인용).

const noop = async () => {};

// 상위 직업(방패병·견습 기사) 해금 조건 — 부모 직업 숙련도. 기본 직업 = 레벨 한계 달성.
const BASE_JOBS: JobLadderEntry[] = [
  { id: "warrior", name: "견습 병사", tier: 1, condition: `Lv ${V2_LEVEL_CAP} 달성`, bonus: "힘 +5", skillsCollected: true },
  { id: "martial", name: "견습 무인", tier: 1, condition: `Lv ${V2_LEVEL_CAP} 달성`, bonus: "활력 +5" },
  { id: "mage", name: "견습 마법사", tier: 1, condition: `Lv ${V2_LEVEL_CAP} 달성`, bonus: "지능 +5" },
  { id: "rogue", name: "견습 도적", tier: 1, condition: `Lv ${V2_LEVEL_CAP} 달성`, bonus: "민첩 +5" },
];

const WARRIOR_UPPER: JobLadderEntry[] = [
  { id: "shieldman", name: "방패병", tier: 2, condition: "견습 병사 숙련도 600", bonus: "활력 +12 · 힘 +6", skillsCollected: true },
  { id: "squire", name: "견습 기사", tier: 2, condition: "견습 병사 숙련도 600", bonus: "힘 +12 · 민첩 +5" },
];

function Scenario({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
          {title}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        {children}
      </div>
    </section>
  );
}

export default function DevJobLadderPage() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>직업 사다리 프리뷰</strong> — 코어루프 전직 화면(V2JobLadder) 렌더 확인.
        잠긴 직업 숨김 + 해금 조건 표기 점검용. 전직 버튼은 실제 API 호출이라 여기선 작동 안 함.
      </div>

      <Scenario
        title="① 성장 중(만렙 전)"
        note="atLevelCap=false · 해금된 직업 없음 → 빈 목록 안내 + 만렙 전 가이드 문구."
      >
        <V2JobLadder
          level={32}
          currentJobName="모험가"
          currentJobId="none"
          atLevelCap={false}
          jobs={[]}
          onChanged={noop}
        />
      </Scenario>

      <Scenario
        title="② 만렙 도달 · 기본 직업 해금"
        note="atLevelCap=true · 기본 4직업만 해금(상위는 직업 숙련도 부족). 전직 버튼 활성."
      >
        <V2JobLadder
          level={V2_LEVEL_CAP}
          currentJobName="모험가"
          currentJobId="none"
          atLevelCap={true}
          jobs={BASE_JOBS}
          onChanged={noop}
        />
      </Scenario>

      <Scenario
        title="③ 만렙 도달 · 상위 직업 해금(견습 병사 현재)"
        note="현재 직업 배지 + 재전직(기본) + 상위(방패병·견습 기사) 혼합 목록. 각 직업 해금 조건 표기."
      >
        <V2JobLadder
          level={V2_LEVEL_CAP}
          currentJobName="견습 병사"
          currentJobId="warrior"
          atLevelCap={true}
          jobs={[...BASE_JOBS, ...WARRIOR_UPPER]}
          onChanged={noop}
        />
      </Scenario>
    </div>
  );
}
