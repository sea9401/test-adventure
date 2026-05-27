import { notFound } from "next/navigation";
import { V2GamePageContents } from "./V2GamePageContents";

// staging(IS_STAGING=true) 또는 dev 빌드에서만. 라이브 prod 는 404.
// notFound 가드는 server-only env (IS_STAGING) 를 봐야 해 이 page 는 server component
// 유지. SaveProvider/STARTER_SAVES 는 V2GamePageContents (client wrapper) 로 분리해
// server build graph 에 client hook (useRemotePatch) 끌려오는 turbopack 에러 회피
// (2026-05-28 staging deploy 사고).
export default function V2GameFlowPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <V2GamePageContents />;
}
