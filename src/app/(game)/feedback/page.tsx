import Link from "next/link";
import { ArrowLeft, ChatCenteredText } from "@phosphor-icons/react/dist/ssr";
import { FeedbackForm } from "@/components/FeedbackForm";

export const metadata = {
  title: "건의사항 — 무슨무슨게임",
};

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChatCenteredText
            size={20}
            weight="duotone"
            className="text-sky-600 dark:text-sky-400"
          />
          <h1 className="text-base font-semibold">건의사항</h1>
        </div>
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft size={16} weight="bold" />
          돌아가기
        </Link>
      </div>

      <FeedbackForm />
    </main>
  );
}
