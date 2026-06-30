"use client";

import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { OutpostAttackLog } from "../OutpostAttackLog";
import type { OccupationLite } from "./types";

// 비-소유 거점 — 점령/약탈/정복 시도 카드 + 정찰용 공격 기록.
// 점령/약탈/정복의 상태 머신(결과 state, fetch 호출)은 코디네이터(OutpostView)가 보유하고,
// 이 패널은 미리 계산된 게이트 플래그 + 핸들러만 받아 렌더한다(거동 불변).
export function OutpostAttackPanel({
  outpostId,
  viewerGuildId,
  occupation,
  showConquer,
  claimDisabled,
  coreLoopOn,
  busy,
  raidDisabled,
  conquerOutOfRange,
  conquerRazes,
  attackLogReload,
  onClaim,
  onRaid,
  onConquest,
}: {
  outpostId: string;
  viewerGuildId: number | null;
  occupation: OccupationLite;
  showConquer: boolean;
  claimDisabled: { reason: string } | null;
  coreLoopOn: boolean;
  busy: boolean;
  raidDisabled: { reason: string } | null;
  conquerOutOfRange: boolean;
  conquerRazes: boolean;
  attackLogReload: number;
  onClaim: () => void;
  onRaid: () => void;
  onConquest: () => void;
}) {
  return (
    <>
      <HeaderPanel className="py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          여기서 할 수 있는 것
        </div>
      </HeaderPanel>
      {/* 영토=길드 소유 — 무소속 viewer 는 점령/정복 불가. 안내만 노출. */}
      {viewerGuildId == null && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          거점은 길드만 점령·정복할 수 있어요. 길드를 만들거나 가입하면 이
          땅을 노릴 수 있습니다.
        </div>
      )}
      {/* 옛 공성/점령 — 정착지 전쟁 on 이면 적 길드 거점·남의 솔로 타일에선
          숨김(약탈/정복으로 일원화). 미점령/NPC 거점 점령은 그대로(새 영토 확보 경로).
          무소속(viewerGuildId null)은 점령 불가라 카드 숨김. */}
      {viewerGuildId != null &&
        !(V2_SETTLEMENT_WARFARE && occupation?.occupiedByGuildId != null) &&
        !showConquer && (
        <ActionCard
          title={
            claimDisabled
              ? "점령 시도"
              : occupation
                ? "공성 시도 (PvP 결투)"
                : "점령 시도 (NPC 일기토)"
          }
          subtitle={
            claimDisabled?.reason ??
            (occupation
              ? `점령자와 1대1 결투 — 승리 시 성벽을 깎고, 0이 되면 함락${coreLoopOn ? "" : " (스태미너 소모)"}.`
              : `거점 NPC 영웅과 1대1 결투. 승리 시 점령${coreLoopOn ? "" : " (스태미너 소모)"}.`)
          }
          onClick={onClaim}
          disabled={!!claimDisabled || busy}
          loading={busy}
        />
      )}
      {/* 약탈 — 길드 viewer + 길드 점령 대상만(금고 일부 탈취). 솔로 타일은 금고가 없어 제외.
          플래그 on 전용. */}
      {V2_SETTLEMENT_WARFARE &&
        viewerGuildId != null &&
        occupation?.occupiedByGuildId != null && (
          <ActionCard
            title="약탈 시도"
            subtitle={
              "이 정착지 칸에서 1시간 이상 버티면 약탈 가능 — 수비대 격파 시 거점 금고 10% 탈취, 수비대가 없으면 무혈 약탈로 25% 탈취."
            }
            onClick={onRaid}
            disabled={raidDisabled ?? busy}
            loading={busy}
          />
        )}
      {/* 정복 — 타일=누구나, 카탈로그 거점=길드 viewer + 길드 점령. 막타가 솔로면 빈땅(철거),
          길드면 인수. 솔로 viewer 도 길드 영지를 칠 수 있으나 소유는 못 하고 철거만. */}
      {showConquer && (
        <ActionCard
          title="정복 시도"
          subtitle={
            conquerOutOfRange
              ? "인접한 우리 영지가 있어야 정복할 수 있어요 — 우리 길드 영지 옆 칸부터(땅이 없으면 중립 거점 옆 칸부터) 노리세요."
              : conquerRazes
                ? "인접한 우리 영지가 있어야 정복 가능(땅 없는 길드는 중립 거점 옆 칸부터) — 수비와 건강도 결투 + 성벽 공성. 개인은 점령할 수 없어 함락 시 빈땅으로 철거됩니다(여러 차례 공격 필요)."
                : "인접한 우리 영지가 있어야 정복 가능(땅 없는 길드는 중립 거점 옆 칸부터) — 수비대 전원과 건강도 결투 + 성벽 공성, 함락 시 마을 1단계 강등·소유 이전. 한 번에 안 되니 여러 차례 공격해야 함."
          }
          onClick={onConquest}
          disabled={busy || conquerOutOfRange}
          loading={busy}
        />
      )}
      {/* 공격자 시점 정찰 — 이 거점에 행해진 최근 공격 기록(승패·성벽 타격)을
          노출. 소유 탭의 "최근 공격 기록" 과 동일 컴포넌트(읽기 전용). */}
      <OutpostAttackLog outpostId={outpostId} reloadKey={attackLogReload} />
    </>
  );
}

function ActionCard({
  title,
  subtitle,
  onClick,
  disabled,
  loading,
}: {
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: { reason: string } | boolean;
  loading?: boolean;
}) {
  const isDisabled = !!disabled;
  const reason = typeof disabled === "object" ? disabled.reason : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="war-action-card block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
    >
      <div className="font-medium">
        {title}
        {loading && <span className="ml-2 text-xs text-zinc-500">…</span>}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{reason ?? subtitle}</div>
    </button>
  );
}
