"use client";

import { useRouter } from "next/navigation";
import { V2QuestView } from "@/adventure/v2/V2QuestView";

// /quests — 가이드 퀘스트(성장 안내). 모험 홈 배너·캐릭터 메뉴 등 여러 탭에서 진입하므로
//   뒤로 = history back(진입했던 탭으로 복귀). 알림 페이지와 동일 패턴.
export default function QuestsPage() {
  const router = useRouter();
  return <V2QuestView onBack={() => router.back()} />;
}
