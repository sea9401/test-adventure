"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { BulletinBoardView } from "@/adventure/BulletinBoardView";

// /plaza/bulletin — 게시판.
export default function BulletinPage() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="게시판" onBack={() => router.push("/plaza")} />
      <BulletinBoardView />
    </main>
  );
}
