"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { ServerFeedView } from "@/adventure/log/ServerFeedView";

// /plaza/feed — 전체 소식(유니크 획득·걸작 제작 등).
export default function FeedPage() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="전체 소식" onBack={() => router.push("/plaza")} />
      <ServerFeedView />
    </main>
  );
}
