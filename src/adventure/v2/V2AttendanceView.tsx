"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Check, Gift } from "@phosphor-icons/react";
import {
  MONTHLY_ATTENDANCE_BONUS_SUPPORT_DAYS,
  MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS,
  MONTHLY_ATTENDANCE_REWARDS,
  monthlyAttendanceRewardLabel,
  type MonthlyAttendanceReward,
} from "@/adventure/data/v2/monthlyAttendance";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { useRefreshGameState } from "./GameStateRefreshContext";
import { setAttendanceReminder } from "./useAttendanceReminder";

type AttendanceResponse = {
  ok: true;
  monthKey: string;
  todayKey: string;
  claimedDayKeys: string[];
  claimedCount: number;
  claimedToday: boolean;
  complete: boolean;
  canClaim: boolean;
  nextDay: number | null;
  rewards: readonly MonthlyAttendanceReward[];
};

const ERROR_MESSAGES: Record<string, string> = {
  already_claimed: "오늘 출석 보상은 이미 받았습니다.",
  month_complete: "이번 달 출석 보상을 모두 받았습니다.",
  no_character: "캐릭터를 만든 뒤 출석할 수 있습니다.",
};

function rewardMark(reward: MonthlyAttendanceReward): string {
  if (reward.cosmeticBox === "chroma_name_box") return "🎨";
  if (reward.cosmeticBox === "chat_badge_box") return "🏷️";
  if (reward.cosmeticBox === "profile_border_box") return "🖼️";
  if (reward.kind === "adventure_support") return "🎫";
  if (reward.kind === "stamina_potion") return "🧪";
  if (reward.kind === "boss_summon_scroll") return "📜";
  if (reward.kind === "mastery_certificate") return "🏅";
  if (reward.kind === "torn_map_fragment") return "🗺️";
  return "🪙";
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function V2AttendanceView() {
  const refreshGameState = useRefreshGameState();
  const [status, setStatus] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/me/attendance", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | AttendanceResponse
        | { ok?: false; error?: string }
        | null;
      if (!response.ok || !data?.ok) throw new Error("load_failed");
      setStatus(data);
      setAttendanceReminder(data.canClaim);
    } catch {
      setNotice({
        tone: "error",
        text: "출석 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 비동기 응답 뒤 상태를 갱신하므로 동기 effect setState가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const claim = async () => {
    if (!status?.canClaim || claiming) return;
    setClaiming(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/me/attendance", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | (AttendanceResponse & { rewardLabel?: string })
        | { ok?: false; error?: string }
        | null;
      if (!response.ok || !data?.ok) {
        const error = data && "error" in data ? data.error : undefined;
        throw new Error(error || "claim_failed");
      }
      setStatus(data);
      setAttendanceReminder(data.canClaim);
      setNotice({
        tone: "success",
        text: `${data.rewardLabel ?? "출석 보상"}을 받았습니다.`,
      });
      await refreshGameState();
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "claim_failed";
      setNotice({
        tone: "error",
        text:
          ERROR_MESSAGES[error] ??
          "출석 보상을 받지 못했습니다. 잠시 뒤 다시 시도해주세요.",
      });
      if (error === "already_claimed" || error === "month_complete") {
        void load();
      }
    } finally {
      setClaiming(false);
    }
  };

  const rewards = status?.rewards ?? MONTHLY_ATTENDANCE_REWARDS;
  const nextReward =
    status?.nextDay != null ? rewards[status.nextDay - 1] : null;

  return (
    <div className="space-y-4">
      <Card padding="lg" className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CalendarCheck size={28} weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">
              {status ? monthLabel(status.monthKey) : "월간 출석 체크"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              하루에 한 칸씩 받을 수 있습니다. 빠진 날이 있어도 이번 달 진도는 유지됩니다.
            </p>
          </div>
        </div>

        <StatusBanner tone="info" className="py-2 text-sm">
          <span className="block">
            1일차에는 월간 모험 지원권 {MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS}일이
            계정에 즉시 적용됩니다. 이미 이용 중이면 남은 기간 뒤에{" "}
            {MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS}일이 이어집니다.
          </span>
          <span className="mt-1 block">
            14·21일차에는 월간 모험 지원권 {MONTHLY_ATTENDANCE_BONUS_SUPPORT_DAYS}일을
            추가로 받아 이용 기간을 연장합니다.
          </span>
          <span className="mt-1 block">
            7·14·28일차에는 닉네임·채팅 배지·프로필 꾸미기 상자를 추가로 받고,
            설정의 꾸미기 화면에서 열 수 있습니다.
          </span>
        </StatusBanner>

        <div
          className={`${SURFACE_INSET} flex items-center justify-between gap-3 p-3`}
        >
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              이번 달 출석
            </div>
            <div className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {status?.claimedCount ?? 0} / {rewards.length}일
            </div>
          </div>
          <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
            {nextReward && status?.nextDay ? (
              <>
                <div>{status.nextDay}일차 보상</div>
                <div className="mt-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                  {monthlyAttendanceRewardLabel(nextReward)}
                </div>
              </>
            ) : (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                이번 달 완료
              </span>
            )}
          </div>
        </div>

        {notice && (
          <StatusBanner
            tone={notice.tone}
            role="status"
            className="py-2 text-sm"
          >
            {notice.text}
          </StatusBanner>
        )}

        <Button
          variant="success"
          size="md"
          fullWidth
          disabled={loading || claiming || !status?.canClaim}
          onClick={() => void claim()}
        >
          <Gift size={18} weight="duotone" />
          {loading
            ? "출석판 불러오는 중..."
            : claiming
              ? "보상 받는 중..."
              : status?.complete
                ? "이번 달 출석 완료"
                : status?.claimedToday
                  ? "오늘 출석 완료"
                  : "오늘 출석 보상 받기"}
        </Button>
      </Card>

      <Card padding="md">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {rewards.map((reward, index) => {
            const day = index + 1;
            const claimed = day <= (status?.claimedCount ?? 0);
            const current = day === status?.nextDay;
            const surface =
              reward.kind === "adventure_support"
                ? SURFACE_ACCENT
                : SURFACE_INSET;
            return (
              <div
                key={day}
                className={`${surface} relative min-h-24 p-2 text-center ${
                  current
                    ? "border-emerald-500 ring-2 ring-emerald-200 dark:border-emerald-500 dark:ring-emerald-900"
                    : ""
                }`}
              >
                <div
                  className={`text-[11px] font-semibold ${
                    claimed
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {day}일차
                </div>
                <div className="my-1 text-xl" aria-hidden="true">
                  {rewardMark(reward)}
                </div>
                <div className="break-keep text-[10px] leading-4 text-zinc-700 dark:text-zinc-300">
                  {monthlyAttendanceRewardLabel(reward)}
                </div>
                {claimed && (
                  <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check size={11} weight="bold" aria-label="수령 완료" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
