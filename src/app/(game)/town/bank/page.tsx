"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { BankPanel } from "@/adventure/v2/BankPanel";

// /town/bank — 마을 탭 은행. 골드 입금/출금(토벌 압류로부터 안전한 저축).
// 안전 위치 게이트는 서버(/api/v2/me/bank)가 unsafe_location 으로 최종 판정.
export default function TownBankPage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="은행" onBack={() => router.push("/town")} />
      <BankPanel />
      <p className="px-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        은행에 맡긴 골드는 패배 세금으로 빼앗기지 않습니다. 들고 다니는 골드만
        위험에 노출됩니다. 다른 길드가 점령한 거점에서는 입출금할 수 없습니다.
      </p>
    </main>
  );
}
