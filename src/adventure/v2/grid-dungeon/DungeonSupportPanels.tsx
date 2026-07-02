"use client";

import {
  UsersThree,
} from "@phosphor-icons/react";
import {
  type GridDungeonSupportRole,
} from "@/adventure/data/v2/gridDungeon";
import type { GridDungeonState } from "./gridDungeonViewTypes";

// 격자 던전 — 길드 지원 역할 패널(V2GridDungeonView 에서 분리, 2026-07).
const SUPPORT_ROLE_LABEL: Record<GridDungeonSupportRole, string> = {
  dps: "공격",
  healer: "회복",
  tank: "방어",
};

const SUPPORT_ROLE_TONE: Record<GridDungeonSupportRole, string> = {
  dps: "border-red-800 bg-red-950/45 text-red-200",
  healer: "border-emerald-800 bg-emerald-950/45 text-emerald-200",
  tank: "border-sky-800 bg-sky-950/45 text-sky-200",
};

export type SupportRoleFilter = GridDungeonSupportRole | "all" | "unset";

const SUPPORT_ROLE_FILTERS: SupportRoleFilter[] = [
  "all",
  "dps",
  "healer",
  "tank",
  "unset",
];

export function SupportRolePill({ role }: { role: GridDungeonSupportRole | null }) {
  if (!role) {
    return (
      <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
        역할 미설정
      </span>
    );
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] ${SUPPORT_ROLE_TONE[role]}`}
    >
      {SUPPORT_ROLE_LABEL[role]}
    </span>
  );
}

function SupportDailyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-zinc-200">{value}</div>
    </div>
  );
}

export function MySupportRolePanel({
  role,
  daily,
  busy,
  onSetRole,
}: {
  role: GridDungeonSupportRole | null;
  daily: GridDungeonState["mySupportDaily"] | undefined;
  busy: boolean;
  onSetRole: (role: GridDungeonSupportRole | null) => void;
}) {
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-200">내 지원 카드</div>
        <SupportRolePill role={role} />
      </div>
      <div className="text-[11px] leading-relaxed text-zinc-500">
        다른 길드원이 나를 던전에 데려갈 때 보이는 역할입니다.
      </div>
      {daily && (
        <div className="grid grid-cols-3 gap-2">
          <SupportDailyStat
            label="오늘 지원됨"
            value={`${daily.used} / ${daily.useLimit}`}
          />
          <SupportDailyStat
            label="보상 수령"
            value={`${daily.rewarded} / ${daily.rewardLimit}`}
          />
          <SupportDailyStat
            label="명예 보상"
            value={`+${daily.honorPerReward}`}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {(["dps", "healer", "tank"] as const).map((nextRole) => {
          const selected = role === nextRole;
          return (
            <button
              key={nextRole}
              type="button"
              disabled={busy}
              onClick={() => onSetRole(nextRole)}
              className={`rounded-md border px-2.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                selected
                  ? SUPPORT_ROLE_TONE[nextRole]
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              {SUPPORT_ROLE_LABEL[nextRole]}
            </button>
          );
        })}
      </div>
      {role && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSetRole(null)}
          className="text-left text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-40"
        >
          역할 해제
        </button>
      )}
    </section>
  );
}

export function GuildSupportSelector({
  candidates,
  selectedIds,
  frontlineId,
  filter,
  busy,
  onFilterChange,
  onToggle,
  onFrontlineChange,
}: {
  candidates: NonNullable<GridDungeonState["supportCandidates"]>;
  selectedIds: string[];
  frontlineId: string;
  filter: SupportRoleFilter;
  busy: boolean;
  onFilterChange: (filter: SupportRoleFilter) => void;
  onToggle: (userId: string) => void;
  onFrontlineChange: (id: string) => void;
}) {
  if (candidates.length === 0) return null;
  const counts: Record<SupportRoleFilter, number> = {
    all: candidates.length,
    dps: 0,
    healer: 0,
    tank: 0,
    unset: 0,
  };
  for (const candidate of candidates) {
    if (candidate.supportRole) counts[candidate.supportRole] += 1;
    else counts.unset += 1;
  }
  const displayed = candidates.filter((candidate) => {
    if (filter === "all") return true;
    if (filter === "unset") return candidate.supportRole == null;
    return candidate.supportRole === filter;
  });
  const selected = candidates.filter((candidate) =>
    selectedIds.includes(candidate.userId),
  );
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <UsersThree size={16} weight="fill" />
          길드 동료 지원
        </div>
        <div className="text-[11px] text-zinc-500">{selected.length} / 2</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORT_ROLE_FILTERS.map((roleFilter) => {
          const label =
            roleFilter === "all"
              ? "전체"
              : roleFilter === "unset"
                ? "미설정"
                : SUPPORT_ROLE_LABEL[roleFilter];
          const active = filter === roleFilter;
          return (
            <button
              key={roleFilter}
              type="button"
              onClick={() => onFilterChange(roleFilter)}
              className={`rounded border px-2 py-1 text-[11px] ${
                active
                  ? "border-emerald-700 bg-emerald-950/45 text-emerald-200"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
              }`}
            >
              {label} {counts[roleFilter]}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {displayed.map((candidate) => {
          const selectedCandidate = selectedIds.includes(candidate.userId);
          const unavailable = candidate.supportRemaining <= 0;
          return (
            <div
              key={candidate.userId}
              className={`min-h-24 rounded-md border px-3 py-2 text-xs transition ${
                selectedCandidate
                  ? "border-cyan-600 bg-cyan-950/35 text-cyan-100"
                  : unavailable
                    ? "border-zinc-900 bg-zinc-950/50 text-zinc-600"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {candidate.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    Lv.{candidate.level} · {candidate.job}
                  </span>
                </span>
                <SupportRolePill role={candidate.supportRole} />
              </span>
              <span className="mt-2 block text-[11px] text-zinc-500">
                오늘 지원 가능 {candidate.supportRemaining} /{" "}
                {candidate.supportLimit}
              </span>
              <button
                type="button"
                disabled={busy || unavailable}
                onClick={() => onToggle(candidate.userId)}
                className={`mt-2 rounded border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  selectedCandidate
                    ? "border-cyan-600 bg-cyan-900/45 text-cyan-100"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {selectedCandidate ? "선택 해제" : "지원 선택"}
              </button>
              {selectedCandidate && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      frontlineId === candidate.userId
                        ? "border-yellow-700 bg-yellow-950/45 text-yellow-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {frontlineId === candidate.userId ? "전열" : "후열"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFrontlineChange(candidate.userId)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  >
                    전열 지정
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2 text-[11px] text-zinc-500">
          전열:{" "}
          <button
            type="button"
            onClick={() => onFrontlineChange("main")}
            className={`rounded px-1.5 py-0.5 ${
              frontlineId === "main"
                ? "bg-yellow-950/45 text-yellow-200"
                : "text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            나
          </button>
          {selected.map((candidate) => (
            <button
              key={candidate.userId}
              type="button"
              onClick={() => onFrontlineChange(candidate.userId)}
              className={`ml-1 rounded px-1.5 py-0.5 ${
                frontlineId === candidate.userId
                  ? "bg-yellow-950/45 text-yellow-200"
                  : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

