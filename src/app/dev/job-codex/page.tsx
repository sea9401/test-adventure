"use client";

import { V2JobCodexView } from "@/adventure/v2/V2JobCodexView";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";

// 직업 도감 프리뷰 — 로그인 없이 V2JobCodexView 렌더 확인(읽기 전용). prod 404 = /dev layout 가드.
// mock: 전사 직군 900+(2차 해금)·견습 기사 숙련도 1800(→기사 3차 계보 해금)·마법 진행·일부 패시브.
//   🔑 계보 게이팅: 3차(기사)는 직군 cumLevel 이 아니라 바로 아래 2차(견습 기사) jobCumLevel 로 열린다.
const prof = emptyProficiency();
prof.groups.warrior = { cultivations: 0, tier: 2, cumLevel: 2250 };
prof.groups.mage = { cultivations: 0, tier: 1, cumLevel: 1080 };
prof.groups.rogue = { cultivations: 0, tier: 1, cumLevel: 360 };
prof.jobCumLevel = { squire: 1800 }; // 견습 기사 1800 → 기사(3차) 계보 해금 시연

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
          일부 패시브 수집. 직군별 숙련도(cumLevel) + 직업 해금/패시브 수집 표기 점검.
        </div>
      </div>
      <V2JobCodexView codex={codex} onBack={() => {}} />
    </div>
  );
}
