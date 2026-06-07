"use client";

import { useParams, useRouter } from "next/navigation";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";

// /character/<닉네임> — 다른 모험가의 공개 정보(내 정보 화면과 같은 항목, 사적 값 제외).
// 정적 형제 경로(info/skills/inventory/...)가 동적 [name] 보다 우선 매칭되므로 충돌 없음.
export default function PlayerCharacterPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  // useParams 는 이미 디코드된 값을 준다 — 추가 decodeURIComponent 금지('%' 포함 이름 URIError).
  const raw = Array.isArray(params.name) ? params.name[0] : params.name;
  const name = raw ?? "";
  return <V2CharacterScreen playerName={name} onBack={() => router.back()} />;
}
