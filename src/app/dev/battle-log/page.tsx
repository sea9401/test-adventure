"use client";

import { useState } from "react";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";
import { stanceBattleLogText, STANCE_IDS, type StanceId } from "@/adventure/character/stance";

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
    playerHp: 540, playerMaxHp: 600, enemyHp: 380, enemyMaxHp: 600, ap: 0, apMax: 0,
  });
  entries.push({ kind: "turn_marker", text: "2턴 · AP 0", turn: "player" });
  entries.push({ kind: "player_attack", text: "공격! 240 피해를 입혔다.", turn: "player" });
  entries.push({ kind: "info", text: "사나운 늑대를 쓰러뜨렸다!", turn: "player" });
  return entries;
}

export default function BattleLogPreview() {
  const [stance, setStance] = useState<StanceId | null>("onslaught");
  const [compact, setCompact] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 전투 로그 — 전술 안내 줄(#502). 전술을 고르면 로그 첫머리에 한 줄 추가.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[null, ...STANCE_IDS].map((s) => (
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
          className="ml-auto rounded-md bg-zinc-100 px-3 py-1.5 text-sm dark:bg-zinc-800"
        >
          {compact ? "일반" : "compact"}
        </button>
      </div>
      <BattleLogList entries={sampleEntries(stance)} compact={compact} />
    </div>
  );
}
