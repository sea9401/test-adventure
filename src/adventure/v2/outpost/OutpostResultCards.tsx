"use client";

import { ClaimResultCard, type ClaimResult } from "../ClaimResultCard";
import type { RaidResult, ConquestResult } from "./types";
import { Coins, ShieldSlash, Sword, X } from "@phosphor-icons/react";

// 점령/약탈/정복 결과 카드 — 탭 분기 밖(점령 성공 시 내 거점으로 전환돼도 결과 카드 유지).
// 결과 state 와 닫기 핸들러는 코디네이터(OutpostView)가 보유(거동 불변).
export function OutpostResultCards({
  lastClaimResult,
  raidResult,
  conquestResult,
  outpostName,
  coreLoopOn,
  onCloseClaim,
  onCloseRaid,
  onCloseConquest,
}: {
  lastClaimResult: ClaimResult | null;
  raidResult: RaidResult | null;
  conquestResult: ConquestResult | null;
  outpostName: string;
  coreLoopOn: boolean;
  onCloseClaim: () => void;
  onCloseRaid: () => void;
  onCloseConquest: () => void;
}) {
  return (
    <>
      {/* 점령 결과 — 탭 분기 밖(점령 성공 시 내 거점으로 전환돼도 결과 카드 유지). */}
      {lastClaimResult && (
        <ClaimResultCard
          result={lastClaimResult}
          outpostName={outpostName}
          onClose={onCloseClaim}
          coreLoopOn={coreLoopOn}
        />
      )}
      {raidResult && (
        <div
          className={`war-result-pop rounded-md border px-3 py-2 text-sm ${
            typeof raidResult !== "string" && raidResult.won
              ? "war-raid-ready border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-100"
              : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded bg-current/10 p-1">
              {typeof raidResult !== "string" && raidResult.won ? (
                <Coins size={16} weight="fill" />
              ) : (
                <ShieldSlash size={16} weight="fill" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {typeof raidResult === "string" ? (
                <span>{raidResult}</span>
              ) : raidResult.won ? (
                <span>
                  <strong>약탈 성공</strong> ·{" "}
                  <strong className="text-base tabular-nums">
                    {raidResult.stolenGold.toLocaleString()}G
                  </strong>{" "}
                  탈취
                  {raidResult.defenderName
                    ? ` · 수비자 ${raidResult.defenderName} 격파`
                    : " · 무방비 거점"}
                </span>
              ) : (
                <span>
                  <strong>약탈 실패</strong> · 수비자
                  {raidResult.defenderName ? ` ${raidResult.defenderName}` : ""}에게
                  패배. 건강도를 회복하고 다시 시도하세요.
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseRaid}
            className="mt-2 inline-flex items-center gap-1 text-xs opacity-70 underline"
          >
            <X size={12} weight="bold" />
            닫기
          </button>
        </div>
      )}
      {conquestResult && (
        <div
          className={`war-result-pop rounded-md border px-3 py-2 text-sm ${
            typeof conquestResult !== "string" && conquestResult.captured
              ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
              : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded bg-current/10 p-1">
              <Sword size={16} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              {typeof conquestResult === "string" ? (
                <span className="text-rose-600 dark:text-rose-400">
                  {conquestResult}
                </span>
              ) : conquestResult.captured ? (
                conquestResult.razed ? (
                  <span>
                    <strong>함락</strong> · 정착지를 빈땅으로 만들었습니다.
                  </span>
                ) : (
                  <span>
                    <strong>함락</strong> · 거점을 점령했습니다
                    {conquestResult.downgradedTo
                      ? ` · ${conquestResult.downgradedTo}(으)로 강등`
                      : ""}
                  </span>
                )
              ) : conquestResult.clearedQueue ? (
                <span>
                  수비대 {conquestResult.defendersDefeated}명 격파 · 성벽{" "}
                  <strong>
                    {conquestResult.fortHp}/{conquestResult.fortMaxHp}
                  </strong>{" "}
                  남음
                </span>
              ) : (
                <span>
                  공성 실패 · 수비대에 막혔습니다(
                  {conquestResult.defendersDefeated}명 격파).
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseConquest}
            className="mt-2 inline-flex items-center gap-1 text-xs opacity-70 underline"
          >
            <X size={12} weight="bold" />
            닫기
          </button>
        </div>
      )}
    </>
  );
}
