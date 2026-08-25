"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";

const HUNT_PLAYER_STATUS_EXPANDED_STORAGE_KEY =
  "v2-hunt-player-status-expanded.v1";

function loadExpandedPreference(): boolean {
  try {
    return (
      localStorage.getItem(HUNT_PLAYER_STATUS_EXPANDED_STORAGE_KEY) !== "false"
    );
  } catch {
    return true;
  }
}

function saveExpandedPreference(expanded: boolean): void {
  try {
    localStorage.setItem(
      HUNT_PLAYER_STATUS_EXPANDED_STORAGE_KEY,
      String(expanded),
    );
  } catch {}
}

export function CompactBattlePlayerStatus({
  name,
  subtitle,
  hp,
  mp,
  exp,
  maxExp,
  hpCharges,
  mpCharges,
  proficiency = null,
  children,
}: {
  name: string;
  subtitle?: string;
  hp: { hp: number; maxHp: number };
  mp?: { mp: number; maxMp: number } | null;
  exp: number;
  maxExp: number;
  hpCharges: number;
  mpCharges: number;
  proficiency?: number | null;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const preferenceLoaded = useRef(false);

  useEffect(() => {
    // 서버와 첫 클라이언트 렌더는 기본 펼침으로 맞추고, 마운트 뒤 저장값을 복원한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 클라이언트 하이드레이션
    setExpanded(loadExpandedPreference());
    preferenceLoaded.current = true;
  }, []);

  return (
    <Card
      as="details"
      open={expanded}
      onToggle={(event) => {
        if (!preferenceLoaded.current) return;
        const nextExpanded = event.currentTarget.open;
        setExpanded(nextExpanded);
        saveExpandedPreference(nextExpanded);
      }}
      padding="none"
      className="overflow-hidden"
    >
      <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
        {expanded ? (
          <span className="block text-right text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
            간략히 보기
          </span>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">{name}</span>
              {subtitle && <span className="block truncate text-[12px] leading-tight text-zinc-500 dark:text-zinc-400">{subtitle}</span>}
            </span>
            <span className="shrink-0 whitespace-nowrap text-right text-[0.6875rem] tabular-nums text-zinc-500 dark:text-zinc-400">
              <span className="block">HP {hp.hp.toLocaleString()} / {hp.maxHp.toLocaleString()}{mp && mp.maxMp > 0 ? ` · MP ${mp.mp.toLocaleString()} / ${mp.maxMp.toLocaleString()}` : ""}</span>
              <span className="block" data-recovery-charge="hp">
                HP 충전약 {hpCharges.toLocaleString()}
              </span>
              {mp && mp.maxMp > 0 ? (
                <span className="block" data-recovery-charge="mp">
                  MP 충전약 {mpCharges.toLocaleString()}
                </span>
              ) : null}
              {proficiency != null ? (
                <span className="block">
                  직업 숙련도 {proficiency.toLocaleString()}
                </span>
              ) : null}
              <span className="block">EXP {Math.max(0, exp).toLocaleString()} / {Math.max(1, maxExp).toLocaleString()} · 상세 보기</span>
            </span>
          </div>
        )}
      </summary>
      <Inset className="m-2 mt-0 p-1">{children}</Inset>
    </Card>
  );
}
