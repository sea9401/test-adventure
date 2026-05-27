import { notFound } from "next/navigation";
import { SaveProvider } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { V2GameFlow } from "./V2GameFlow";

// staging(IS_STAGING=true) 또는 dev 빌드에서만. 라이브 prod 는 404.
// SaveProvider 로 감싼다 — V2DungeonFloorView 의 useStoryFlags 등 SaveProvider
// 컨텍스트가 필요한 hook 이 mount 되기 위함. 이전엔 V2GameFlow 트리가 fetch 기반
// 으로만 작동해 SaveProvider 없이도 OK 였으나, PR #140 (첫 사냥/드랍/레벨업 후크)
// 가 storyFlags 도입으로 컨텍스트 의존성 새로 — 그 PR 직후 "전투 입장 시 global-
// error" 사고 발생.
export default function V2GameFlowPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <V2GameFlow />
    </SaveProvider>
  );
}
