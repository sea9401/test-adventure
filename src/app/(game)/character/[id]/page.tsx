"use client";

import { useParams, useRouter } from "next/navigation";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";

// /character/<userId> — 다른 모험가의 공개 정보(내 정보 화면과 같은 항목, 사적 값 제외).
// 정적 형제 경로(info/skills/inventory/...)가 동적 [id] 보다 우선 매칭되므로 충돌 없음.
export default function PlayerCharacterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <V2CharacterScreen playerId={id} onBack={() => router.back()} />;
}
