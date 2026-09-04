import { marketplaceFeatureRetired } from "@/lib/server/marketplaceFeatureRetired";

export function POST(_req: Request) {
  return marketplaceFeatureRetired();
}
