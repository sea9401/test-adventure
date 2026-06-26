"use client";

import { ClaimResultCard, type ClaimResult } from "../ClaimResultCard";
import type { RaidResult, ConquestResult } from "./types";

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
        <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {typeof raidResult === "string" ? (
            <span className="text-rose-600 dark:text-rose-400">
              {raidResult}
            </span>
          ) : raidResult.won ? (
            <span>
              약탈 성공! <strong>{raidResult.stolenGold.toLocaleString()} 골드</strong>{" "}
              탈취
              {raidResult.defenderName
                ? ` — 수비자 ${raidResult.defenderName} 격파`
                : " (무방비 거점)"}
            </span>
          ) : (
            <span>
              약탈 실패 — 수비자
              {raidResult.defenderName ? ` ${raidResult.defenderName}` : ""}에게
              패배. 건강도를 회복하고 다시 시도하세요.
            </span>
          )}
          <button
            type="button"
            onClick={onCloseRaid}
            className="ml-2 text-xs text-zinc-500 underline"
          >
            닫기
          </button>
        </div>
      )}
      {conquestResult && (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {typeof conquestResult === "string" ? (
            <span className="text-rose-600 dark:text-rose-400">
              {conquestResult}
            </span>
          ) : conquestResult.captured ? (
            conquestResult.razed ? (
              <span>
                <strong>함락!</strong> 정착지를 무너뜨려 빈땅으로 만들었습니다
                (개인은 점령할 수 없어 철거). 빈 칸이 되어 누구든 새로 개척할 수
                있습니다.
              </span>
            ) : (
              <span>
                <strong>함락!</strong> 거점을 점령했습니다
                {conquestResult.downgradedTo
                  ? ` — 마을이 ${conquestResult.downgradedTo}(으)로 강등됨`
                  : ""}
                .
              </span>
            )
          ) : conquestResult.clearedQueue ? (
            <span>
              수비대 {conquestResult.defendersDefeated}명 격파 · 성벽{" "}
              <strong>
                {conquestResult.fortHp}/{conquestResult.fortMaxHp}
              </strong>{" "}
              — 성벽을 더 깎아야 함락됩니다.
            </span>
          ) : (
            <span>
              공성 실패 — 수비대에 막혔습니다(
              {conquestResult.defendersDefeated}명 격파). 건강도를 회복하고
              다시 시도하세요.
            </span>
          )}
          <button
            type="button"
            onClick={onCloseConquest}
            className="ml-2 text-xs text-zinc-500 underline"
          >
            닫기
          </button>
        </div>
      )}
    </>
  );
}
