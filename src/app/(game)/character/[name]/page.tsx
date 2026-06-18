"use client";

import { useParams, useRouter } from "next/navigation";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";

// /character/<닉네임> — 다른 모험가의 공개 정보(내 정보 화면과 같은 항목, 사적 값 제외).
// 정적 형제 경로(info/skills/inventory/...)가 동적 [name] 보다 우선 매칭되므로 충돌 없음.
export default function PlayerCharacterPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  // ⚠️ Next 16 비대칭: client useParams() 와 server page params 는 RAW(URL-인코딩) 값을 준다
  //   (반면 route handler 의 params 는 디코드됨). 한글 등 멀티바이트 이름은 여기서 "%EC%88%98…"
  //   처럼 인코딩된 채 온다 → 디코드해 표시 이름으로 복원해야 V2CharacterScreen 이 API 호출 시
  //   encodeURIComponent 로 정확히 한 번만 인코딩한다. 디코드를 빠뜨리면 이중 인코딩(%25…)→404.
  //   이미 디코드된 값/ literal-% 이름엔 decodeURIComponent 가 throw 할 수 있어 try/catch 로 안전.
  const raw = Array.isArray(params.name) ? params.name[0] : params.name;
  let name = raw ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // malformed 시퀀스/이미 디코드됨 → 원본 그대로 사용.
  }
  return <V2CharacterScreen playerName={name} onBack={() => router.back()} />;
}
