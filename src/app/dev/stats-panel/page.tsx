"use client";

import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  V2_STAT_DESCRIPTIONS,
} from "@/adventure/data/v2/v2StatKeys";

// 내 정보 「상세 + 능력치」 패널 QA — 셀 호버(데스크톱)/탭(모바일) 툴팁 + "상세" 라벨 확인.
// 로그인/DB 불필요. mock combat/stats 주입.

const PHYS = {
  base: { str: 120, dex: 40, vit: 80, int: 0, spi: 10, luk: 30 },
  caps: { str: 169, dex: 90, vit: 130, int: 30, spi: 50, luk: 80 },
  combat: {
    atk: 92,
    def: 48,
    magicAtk: 0,
    magicDef: 6,
    spd: 80,
    evasionPct: 12,
    accuracyPct: 95,
    critChancePct: 18,
    critMult: 2.18,
    extraAttackChancePct: 22,
  },
};

const MAGIC = {
  base: { str: 10, dex: 50, vit: 60, int: 130, spi: 70, luk: 20 },
  caps: { str: 30, dex: 100, vit: 110, int: 175, spi: 120, luk: 60 },
  combat: {
    atk: 14,
    def: 30,
    magicAtk: 88,
    magicDef: 41,
    spd: 100,
    evasionPct: 9,
    accuracyPct: 92,
    critChancePct: 8,
    critMult: 2.05,
    extraAttackChancePct: 28,
  },
};

export default function StatsPanelPreview() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 내 정보 「상세 + 능력치」 — 각 셀에 마우스 오버(모바일은
        탭) 시 설명 툴팁. 「상세」는 옛 「전투력」 섹션을 개명.
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          물리 빌드 (마법 공격력 숨김)
        </div>
        <Card padding="md">
          <StatsPanel
            stats={PHYS.base}
            caps={PHYS.caps}
            combat={PHYS.combat}
            statKeys={V2_STAT_KEYS}
            statLabels={V2_STAT_LABELS}
            statDescriptions={V2_STAT_DESCRIPTIONS}
          />
        </Card>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          마법 빌드 (마법 공격력 노출)
        </div>
        <Card padding="md">
          <StatsPanel
            stats={MAGIC.base}
            caps={MAGIC.caps}
            combat={MAGIC.combat}
            statKeys={V2_STAT_KEYS}
            statLabels={V2_STAT_LABELS}
            statDescriptions={V2_STAT_DESCRIPTIONS}
          />
        </Card>
      </div>
    </div>
  );
}
