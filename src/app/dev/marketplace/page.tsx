import { notFound } from "next/navigation";
import { MarketplaceHarness } from "./MarketplaceHarness";

export default function MarketplaceDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <MarketplaceHarness />;
}
