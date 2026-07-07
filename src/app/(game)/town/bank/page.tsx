"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { BankPanel } from "@/adventure/v2/BankPanel";

// /town/bank — 마을 탭 은행. 골드 입금/출금(패배 페널티 완충용 저축).
export default function TownBankPage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="은행" onBack={() => router.push("/town")} />
      <BankPanel />
      <p className="px-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        은행에 맡긴 골드는 사냥 패배 페널티로 사라지지 않습니다.
      </p>
    </main>
  );
}
