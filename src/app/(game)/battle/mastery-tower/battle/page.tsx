import { V2MasteryTowerBattleView } from "@/adventure/v2/V2MasteryTowerBattleView";

// /battle/mastery-tower/battle — 숙련의 탑 전투 진행 전용 화면.
export default async function MasteryTowerBattlePage({
  searchParams,
}: {
  searchParams: Promise<{ startFloor?: string | string[] }>;
}) {
  const rawStartFloor = (await searchParams).startFloor;
  const startFloor =
    typeof rawStartFloor === "string" ? Number(rawStartFloor) : undefined;
  return (
    <V2MasteryTowerBattleView
      initialStartFloor={Number.isInteger(startFloor) ? startFloor : undefined}
    />
  );
}
