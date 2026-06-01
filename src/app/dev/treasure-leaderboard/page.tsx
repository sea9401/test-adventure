import { notFound } from "next/navigation";
import { TreasureLeaderboardView } from "@/adventure/v2/TreasureLeaderboardView";

// staging(IS_STAGING=true) 또는 dev 빌드에서만 노출. 라이브 prod 는 404.
// 주간 발굴가치 리더보드 QA 용 mock(서버 없이). 함수 prop(onBack) 없이 데이터만 주입.
export default function TreasureLeaderboardDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  const mock = {
    seasonId: "2026-W23",
    // 정적 mock(렌더 순수성) — endsInLabel 은 현재 시각과의 차이를 클라에서 계산.
    endsAt: "2030-01-07T15:00:00.000Z",
    myCoins: 240,
    entries: [
      { rank: 1, name: "발굴왕", value: 52340, isMe: false },
      { rank: 2, name: "나", value: 38120, isMe: true },
      { rank: 3, name: "땅파기 장인", value: 21500, isMe: false },
      { rank: 4, name: "흙먼지", value: 9800, isMe: false },
      { rank: 5, name: "초보 발굴꾼", value: 3200, isMe: false },
    ],
  };
  return <TreasureLeaderboardView data={mock} loading={false} />;
}
