"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBanner } from "@/components/ui/StatusBanner";
import {
  V2_JOB_CATALOG,
  isDirectNextJob,
  isLifestyleMasteryJobId,
} from "@/adventure/data/v2/v2JobCatalog";

export type ProductionAdvanceJob = {
  id: string;
  name: string;
  condition: string;
  unlocked: boolean;
};

export type ProductionAdvanceState = {
  jobsV2?: {
    currentJobId?: string;
    jobs?: ProductionAdvanceJob[];
  } | null;
};

export function productionAdvanceCandidates(
  state: ProductionAdvanceState | null,
): ProductionAdvanceJob[] {
  const currentJobId = state?.jobsV2?.currentJobId;
  if (!currentJobId || !isLifestyleMasteryJobId(currentJobId)) return [];

  return (state.jobsV2?.jobs ?? []).filter((entry) => {
    const definition = V2_JOB_CATALOG[entry.id];
    return (
      entry.unlocked === true &&
      definition != null &&
      isLifestyleMasteryJobId(entry.id) &&
      isDirectNextJob(currentJobId, definition)
    );
  });
}

export function ProductionJobAdvanceNotice({
  refreshKey,
}: {
  /** 생활 레벨·성공 횟수 등 전직 조건에 영향을 주는 값. 바뀌면 서버 조건을 다시 확인한다. */
  refreshKey: string | number;
}) {
  const [jobs, setJobs] = useState<ProductionAdvanceJob[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v2/me/state", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ProductionAdvanceState;
      })
      .then((state) => {
        if (!controller.signal.aborted) {
          setJobs(productionAdvanceCandidates(state));
        }
      })
      .catch(() => {
        // 생산 콘텐츠 본 기능은 유지하고 안내만 조용히 생략한다.
      });
    return () => controller.abort();
  }, [refreshKey]);

  if (jobs.length === 0) return null;

  return (
    <StatusBanner
      tone="success"
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 py-2"
    >
      <span className="min-w-0">
        <strong>다음 생산직 전직 가능</strong>
        <span className="ml-1">· {jobs.map((job) => job.name).join(", ")}</span>
        <span className="mt-0.5 block text-[11px] font-normal">
          캐릭터 레벨과 관계없이 바로 전직할 수 있습니다.
        </span>
      </span>
      <Link
        href="/character/shrine"
        className="shrink-0 rounded-md border border-emerald-600 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
      >
        성장의 신전
      </Link>
    </StatusBanner>
  );
}
