import { notFound } from "next/navigation";
import { TreasureCollectionHarness } from "./TreasureCollectionHarness";

// staging(IS_STAGING=true) 또는 dev 빌드에서만 노출. 라이브 prod 는 404.
export default function TreasureCollectionDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <TreasureCollectionHarness />;
}
