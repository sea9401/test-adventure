import { redirect } from "next/navigation";

// 다른 모험가 프로필 — 이제 v2 네이티브 /character/<닉네임> 으로 일원화. 기존 진입점(랭킹·채팅·
// 접속자 이름 클릭)이 /profile/<name> 으로 보내므로 여기서 리다이렉트해 v2 정보 화면으로 모은다.
// (옛 V1 PlayerProfileView 는 명성·V1 장비라 v2 빌드 미반영 → 폐기.)
export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // params.name 은 디코드된 값 — /character 세그먼트로 재인코딩.
  redirect(`/character/${encodeURIComponent(name)}`);
}
