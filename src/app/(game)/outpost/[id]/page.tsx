"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";

// /outpost/[id] — 거점 화면. id 로 정적 Outpost 를 역참조.
// deep-link/새로고침으로 직접 들어오면 visit POST 없이 읽기전용 렌더(서버가 다음 이동을 게이트).
export default function OutpostPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { viewerUserId, viewerGuildId, occupations, refreshOccupations } =
    useGameState();

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
      onAction={(a) => {
        if (a.kind === "back") router.push("/map");
        if (a.kind === "claimed") refreshOccupations();
      }}
    />
  );
}
