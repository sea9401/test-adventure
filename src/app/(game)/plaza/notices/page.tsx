"use client";

import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { BulletinBoardView } from "@/adventure/BulletinBoardView";

// 상단바의 독립 공지사항 메뉴 — 게시판 데이터를 재사용하되 공지 탭에서 시작한다.
export default function NoticesPage() {
  const router = useRouter();
  return (
    <main
      className={`${SURFACE_CARD} mx-auto my-4 w-[calc(100%-2rem)] max-w-[720px] space-y-3 p-4 text-zinc-900 sm:p-6 dark:text-zinc-100`}
    >
      <SubViewHeader title="공지사항" onBack={() => router.push("/")} />
      <BulletinBoardView initialCategory="notice" noticeOnly />
    </main>
  );
}
