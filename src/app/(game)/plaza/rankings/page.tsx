"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { RankingsView } from "@/adventure/rankings/RankingsView";

// /plaza/rankings — 랭킹.
export default function RankingsPage() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="랭킹" onBack={() => router.push("/plaza")} />
      <RankingsView />
    </main>
  );
}
