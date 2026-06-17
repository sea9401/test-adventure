"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { V2JobCodexView } from "@/adventure/v2/V2JobCodexView";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";

// /character/job-codex — 직업 도감(읽기 전용 수집 대시보드, A 메타 PR-1).
//   데이터는 /api/v2/me/job-codex. V2JobCodexView 는 순수(codex prop) — dev 하네스가 mock 재사용.
export default function JobCodexPage() {
  const router = useRouter();
  const [codex, setCodex] = useState<JobCodex | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/job-codex")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; codex?: JobCodex } | null) => {
        if (alive && j?.ok && j.codex) setCodex(j.codex);
      })
      .catch(() => null) // 네트워크 실패 → 무시(아래 finally 가 loading 해제, 안내문 표시)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const back = () => router.push("/character");

  if (codex) return <V2JobCodexView codex={codex} onBack={back} />;
  return (
    <main className="mx-auto max-w-[720px] p-6 text-sm text-zinc-500 dark:text-zinc-400">
      {loading ? "직업 도감을 불러오는 중…" : "직업 도감을 불러오지 못했어요."}
    </main>
  );
}
