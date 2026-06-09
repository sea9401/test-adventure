"use client";

import { useRouter } from "next/navigation";
import { V2QuestView } from "@/adventure/v2/V2QuestView";

// /quests — 가이드 퀘스트(성장 안내). 홈 배너 → 여기로.
export default function QuestsPage() {
  const router = useRouter();
  return <V2QuestView onBack={() => router.push("/")} />;
}
