import { describe, expect, it } from "vitest";
import {
  economyEvents,
  marketplaceBidsV2,
  marketplaceListingsV2,
  marketplacePriceAlertsV2,
  marketplacePriceDaily,
} from "./schema";

describe("marketplace gold schema", () => {
  it("stores auction prices and bids above the PostgreSQL 32-bit integer limit", () => {
    const columns = [
      marketplaceListingsV2.price,
      marketplaceListingsV2.highestBid,
      marketplaceBidsV2.amount,
      marketplacePriceAlertsV2.targetUnitPrice,
      marketplacePriceDaily.minUnitPrice,
      marketplacePriceDaily.maxUnitPrice,
      economyEvents.goldDelta,
    ];
    for (const column of columns) {
      expect(column.getSQLType()).toBe("bigint");
      expect(column.mapFromDriverValue("2152828938")).toBe(2_152_828_938);
    }
  });
});
