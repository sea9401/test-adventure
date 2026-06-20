import { notFound } from "next/navigation";
import { FishingChallengesHarness } from "./FishingChallengesHarness";

export default function FishingChallengesDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <FishingChallengesHarness />;
}
