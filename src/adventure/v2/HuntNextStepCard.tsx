"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  growthGuideShortcutLabel,
  type GrowthGuideStep,
} from "@/adventure/data/v2/growthGuide";
import { questRewardText } from "@/adventure/data/v2/questRewardText";
import { Button, buttonClassName } from "@/components/ui/Button";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import { useOptionalRefreshGameState } from "./GameStateRefreshContext";
import { useRewardToast } from "./RewardToastProvider";

function claimErrorText(error: string | undefined): string {
  if (error === "not_complete") return "아직 완료 조건을 채우지 못했어요";
  if (error === "already_claimed") return "이미 수령했어요";
  return "보상을 받지 못했어요. 잠시 뒤 다시 시도해 주세요";
}

async function fetchStep(): Promise<GrowthGuideStep | null> {
  const response = await fetch("/api/v2/me/quests/growth-step");
  const json = (await response.json()) as { ok?: boolean; step?: GrowthGuideStep | null };
  return response.ok && json.ok ? json.step ?? null : null;
}

// 사냥 결과 아래에서 첫 직업을 고르기 전의 모험가에게 성장의 길의 지금 단계를 보여 준다.
// 조건을 채운 단계는 여기서 바로 보상을 받고, 받으면 이어서 다음 단계가 나온다.
export function HuntNextStepCard({
  jobId,
  refreshKey,
}: {
  jobId: string | null;
  /** 사냥 결과가 바뀔 때마다 달라지는 값. 바뀌면 단계를 다시 조회한다. */
  refreshKey: unknown;
}) {
  const isAdventurer = jobId === "none";
  const [step, setStep] = useState<GrowthGuideStep | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshGameState = useOptionalRefreshGameState();
  const { notifyReward, notifySystem } = useRewardToast();

  const load = useCallback(async () => {
    try {
      setStep(await fetchStep());
    } catch {
      // 안내 카드는 없어도 사냥에는 지장이 없다. 다음 사냥 결과에서 다시 조회한다.
    }
  }, []);

  useEffect(() => {
    if (!isAdventurer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 사냥 결과가 바뀔 때 서버의 단계 상태를 다시 읽는다.
    void load();
  }, [isAdventurer, refreshKey, load]);

  if (!isAdventurer || !step) return null;

  const claim = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v2/me/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId: step.id }),
      });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) {
        notifySystem(claimErrorText(json?.error));
        return;
      }
      const text = questRewardText(step.reward);
      if (text) notifyReward("보상 수령", text);
      await Promise.all([load(), refreshGameState?.()]);
    } catch {
      notifySystem(claimErrorText(undefined));
    } finally {
      setBusy(false);
    }
  };

  const reward = questRewardText(step.reward);
  const shortcut = growthGuideShortcutLabel(step.href);
  const showProgress = step.status === "active" && step.goal !== null && step.goal > 1;

  return (
    <section aria-label="다음 할 일" className={`${SURFACE_ACCENT} p-3`}>
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        성장의 길 {step.stepNumber} / {step.stepCount}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
            {step.status === "claimable" ? `${step.title} 달성` : step.title}
          </h3>
          {step.status === "claimable" ? (
            reward ? <p className="text-sm text-zinc-700 dark:text-zinc-200">보상: {reward}</p> : null
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-200">{step.desc}</p>
          )}
        </div>
        {step.status === "claimable" ? (
          <Button className="min-h-10 shrink-0" loading={busy} onClick={() => void claim()}>
            보상 받기
          </Button>
        ) : showProgress ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {(step.progress ?? 0).toLocaleString("ko-KR")} / {step.goal!.toLocaleString("ko-KR")}
          </span>
        ) : shortcut && step.href ? (
          <Link href={step.href} className={buttonClassName({ variant: "secondary", size: "sm", className: "min-h-10 shrink-0" })}>
            {shortcut}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
