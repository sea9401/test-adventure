import type { ReactNode } from "react";
import Link from "next/link";
import { SURFACE_CARD } from "@/components/ui/surfaces";

const POLICY_LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/operations", label: "운영정책" },
  { href: "/account-deletion", label: "계정 삭제" },
  { href: "/licenses", label: "오픈소스 고지" },
] as const;

export function PolicyDocument({
  title,
  description,
  effectiveDate,
  dateLabel = "시행일",
  children,
}: {
  title: string;
  description: string;
  effectiveDate: string;
  dateLabel?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-amber-700 transition-colors hover:text-amber-600 dark:text-amber-300 dark:hover:text-amber-200"
          >
            ← 무슨무슨게임
          </Link>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            {dateLabel}: {effectiveDate}
          </p>
          <nav
            aria-label="서비스 정책"
            className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-zinc-200 py-3 text-sm dark:border-zinc-800"
          >
            {POLICY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-zinc-600 transition-colors hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-300"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <article
          className={`${SURFACE_CARD} space-y-9 p-5 text-sm leading-7 sm:p-8 [&_a]:text-amber-700 [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-amber-300 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:text-zinc-700 dark:[&_p]:text-zinc-300 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:p-3 dark:[&_td]:border-zinc-700 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:p-3 [&_th]:text-left dark:[&_th]:border-zinc-700 dark:[&_th]:bg-zinc-800`}
        >
          {children}
        </article>

        <footer className="mt-8 flex flex-col gap-3 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 무슨무슨게임</span>
          <a
            href="mailto:sea9401@gmail.com"
            className="transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            정책 문의: sea9401@gmail.com
          </a>
        </footer>
      </div>
    </main>
  );
}
