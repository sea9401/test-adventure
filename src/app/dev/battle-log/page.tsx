"use client";

import { useState } from "react";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";
import { stanceBattleLogText, STANCE_IDS, type StanceId } from "@/adventure/character/stance";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";

// 표시 검증용 합성 로그. 스킬의 실제 효과나 밸런스 데이터를 정의하지 않는다.
const PRESENTATION_LOG: BattleLogEntry[] = [
  { kind: "player_attack", text: "낙성! 10471 피해를 입혔다.", turn: "player", t: 10 },
  { kind: "info", text: "[강화] 내 공격력 +20% (3행동)", turn: "player", t: 10 },
  { kind: "info", text: "[약화] 상대 방어력 -15% (2행동)", turn: "player", t: 10 },
  { kind: "info", text: "[교차·포획] 행동 가속 15%", turn: "player", t: 10 },
  { kind: "enemy_attack", text: "그림자 베기! 4280 피해를 입혔다.", turn: "enemy", t: 20 },
  { kind: "info", effect: "status", text: "[출혈] Soo 출혈 (2행동)", turn: "enemy", t: 20 },
  { kind: "info", text: "[강화] 상대 공격력 +15% (2행동)", turn: "enemy", t: 20 },
  { kind: "info", text: "", skillCast: { skillId: "v2c_skyascendant_voidbreak", skillName: "파공" }, turn: "player", t: 30 },
  { kind: "player_attack", effect: "extra_damage", text: "[교차·추격] 6499 추가 피해.", turn: "player", t: 30 },
  { kind: "player_attack", text: "파공! [치명타] 3472 피해를 입혔다.", turn: "player", t: 30 },
  { kind: "info", text: "[교차·추격] 행동 가속 15%", turn: "player", t: 30 },
  ...[3472, 3472, 5831].map((damage): BattleLogEntry => ({ kind: "player_attack", text: `파공! [치명타] ${damage} 피해를 입혔다.`, turn: "player", t: 30 })),
  { kind: "info", text: "[강화] 내 공격력 +20% (2행동)", turn: "player", t: 30 },
  { kind: "info", text: "[약화] 상대 방어력 -15% (1행동)", turn: "player", t: 30 },
  { kind: "enemy_attack", text: "공격! Soo가 공격을 피했습니다.", turn: "enemy", t: 40 },
  { kind: "player_attack", text: "공격! [치명타] 12773 피해를 입혔다.", turn: "player", t: 50 },
  { kind: "info", text: "", skillCast: { skillId: "preview_regen", skillName: "재생" }, turn: "enemy", t: 60 },
  { kind: "info", text: "[재생] 그림자 기사 HP +3200", turn: "enemy", t: 60 },
  { kind: "info", text: "[재생] 상대 행동마다 HP +5% (2행동)", turn: "enemy", t: 60 },
];

// #502 전투 시작 로그의 전술 안내 한 줄을 로그인 없이 확인.
// 전술을 고르면 openingNote(stanceBattleLogText) 가 로그 첫머리에 info 로 들어간다.
function sampleEntries(stance: StanceId | null): BattleLogEntry[] {
  const note = stanceBattleLogText(stance);
  const entries: BattleLogEntry[] = [];
  entries.push({ kind: "info", text: "사나운 늑대가 나타났다!", turn: "player" });
  if (note) entries.push({ kind: "info", text: note, turn: "player" });
  entries.push({ kind: "turn_marker", text: "1턴 · AP 0", turn: "player" });
  entries.push({ kind: "player_attack", text: "공격! 220 피해를 입혔다.", turn: "player" });
  entries.push({ kind: "enemy_attack", text: "공격! 60 피해를 입혔다.", turn: "enemy" });
  entries.push({
    kind: "hp_bar", text: "", turn: "enemy",
    playerHp: 540, playerMaxHp: 600, enemyHp: 380, enemyMaxHp: 600,
  });
  entries.push({ kind: "turn_marker", text: "2턴 · AP 0", turn: "player" });
  entries.push({ kind: "player_attack", text: "공격! 240 피해를 입혔다.", turn: "player" });
  entries.push({ kind: "info", text: "사나운 늑대를 쓰러뜨렸다!", turn: "player" });
  return entries;
}

export default function BattleLogPreview() {
  const [stance, setStance] = useState<StanceId | null>("onslaught");
  const [compact, setCompact] = useState(false);
  const [presentation, setPresentation] = useState(true);
  return (
    <div className={`${SURFACE_CARD} mx-auto max-w-3xl space-y-4 p-2 sm:p-4`}>
      <div className={`${SURFACE_ACCENT} p-3 text-sm text-amber-900 dark:text-amber-200`}>
        <strong>DEV</strong> · 전투 로그 — 피해·효과·행동 수는 화면 구성용 예시입니다.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPresentation((value) => !value)} className="min-h-11 rounded-md bg-zinc-100 px-3 text-sm dark:bg-zinc-800">
          {presentation ? "전술 확인" : "전체 흐름"}
        </button>
        {!presentation && [null, ...STANCE_IDS].map((s) => (
          <button
            key={s ?? "none"}
            type="button"
            onClick={() => setStance(s)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              stance === s ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {s ?? "없음"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCompact((c) => !c)}
          className="ml-auto min-h-11 rounded-md bg-zinc-100 px-3 py-1.5 text-sm dark:bg-zinc-800"
        >
          {compact ? "일반" : "compact"}
        </button>
      </div>
      <h1 className="text-xl font-bold">전투 기록</h1>
      <BattleLogList
        entries={presentation ? PRESENTATION_LOG : sampleEntries(stance)}
        compact={compact}
        playerName={presentation ? "Soo" : "모험가"}
        enemyName={presentation ? "그림자 기사" : "사나운 늑대"}
      />
    </div>
  );
}
