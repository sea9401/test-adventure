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
import {
  isTileOutpostId,
  parseTileOutpostId,
  synthTileOutpost,
} from "@/adventure/data/v2/tileWarfare";
import { isTileSettlementTier } from "@/adventure/data/v2/tileConfig";
import { V2_TILE_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// /outpost/[id] — 거점 화면. id 로 정적 Outpost 를 역참조.
// deep-link/새로고침으로 직접 들어오면 visit POST 없이 읽기전용 렌더(서버가 다음 이동을 게이트).
export default function OutpostPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // ⚠️ Next16 param decode 비대칭(#630) — server page useParams 는 RAW(인코딩) 반환.
  //   tile id 의 ':'·','(%3A·%2C) 를 디코드해야 isTileOutpostId/parse 동작(딥링크 404 함정).
  //   카탈로그 id(영문·_)는 no-op. 재encode 금지(이중%25→404).
  const id = decodeURIComponent(params.id);
  // 진입 컨텍스트별 뒤로가기 — 모험 홈에서 왔으면 홈, 기본(길드 관리·딥링크)은 길드 탭.
  // 마을 지도 진입은 폐지(지도=항법 전용).
  const from = useSearchParams().get("from");
  const backHref = from === "adventure" ? "/" : "/guild";
  const {
    viewerUserId,
    viewerGuildId,
    occupations,
    treasuries,
    tileSettlements,
    refreshOccupations,
  } = useGameState();

  // 카탈로그 거점 우선. 타일 전쟁 — tile id 면 클라 tileSettlements 의 tier 로 메타 합성(서버 권위는
  //   각 전쟁 라우트가 별도 검증). flag off → tile id 는 미합성 → notFound(현행).
  let outpost = OUTPOST_BY_ID.get(id);
  if (!outpost && V2_TILE_WARFARE && isTileOutpostId(id)) {
    const pos = parseTileOutpostId(id);
    const ts = pos
      ? tileSettlements.find((s) => s.col === pos.col && s.row === pos.row)
      : undefined;
    if (pos && ts && isTileSettlementTier(ts.tier)) {
      outpost = synthTileOutpost(pos.col, pos.row, ts.tier, ts.name);
    }
  }
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
        if (a.kind === "claimed" || a.kind === "policy-changed") {
          refreshOccupations();
        }
      }}
    />
  );
}
