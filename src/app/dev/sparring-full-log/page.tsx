"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { SparringFullLogDialog } from "@/adventure/v2/SparringFullLogDialog";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";

const SAMPLE_LOG: BattleLogEntry[] = [
  { kind: "info", text: "훈련용 허수아비가 나타났다!" },
  { kind: "turn_marker", text: "1행동", turn: "player", t: 10 },
  {
    kind: "player_attack",
    text: "유성 폭발! [마법] 12480 피해를 입혔다.",
    turn: "player",
    t: 10,
  },
  { kind: "info", text: "MP -45 (75/120)", turn: "player", t: 10 },
  {
    kind: "hp_bar",
    text: "",
    playerHp: 4200,
    playerMaxHp: 4200,
    playerMp: 75,
    playerMaxMp: 120,
    enemyHp: 987520,
    enemyMaxHp: 1000000,
    t: 10,
  },
  { kind: "turn_marker", text: "2행동", turn: "player", t: 24 },
  {
    kind: "player_attack",
    text: "연쇄 번개! [마법] 8930 피해를 입혔다.",
    turn: "player",
    t: 24,
  },
  { kind: "info", text: "MP -35 (40/120)", turn: "player", t: 24 },
  {
    kind: "hp_bar",
    text: "",
    playerHp: 4200,
    playerMaxHp: 4200,
    playerMp: 40,
    playerMaxMp: 120,
    enemyHp: 978590,
    enemyMaxHp: 1000000,
    t: 24,
  },
  { kind: "turn_marker", text: "3행동", turn: "player", t: 38 },
  {
    kind: "player_attack",
    text: "화염구! [마법] [치명타] 15620 피해를 입혔다.",
    turn: "player",
    t: 38,
  },
  { kind: "info", text: "MP -30 (10/120)", turn: "player", t: 38 },
  {
    kind: "hp_bar",
    text: "",
    playerHp: 4200,
    playerMaxHp: 4200,
    playerMp: 10,
    playerMaxMp: 120,
    enemyHp: 962970,
    enemyMaxHp: 1000000,
    t: 38,
  },
  { kind: "turn_marker", text: "4행동", turn: "player", t: 52 },
  {
    kind: "info",
    text: "MP가 부족해 기본 공격을 사용했다.",
    turn: "player",
    t: 52,
  },
  {
    kind: "player_attack",
    text: "공격! 2140 피해를 입혔다.",
    turn: "player",
    t: 52,
  },
  {
    kind: "hp_bar",
    text: "",
    playerHp: 4200,
    playerMaxHp: 4200,
    playerMp: 10,
    playerMaxMp: 120,
    enemyHp: 960830,
    enemyMaxHp: 1000000,
    t: 52,
  },
  { kind: "turn_marker", text: "50행동", turn: "player", t: 700 },
  {
    kind: "player_attack",
    text: "공격! 2070 피해를 입혔다.",
    turn: "player",
    t: 700,
  },
  { kind: "info", text: "50행동의 모의전이 종료됐다.", turn: "player", t: 700 },
];

export default function SparringFullLogPreviewPage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-4 text-zinc-900 dark:text-zinc-100">
      <div className={`${SURFACE_ACCENT} p-3 text-sm text-amber-950 dark:text-amber-100`}>
        <strong>DEV</strong> · 로그인과 DB 없이 허수아비 전체 로그 화면을 확인합니다.
      </div>

      <Card padding="md" className="space-y-4">
        <div>
          <p className="text-sm font-semibold">허수아비 대련 결과</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            50행동 동안 허수아비에게 39,170 데미지를 입혔다.
          </p>
        </div>

        <div className={`${SURFACE_INSET} p-3`}>
          <p className="text-sm font-medium">전투 시작부터 종료까지 기록했어요.</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            초반 MP 스킬의 피해량도 전체 로그에서 다시 확인할 수 있습니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="w-full rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:ring-offset-zinc-900"
        >
          전체 로그 보기
        </button>
      </Card>

      {open && (
        <SparringFullLogDialog
          entries={SAMPLE_LOG}
          enemyName="훈련용 허수아비"
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  );
}
