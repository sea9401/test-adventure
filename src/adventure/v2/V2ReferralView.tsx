"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Check, Copy, Gift, ShareNetwork, UserPlus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type ReferralSummary = {
  ok: true;
  code: string | null;
  newUserStaminaPotions: number;
  referrerSignupStaminaPotions: number;
  referrerStaminaPotionsPerMilestone: number;
  rewardMilestones: Array<{
    frontierDepth: number;
    referrerStaminaPotions: number;
  }>;
  attributedCount: number;
  totalRewardStaminaPotions: number;
  referrals: Array<{
    name: string;
    currentFrontierDepth: number;
    rewardedDepth: number;
    completedMilestones: number;
    signupRewarded?: boolean;
    completedRewardStages?: number;
    convertedAt: string;
  }>;
};

const subscribeOrigin = () => () => {};

async function fetchReferralSummary(): Promise<ReferralSummary> {
  const response = await fetch("/api/referrals/me", { cache: "no-store" });
  const json = (await response.json().catch(() => null)) as ReferralSummary | null;
  if (!response.ok || !json?.ok) throw new Error("load failed");
  return json;
}

export function V2ReferralView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const origin = useSyncExternalStore(
    subscribeOrigin,
    () => window.location.origin,
    () => "",
  );
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSummary(await fetchReferralSummary());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchReferralSummary()
      .then((json) => {
        if (!cancelled) setSummary(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const link = useMemo(
    () => (summary?.code && origin ? `${origin}/r/${summary.code}` : ""),
    [origin, summary?.code],
  );
  const rewardStageCount = (summary?.rewardMilestones.length ?? 5) + 1;
  const referrerSignupReward = summary?.referrerSignupStaminaPotions ?? 2;
  const referrerRewardPerMilestone =
    summary?.referrerStaminaPotionsPerMilestone ?? 2;
  const maxReferrerReward =
    referrerSignupReward +
    (summary?.rewardMilestones.length ?? 5) * referrerRewardPerMilestone;

  const issue = async () => {
    if (issuing) return;
    setIssuing(true);
    setError(false);
    try {
      const response = await fetch("/api/referrals/me", { method: "POST" });
      const json = (await response.json().catch(() => null)) as ReferralSummary | null;
      if (!response.ok || !json?.ok) throw new Error("issue failed");
      setSummary(json);
    } catch {
      setError(true);
    } finally {
      setIssuing(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "무슨무슨게임",
          text: "함께 모험을 시작해요!",
          url: link,
        });
        return;
      } catch {
        return;
      }
    }
    await copy();
  };

  const content = (
    <>
      {error && <LoadErrorBanner onRetry={load} />}

      <Card padding="lg" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Gift size={24} weight="duotone" />
          </span>
          <div>
            <h2 className="font-bold">친구를 초대하고 보상받기</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              링크로 합류한 친구와 나는 가입 완료 시 회복약 2개씩 받고,
              친구가 프론티어를 진행할 때마다 추가 보상이 도착합니다.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton rows={3} />
        ) : summary?.code ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              내 홍보 링크
            </label>
            <div className={`${SURFACE_INSET} flex items-center gap-2 p-2`}>
              <input
                readOnly
                value={link}
                aria-label="내 홍보 링크"
                className="min-w-0 flex-1 bg-transparent px-1 text-sm text-zinc-800 outline-none dark:text-zinc-100"
              />
              <Button size="sm" onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "복사됨" : "복사"}
              </Button>
            </div>
            <Button variant="warning" size="md" fullWidth onClick={share}>
              <ShareNetwork size={18} weight="bold" />
              공유하기
            </Button>
          </div>
        ) : (
          <Button
            variant="warning"
            size="md"
            fullWidth
            disabled={issuing}
            onClick={issue}
          >
            <ShareNetwork size={18} weight="bold" />
            {issuing ? "발급 중…" : "내 홍보 링크 발급하기"}
          </Button>
        )}

        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          신규 모험가: 스태미나 회복약{" "}
          {summary?.newUserStaminaPotions ?? 2}개 · 홍보자: 가입 시{" "}
          {referrerSignupReward}개 + 진행 단계마다 {referrerRewardPerMilestone}개,
          1명당 최대 {maxReferrerReward}개 · 한
          계정은 한 번만 인정 · 본인 링크는 제외됩니다.
        </p>
      </Card>

      <Card padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">진행도별 보상</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            친구가 가입을 완료할 때 첫 보상이, 각 프론티어에 처음 도달할 때 추가
            보상이 지급됩니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className={`${SURFACE_INSET} px-2 py-3 text-center`}>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              가입 완료
            </p>
            <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">
              회복약 +{referrerSignupReward}개
            </p>
          </div>
          {(summary?.rewardMilestones ?? [
            { frontierDepth: 6, referrerStaminaPotions: 2 },
            { frontierDepth: 12, referrerStaminaPotions: 2 },
            { frontierDepth: 18, referrerStaminaPotions: 2 },
            { frontierDepth: 24, referrerStaminaPotions: 2 },
            { frontierDepth: 36, referrerStaminaPotions: 2 },
          ]).map((milestone) => (
            <div
              key={milestone.frontierDepth}
              className={`${SURFACE_INSET} px-2 py-3 text-center`}
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                프론티어 {milestone.frontierDepth}
              </p>
              <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">
                회복약 +{milestone.referrerStaminaPotions}개
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card padding="md">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">홍보 참여</p>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "-" : (summary?.attributedCount.toLocaleString() ?? "0")}
            <span className="ml-1 text-sm font-medium text-zinc-500">명</span>
          </p>
        </Card>
        <Card padding="md">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">누적 보상</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">
            {loading
              ? "-"
              : (summary?.totalRewardStaminaPotions.toLocaleString() ?? "0")}
            <span className="ml-1 text-sm font-medium">개</span>
          </p>
        </Card>
      </div>

      {!loading && summary && (
        <Card padding="none" className="overflow-hidden">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-bold">내 링크로 합류한 모험가</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              현재 프론티어와 {rewardStageCount}단계 보상 진척도를 확인할 수 있습니다.
            </p>
          </div>
          {summary.referrals.length > 0 ? (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {summary.referrals.map((item) => {
                const completedRewardStages =
                  item.completedRewardStages ??
                  item.completedMilestones + (item.signupRewarded ? 1 : 0);
                return (
                  <li
                    key={`${item.convertedAt}-${item.name}`}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <UserPlus
                      size={19}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {completedRewardStages}/{rewardStageCount}단계
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{
                            width: `${Math.min(100, (completedRewardStages / rewardStageCount) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        현재 프론티어 {item.currentFrontierDepth} · 보상 완료{" "}
                        {completedRewardStages}단계
                        {" · "}
                        {new Date(item.convertedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              아직 내 링크로 합류한 모험가가 없습니다.
            </p>
          )}
        </Card>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <PageShell>
      <SubViewHeader title="게임 홍보" onBack={() => router.back()} />
      {content}
    </PageShell>
  );
}
