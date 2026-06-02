import { V2GamePageContents } from "@/adventure/v2/V2GamePageContents";

// 운영 루트(/) = v2 게임. 구 v1 게임은 컷오버로 박제됐다 (git 태그/히스토리에 보존).
// server component 로 두고 client boundary 는 V2GamePageContents 가 명시한다 —
// SaveProvider/STARTER_SAVES 의 client hook chain (useCharacterState → useRemotePatch)
// 이 server build graph 로 끌려와 Turbopack 컴파일 에러 나는 것 회피 (2026-05-28 사고).
export default function Page() {
  return <V2GamePageContents />;
}
