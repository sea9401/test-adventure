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
  rewardGoldPerReferral: number;
  rewardMilestones: Array<{
    frontierDepth: number;
    rewardGold: number;
  }>;
  attributedCount: number;
  totalRewardGold: number;
  recent: Array<{
    name: string;
    rewardGold: number;
    rewardedDepth: number;
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
              내 링크로 합류한 친구가 프론티어를 실제로 진행하면 단계별 홍보
              보상이 우편함으로 도착합니다.
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
          가입만으로는 보상이 지급되지 않습니다 · 1명당 최대{" "}
          {summary?.rewardGoldPerReferral.toLocaleString() ?? "10,000"}골드 · 한
          계정은 한 번만 인정 · 본인 링크는 제외됩니다.
        </p>
      </Card>

      <Card padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">진행도별 보상</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            친구가 각 프론티어에 처음 도달하면 해당 단계 보상이 지급됩니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(summary?.rewardMilestones ?? [
            { frontierDepth: 12, rewardGold: 2_000 },
            { frontierDepth: 24, rewardGold: 3_000 },
            { frontierDepth: 36, rewardGold: 5_000 },
          ]).map((milestone) => (
            <div
              key={milestone.frontierDepth}
              className={`${SURFACE_INSET} px-2 py-3 text-center`}
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                프론티어 {milestone.frontierDepth}
              </p>
              <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">
                +{milestone.rewardGold.toLocaleString()}G
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
            {loading ? "-" : (summary?.totalRewardGold.toLocaleString() ?? "0")}
            <span className="ml-1 text-sm font-medium">G</span>
          </p>
        </Card>
      </div>

      {!loading && summary && summary.recent.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <h2 className="border-b border-zinc-200 px-4 py-3 text-sm font-bold dark:border-zinc-700">
            최근 홍보 실적
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {summary.recent.map((item) => (
              <li
                key={`${item.convertedAt}-${item.name}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <UserPlus size={19} className="text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.rewardedDepth >= 36
                      ? "전체 단계 보상 지급"
                      : item.rewardedDepth > 0
                        ? `프론티어 ${item.rewardedDepth} 보상 지급`
                      : "가입 완료 · 진행 보상 대기"}
                    {" · "}
                    {new Date(item.convertedAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                {item.rewardGold > 0 ? (
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    +{item.rewardGold.toLocaleString()}G
                  </span>
                ) : (
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    대기 중
                  </span>
                )}
              </li>
            ))}
          </ul>
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
