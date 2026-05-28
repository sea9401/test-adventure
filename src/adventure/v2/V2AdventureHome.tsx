"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Sword, DoorOpen } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { OUTPOSTS, OUTPOST_NPC_TAX_RATE } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";

// 모험 탭 — 캐릭 카드 + 현 위치 거점 카드 (세부 정보 + 액션) + 아레나 진입.

type OccupationInfo = {
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
};

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { name: string };
  currentOutpost?: {
    id: string;
    name: string;
    occupation: OccupationInfo | null;
  } | null;
};

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};
const POLICY_LABEL: Record<string, string> = {
  open: "개방",
  guild_only: "길드 전용",
};

function formatTaxRate(taxRate: string): string {
  // DB 가 NUMERIC 문자열 ("0.10" 등). 정수 % 로 환산.
  const n = Number(taxRate);
  if (!Number.isFinite(n)) return taxRate;
  return `${Math.round(n * 100)}%`;
}

function formatNextAttack(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  if (diff <= 0) return "공격 가능";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 후`;
  const h = Math.floor(m / 60);
  return `${h}시간 후`;
}

export function V2AdventureHome({
  currentOutpost,
  onOpenArena,
  onEnterOutpost,
}: {
  currentOutpost: { id: string; name: string } | null;
  onOpenArena: () => void;
  onEnterOutpost: (outpost: Outpost) => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        const j = (await res.json().catch(() => null)) as StateResponse | null;
        if (!cancelled) setState(j ?? { ok: false });
      } catch {
        if (!cancelled) setState({ ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const outpost = useMemo(
    () =>
      currentOutpost
        ? OUTPOSTS.find((o) => o.id === currentOutpost.id) ?? null
        : null,
    [currentOutpost],
  );

  const occupation = state?.currentOutpost?.occupation ?? null;

  return (
    <main className="text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        {state?.character && (
          <V2CharacterCard
            character={state.character}
            guild={state.guild}
            showGold={false}
          />
        )}

        {outpost && (
          <section className="rounded-md border border-zinc-200 bg-white/90 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="flex items-baseline gap-2">
              <MapPin
                size={16}
                weight="fill"
                className="shrink-0 text-emerald-500"
              />
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {outpost.name}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {TYPE_LABEL[outpost.type]} · {TIER_LABEL[outpost.tier]}
              </span>
              {outpost.neutral && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  중립
                </span>
              )}
            </div>
            {outpost.description && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {outpost.description}
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-zinc-500 dark:text-zinc-400">보유</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? occupation.occupiedByGuildName
                    ? `${occupation.occupiedByGuildName} 길드`
                    : occupation.occupiedByUserId
                      ? "솔로 점령자"
                      : "—"
                  : "NPC 운영"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">세율</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? formatTaxRate(occupation.taxRate)
                  : `${Math.round(OUTPOST_NPC_TAX_RATE * 100)}% (NPC)`}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">정책</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? POLICY_LABEL[occupation.policy] ?? occupation.policy
                  : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">다음 공격</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation ? formatNextAttack(occupation.nextAttackAt) : "—"}
              </dd>
            </dl>
            <button
              type="button"
              onClick={() => onEnterOutpost(outpost)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <DoorOpen size={16} weight="fill" />
              거점 진입
            </button>
          </section>
        )}

        <header className="rounded-md bg-white/80 px-3 py-2 backdrop-blur-sm dark:bg-zinc-950/70">
          <h1 className="text-lg font-bold">모험</h1>
        </header>

        <button
          type="button"
          onClick={onOpenArena}
          className="w-full rounded-lg border border-zinc-300 bg-white/90 p-5 text-left transition hover:border-amber-500 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-950/90 dark:hover:border-amber-400 dark:hover:bg-amber-950/30"
        >
          <div className="flex items-center gap-3">
            <Sword size={32} weight="duotone" className="text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <div className="text-base font-semibold">아레나</div>
              <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                1:1 단판 결투 — 빌드 자랑의 무대
              </div>
            </div>
          </div>
        </button>
      </div>
    </main>
  );
}
