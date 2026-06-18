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
  // ⚠️ Next 16: server page 의 params.name 은 RAW(URL-인코딩) 세그먼트다 (route handler 는 디코드,
  //   page/useParams 는 raw — 비대칭). 그대로 통과시킨다. encodeURIComponent 로 재인코딩하면 redirect
  //   가 Location 헤더용으로 한 번 더 인코딩해 이중(%25…)이 되어 /character 가 이름을 못 찾는다.
  redirect(`/character/${name}`);
}
