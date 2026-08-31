import { notFound } from "next/navigation";
import { HousingRouteView } from "@/adventure/v2/HousingRouteView";
import { isLifeHousingEnabled } from "@/adventure/v2/lifeCrafting";

export default async function PlayerHousingPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  if (!isLifeHousingEnabled()) notFound();
  const { name: rawName } = await params;
  let name = rawName ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // Next 16 의 raw 동적 세그먼트가 이미 디코드됐거나 잘못된 경우 원문을 사용한다.
  }
  return <HousingRouteView playerName={name} />;
}
