"use client";

// claim 결과 시각화 패널. 한 줄 텍스트 → 단계별 카드.
//
// 표시 내용:
//   - PvP 1v1 / NPC 일기토: 챔피언 격파/패배 + 턴 수 + 전투 리플레이
//
// 결과 객체 (ClaimResponse) 받아서 렌더링.

import { ReplayBattleScene } from "./ReplayBattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";

export type ClaimResult = {
  ok?: boolean;
  error?: string;
  won?: boolean;
  raceLost?: boolean;
  pvp?: boolean;
  championName?: string;
  turns?: number;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  // 공성 — captured=소유권 이전(함락/점령). fortHp/fortMaxHp=타격 후 성벽.
  // won && !captured = 성벽만 깎인 공성 진행.
  captured?: boolean;
  fortHp?: number;
  fortMaxHp?: number;
  // 길드 금고 자동 수리(PR-2) — 이번 타격 전 수비 길드 금고로 보강한 HP·소모 골드.
  repairedHp?: number;
  repairGoldSpent?: number;
  // 거점 금고 탈환 — 점령/함락 시 자동 회수분(본인/길드 분배). 없으면 null.
  treasuryCaptured?: {
    total: number;
    capturerShare: number;
    guildShare: number;
  } | null;
  // 전투 리플레이 — 있으면 ReplayBattleScene 으로 표시(전투 진행 확인용).
  // NPC 일기토 + PvP 1v1 생성.
  replay?: ReplayPayload | null;
  startPlayerHp?: number;
  playerName?: string;
  gender?: string;
  requiredStamina?: number;
  // 점령 비용은 길드 보유 골드에서 차감 — 부족 시 필요액 안내.
  requiredGold?: number;
};

export function ClaimResultCard({
  result,
  outpostName,
  onClose,
  coreLoopOn = false,
}: {
  result: ClaimResult;
  outpostName: string;
  onClose: () => void;
  // 코어루프 on = 점령 비용이 골드(스태미나 아님). 차감 안내 문구 분기.
  coreLoopOn?: boolean;
}) {
  // 에러 응답 (ok=false) — 한 줄 에러 카드.
  if (!result.ok) {
    const reason =
      result.error === "out_of_stamina"
        ? `스태미너 부족 (필요 ${result.requiredStamina})`
        : result.error === "out_of_gold"
          ? `길드 골드 부족 — 점령 비용 ${(result.requiredGold ?? 0).toLocaleString()} G 필요 (거점 금고를 회수해 채우세요)`
          : result.error === "already_yours"
            ? "이미 자기 길드 점령"
            : result.error === "protected"
              ? "함락 직후 보호막 — 잠시 후 다시 공성 가능"
              : (result.error ?? "알 수 없는 오류");
    return (
      <ResultShell
        title="점령 실패"
        outpostName={outpostName}
        accent="red"
        onClose={onClose}
      >
        <div className="text-sm text-red-700 dark:text-red-300">{reason}</div>
      </ResultShell>
    );
  }

  // 결과 머리말 — 함락(점령) / 공성 진행 / 패배 / race.
  const wallText =
    result.fortHp != null && result.fortMaxHp != null
      ? ` (남은 성벽 ${result.fortHp}/${result.fortMaxHp})`
      : "";
  const winLabel = result.raceLost
    ? `△ 다른 세력이 먼저 점령 — ${coreLoopOn ? "길드 골드" : "스태미너"}만 차감`
    : result.captured
      ? result.pvp
        ? "✓ 함락 — 점령 성공"
        : "✓ 점령 성공"
      : result.won
        ? `⚔ 공성 — 성벽을 깎았다${wallText}`
        : `✗ 패배${wallText}`;
  const accent: "green" | "amber" | "red" = result.raceLost
    ? "amber"
    : result.captured
      ? "green"
      : result.won
        ? "amber"
        : "red";

  return (
    <div className="flex flex-col gap-3">
      <ResultShell
        title={winLabel}
        outpostName={outpostName}
        accent={accent}
        onClose={onClose}
      >
        <div className="flex flex-col gap-3">
          {result.treasuryCaptured && result.treasuryCaptured.total > 0 && (
            <div className="ui-reward-flash rounded-md border border-yellow-400/60 bg-yellow-400/10 px-3 py-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
              🪙 거점 금고 {result.treasuryCaptured.total.toLocaleString()} G
              획득! (내 몫 +
              {result.treasuryCaptured.capturerShare.toLocaleString()} G · 길드
              금고 +{result.treasuryCaptured.guildShare.toLocaleString()} G)
            </div>
          )}
          {result.repairedHp != null && result.repairedHp > 0 && (
            <div className="rounded-md bg-sky-500/10 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-300">
              🛡 수비 길드가 금고로 성벽 +{result.repairedHp} 수리 (−
              {(result.repairGoldSpent ?? 0).toLocaleString()} 골드)
            </div>
          )}
          <DuelOnlySection
            championName={result.championName ?? "?"}
            turns={result.turns ?? 0}
            won={!!result.won}
            hpBefore={result.hpBefore}
            hpAfter={result.hpAfter}
            maxHp={result.maxHp}
          />
        </div>
      </ResultShell>
      {/* 전투 리플레이 — 사냥/아레나와 동일한 BattleScene 으로 전투 진행 표시(NPC·PvP 1v1). */}
      {result.replay && (
        <ReplayBattleScene
          payload={result.replay}
          startPlayerHp={result.startPlayerHp}
          playerName={result.playerName ?? "모험가"}
          gender={(result.gender ?? "male1") as Gender}
          exp={0}
          maxExp={1}
        />
      )}
    </div>
  );
}

function ResultShell({
  title,
  outpostName,
  accent,
  onClose,
  children,
}: {
  title: string;
  outpostName: string;
  accent: "green" | "amber" | "red";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const accentBorder = {
    green: "border-emerald-300 dark:border-emerald-700",
    amber: "border-amber-300 dark:border-amber-700",
    red: "border-red-300 dark:border-red-700",
  }[accent];
  const accentBg = {
    green: "bg-emerald-50 dark:bg-emerald-950",
    amber: "bg-amber-50 dark:bg-amber-950",
    red: "bg-red-50 dark:bg-red-950",
  }[accent];
  return (
    <div className={`rounded-md border ${accentBorder} ${accentBg}`}>
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-zinc-500">{outpostName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          닫기
        </button>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

function DuelOnlySection({
  championName,
  turns,
  won,
  hpBefore,
  hpAfter,
  maxHp,
}: {
  championName: string;
  turns: number;
  won: boolean;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        NPC 일기토 — {championName}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-zinc-500">{won ? "격파" : "패배"}</div>
          <div className="font-mono">{turns}행동</div>
        </div>
        {maxHp !== undefined && (
          <div className="text-right">
            <div className="text-zinc-500">영웅 hp</div>
            <div className="font-mono">
              {hpBefore ?? "?"} → {hpAfter ?? "?"} / {maxHp}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
