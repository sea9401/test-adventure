import { notFound } from "next/navigation";
import { HousingRouteView } from "@/adventure/v2/HousingRouteView";
import { isLifeHousingEnabled } from "@/adventure/v2/lifeCrafting";

export default function HousingPage() {
  if (!isLifeHousingEnabled()) notFound();
  return <HousingRouteView />;
}
