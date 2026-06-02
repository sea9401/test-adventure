import { redirect } from "next/navigation";

// v1 캐릭터 생성 라우트 폐기 (v2 승격). v2 는 루트(/)에서 온보딩을 처리하고, 신규 유저는
// OAuth 후 callbackUrl "/" 로 루트에 떨어진다 → /create 는 더 이상 흐름에 없는 고아.
// 직접 진입 시 v1 캐릭터 생성기가 공유 savesKv 에 v1 포맷을 써 v2 캐릭터를 덮을 위험이
// 있어, 루트로 리다이렉트해 진입 자체를 막는다.
export default function CreatePage() {
  redirect("/");
}
