"use client";

import { V2JobCodexView } from "@/adventure/v2/V2JobCodexView";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";

// 직업 도감 프리뷰 — 로그인 없이 V2JobCodexView 렌더 확인(읽기 전용). prod 404 = /dev layout 가드.
// mock: 전사 직군 정복(250)·마법 직군 진행(120)·도적/무인 미진행 + 일부 패시브 수집. cls=warrior.
const prof = emptyProficiency();
prof.groups.warrior = { points: 0, cultivations: 0, tier: 2, cumLevel: 250 };
prof.groups.mage = { points: 0, cultivations: 0, tier: 1, cumLevel: 120 };
prof.groups.rogue = { points: 0, cultivations: 0, tier: 1, cumLevel: 40 };

const learned = [
  "v2c_warrior_might", // 견습 병사 패시브(근력)
  "v2c_shieldman_vitality", // 방패병 패시브(체력)
  "v2c_mage_acumen", // 견습 마법사 패시브(총명)
];

const codex = buildJobCodex(prof, learned, "warrior", null);

export default function DevJobCodexPage() {
  return (
    <div>
      <div className="mx-auto max-w-[720px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>직업 도감 프리뷰</strong> — 읽기 전용 수집 대시보드. mock: 전사 정복·마법 진행·
          일부 패시브 수집. 직군별 정복(cumLevel) + 직업 해금/패시브 수집 표기 점검.
        </div>
      </div>
      <V2JobCodexView codex={codex} onBack={() => {}} />
    </div>
  );
}
