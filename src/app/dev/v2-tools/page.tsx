import { notFound } from "next/navigation";
import { V2DevToolsContents } from "./V2DevToolsContents";

// ⚠️ DEV 전용 지급 도구 — staging(IS_STAGING=true) 또는 dev 빌드에서만. 라이브 prod 는 404.
//    지울 땐 이 폴더(src/app/dev/v2-tools)와 src/app/api/v2/dev/grant 만 통째로 지우면 됨.
//
// 패턴: server-only env(IS_STAGING) 게이트는 server component 에 두고, 실제 UI(client)
// 는 별도 파일(V2DevToolsContents)로 분리.
export default function V2DevToolsPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <V2DevToolsContents />;
}
