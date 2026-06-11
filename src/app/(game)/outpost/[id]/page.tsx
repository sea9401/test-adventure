"use client";

import {
  notFound,
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";

// /outpost/[id] — 거점 화면. id 로 정적 Outpost 를 역참조.
// deep-link/새로고침으로 직접 들어오면 visit POST 없이 읽기전용 렌더(서버가 다음 이동을 게이트).
export default function OutpostPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // 진입 컨텍스트별 뒤로가기 — 전쟁 허브/모험 홈에서 왔으면 그쪽으로, 기본(길드
  // 관리·딥링크)은 길드 탭. 마을 지도 진입은 폐지(지도=항법 전용).
  const from = useSearchParams().get("from");
  const backHref =
    from === "war" ? "/battle/war" : from === "adventure" ? "/" : "/guild";
  const {
    viewerUserId,
    viewerGuildId,
    occupations,
    treasuries,
    refreshOccupations,
  } = useGameState();

  const outpost = OUTPOST_BY_ID.get(params.id);
  if (!outpost) notFound();

  return (
    <OutpostView
      outpost={outpost}
      viewerUserId={viewerUserId}
      viewerGuildId={viewerGuildId}
      occupation={
        occupations.find((o) => o.outpostId === outpost.id) ?? null
      }
      treasuryGold={
        treasuries.find((t) => t.outpostId === outpost.id)?.gold ?? 0
      }
      onAction={(a) => {
        if (a.kind === "back") router.push(backHref);
        if (a.kind === "claimed") refreshOccupations();
      }}
    />
  );
}
