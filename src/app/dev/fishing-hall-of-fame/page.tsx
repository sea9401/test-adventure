import { notFound } from "next/navigation";
import { FishingHallOfFameHarness } from "./FishingHallOfFameHarness";

export default function FishingHallOfFameDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <FishingHallOfFameHarness />;
}
