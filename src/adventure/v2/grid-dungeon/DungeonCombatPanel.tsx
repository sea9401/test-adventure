"use client";

import { useState } from "react";
import {
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import {
  type GridDungeonPublicRun,
} from "@/adventure/data/v2/gridDungeon";
import { SupportRolePill } from "./DungeonSupportPanels";

// 격자 던전 — 전투 요약/로그/파티 지표 패널(V2GridDungeonView 에서 분리, 2026-07).

export const GRID_DUNGEON_COMBAT_PLAYBACK_MS = 1_500;
const COMBAT_LOG_TONE = {
  attack: "border-red-900/70 bg-red-950/35 text-red-200",
  heal: "border-emerald-800/70 bg-emerald-950/35 text-emerald-200",
  hit: "border-sky-900/70 bg-sky-950/35 text-sky-200",
  etc: "border-zinc-800 bg-zinc-950 text-zinc-400",
} as const;

function CombatMeter({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-zinc-900">
        <div
          className={`h-full transition-[width] ease-out ${tone}`}
          style={{
            width: `${pct}%`,
            transitionDuration: `${GRID_DUNGEON_COMBAT_PLAYBACK_MS}ms`,
          }}
        />
      </div>
    </div>
  );
}

type CombatParty = NonNullable<
  NonNullable<GridDungeonPublicRun["lastCombat"]>["party"]
>;
type CombatPartyMember = CombatParty[number];
type PartyMemberMetric = "damageDealt" | "healingDone" | "damageTaken";

function topPartyMember(
  party: CombatParty | undefined,
  metric: PartyMemberMetric,
) {
  if (!party || party.length === 0) return null;
  return [...party].sort((a, b) => b[metric] - a[metric])[0] ?? null;
}

function PartyRoleBadge({ member }: { member: CombatPartyMember }) {
  const formationLabel = member.formation === "front" ? "전열" : "후열";
  if (member.role === "main") {
    return (
      <span className="text-[10px] text-zinc-500">본인 · {formationLabel}</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] text-zinc-500">{formationLabel}</span>
      <SupportRolePill role={member.supportRole} />
    </span>
  );
}

function PartyHighlight({
  label,
  member,
  value,
}: {
  label: string;
  member: CombatPartyMember | null;
  value: number;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-semibold text-zinc-200">
          {member ? member.name : "-"}
        </div>
        <div className="shrink-0 text-[11px] font-medium text-zinc-100">
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function PartyMetricChart({
  party,
  metric,
  label,
  tone,
}: {
  party: CombatParty | undefined;
  metric: PartyMemberMetric;
  label: string;
  tone: string;
}) {
  if (!party || party.length === 0) return null;
  const maxValue = Math.max(1, ...party.map((member) => member[metric]));
  return (
    <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="text-[10px] font-semibold text-zinc-400">{label}</div>
      {party.map((member) => {
        const value = member[metric];
        const pct =
          value > 0 ? Math.max(4, Math.min(100, (value / maxValue) * 100)) : 0;
        return (
          <div
            key={member.id}
            className="grid grid-cols-[76px_1fr_56px] items-center gap-2 text-[11px]"
          >
            <div className="min-w-0 truncate text-zinc-300">{member.name}</div>
            <div className="h-2 overflow-hidden rounded bg-zinc-900">
              <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-right font-medium text-zinc-200">
              {value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type CombatLogKind = keyof typeof COMBAT_LOG_TONE;

function classifyCombatLogLine(line: string, enemyName: string): CombatLogKind {
  if (line.includes("HP +")) return "heal";
  if (line.startsWith(`${enemyName}이(가) `)) return "hit";
  if (line.includes(" 피해")) return "attack";
  return "etc";
}

function combatLogLabel(kind: CombatLogKind): string {
  if (kind === "heal") return "회복";
  if (kind === "hit") return "피격";
  if (kind === "attack") return "공격";
  return "기타";
}

function CombatLogList({
  lines,
  enemyName,
  isPlaying,
  summaryLine,
}: {
  lines: string[];
  enemyName: string;
  isPlaying: boolean;
  summaryLine: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleLines = lines.slice(-8);
  if (visibleLines.length === 0) return null;
  const headline = isPlaying ? "전투 진행 중..." : summaryLine;
  const headlineKind = classifyCombatLogLine(headline, enemyName);
  return (
    <div className="space-y-1.5 border-t border-zinc-800 pt-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-zinc-300">전투 로그</div>
        {visibleLines.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
          >
            {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
            상세
          </button>
        )}
      </div>
      <div className="grid grid-cols-[42px_1fr] items-center gap-2 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-center text-[10px] ${COMBAT_LOG_TONE[headlineKind]}`}
        >
          {isPlaying ? "진행" : combatLogLabel(headlineKind)}
        </span>
        <span className="min-w-0 truncate text-zinc-300">{headline}</span>
      </div>
      {expanded && (
        <div className="space-y-1">
          {visibleLines.map((line, idx) => {
            const kind = classifyCombatLogLine(line, enemyName);
            return (
              <div
                key={`${idx}:${line}`}
                className="grid grid-cols-[42px_1fr] items-center gap-2"
              >
                <span
                  className={`rounded border px-1.5 py-0.5 text-center text-[10px] ${COMBAT_LOG_TONE[kind]}`}
                >
                  {combatLogLabel(kind)}
                </span>
                <span className="min-w-0 truncate text-zinc-400">{line}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function combatSummaryKey(combat: NonNullable<GridDungeonPublicRun["lastCombat"]>) {
  return [
    combat.enemyName,
    combat.turns,
    combat.hpLost,
    combat.playerHpBefore,
    combat.playerHpAfter,
    combat.enemyHp,
    combat.enemyMaxHp,
    combat.log.join("\n"),
  ].join("|");
}

function combatSummaryLine(
  combat: NonNullable<GridDungeonPublicRun["lastCombat"]>,
): string {
  const hpPart =
    combat.hpLost > 0
      ? `내 HP ${combat.hpLost.toLocaleString()} 감소`
      : "피해 없이 돌파";
  const rewardPart =
    combat.rewardGold > 0
      ? ` · ${combat.rewardGold.toLocaleString()}G 확보`
      : "";
  return combat.outcome === "win"
    ? `${combat.enemyName} 전투 승리 · ${hpPart}${rewardPart}`
    : `${combat.enemyName} 전투 패배 · 탐험 불가`;
}

function CombatPlaybackBadge({ isPlaying }: { isPlaying: boolean }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
        isPlaying
          ? "border-yellow-600/60 bg-yellow-950/40 text-yellow-200"
          : "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
      }`}
    >
      {isPlaying ? "전투 중" : "전투 종료"}
    </span>
  );
}

function SkillUseSummary({ uses }: { uses: Record<string, number> }) {
  const entries = Object.entries(uses)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
    .slice(0, 2);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {entries.map(([name, count]) => (
        <span
          key={name}
          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
        >
          {name} x{count}
        </span>
      ))}
    </div>
  );
}

export function DungeonCombatSummary({
  combat,
  isPlaying,
}: {
  combat: NonNullable<GridDungeonPublicRun["lastCombat"]>;
  isPlaying: boolean;
}) {
  const displayedPlayerHp = isPlaying
    ? combat.playerHpBefore
    : combat.playerHpAfter;
  const displayedEnemyHp = isPlaying ? combat.enemyMaxHp : combat.enemyHp;
  const hpPct =
    combat.playerMaxHp > 0
      ? Math.max(0, Math.min(100, (displayedPlayerHp / combat.playerMaxHp) * 100))
      : 0;
  const enemyPct =
    combat.enemyMaxHp > 0
      ? Math.max(0, Math.min(100, (displayedEnemyHp / combat.enemyMaxHp) * 100))
      : 0;
  const topDamage = topPartyMember(combat.party, "damageDealt");
  const topHealing = topPartyMember(combat.party, "healingDone");
  const topTaken = topPartyMember(combat.party, "damageTaken");
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-black/25 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-semibold text-zinc-200">
          {combat.enemyName}
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <CombatPlaybackBadge isPlaying={isPlaying} />
          <span>{combat.turns}턴</span>
          <span>내 HP -{combat.hpLost.toLocaleString()}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CombatMeter
          label="내 HP"
          value={`${displayedPlayerHp.toLocaleString()} / ${combat.playerMaxHp.toLocaleString()}`}
          pct={hpPct}
          tone="bg-emerald-400"
        />
        <CombatMeter
          label="적 HP"
          value={`${displayedEnemyHp.toLocaleString()} / ${combat.enemyMaxHp.toLocaleString()}`}
          pct={enemyPct}
          tone="bg-red-400"
        />
      </div>
      {combat.party && combat.party.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              파티 기여도
            </div>
            <div className="text-[10px] text-zinc-500">피해 · 회복 · 피격</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <PartyHighlight
              label="최고 피해"
              member={topDamage}
              value={topDamage?.damageDealt ?? 0}
            />
            <PartyHighlight
              label="최고 회복"
              member={topHealing}
              value={topHealing?.healingDone ?? 0}
            />
            <PartyHighlight
              label="최다 피격"
              member={topTaken}
              value={topTaken?.damageTaken ?? 0}
            />
          </div>
          <div className="grid gap-2">
            <PartyMetricChart
              party={combat.party}
              metric="damageDealt"
              label="피해량"
              tone="bg-red-400"
            />
            <PartyMetricChart
              party={combat.party}
              metric="healingDone"
              label="회복량"
              tone="bg-emerald-400"
            />
            <PartyMetricChart
              party={combat.party}
              metric="damageTaken"
              label="피격량"
              tone="bg-sky-400"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {combat.party.map((member) => {
              const displayedMemberHp = isPlaying
                ? (member.hpBefore ?? member.maxHp)
                : member.hpAfter;
              const memberPct =
                member.maxHp > 0
                  ? Math.max(0, Math.min(100, (displayedMemberHp / member.maxHp) * 100))
                  : 0;
              return (
                <div
                  key={member.id}
                  className="rounded border border-zinc-800 bg-zinc-950/70 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-semibold text-zinc-200">
                      {member.name}
                    </div>
                    <PartyRoleBadge member={member} />
                  </div>
                  <CombatMeter
                    label="HP"
                    value={`${displayedMemberHp.toLocaleString()} / ${member.maxHp.toLocaleString()}`}
                    pct={memberPct}
                    tone={member.role === "main" ? "bg-emerald-400" : "bg-cyan-400"}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-zinc-500">
                    <div>
                      피해{" "}
                      <span className="text-zinc-300">
                        {member.damageDealt.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      피격{" "}
                      <span className="text-zinc-300">
                        {member.damageTaken.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      회복{" "}
                      <span className="text-zinc-300">
                        {member.healingDone.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <SkillUseSummary uses={member.skillUses} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      <CombatLogList
        lines={combat.log}
        enemyName={combat.enemyName}
        isPlaying={isPlaying}
        summaryLine={combatSummaryLine(combat)}
      />
    </div>
  );
}

