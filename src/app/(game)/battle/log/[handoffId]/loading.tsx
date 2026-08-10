import { Card } from "@/components/ui/Card";

export default function BattleLogHandoffLoading() {
  return (
    <main className="mx-auto max-w-[880px] px-4 py-5 sm:p-6">
      <Card
        padding="md"
        className="text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        전투 로그 페이지를 불러오는 중…
      </Card>
    </main>
  );
}
