import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recallLegacyCooking } from "./legacyCookingRecall.mjs";

const databaseUrl = process.env.COOKING_RECALL_MIGRATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("legacy cooking recall migration", () => {
  const schema = `cooking_recall_${randomUUID().replaceAll("-", "")}`;
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE saves_kv (
        user_id text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );
      CREATE TABLE ops_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_by_email text,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE marketplace_listings_v2 (
        id serial PRIMARY KEY,
        seller_id text NOT NULL,
        kind text NOT NULL,
        item_id text NOT NULL,
        quantity integer NOT NULL,
        status text NOT NULL,
        highest_bid integer,
        highest_bidder_id text,
        bid_resolved_at timestamp,
        closed_at timestamp
      );
      CREATE TABLE marketplace_inbox (
        id serial PRIMARY KEY,
        user_id text NOT NULL,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        message text,
        listing_id integer,
        created_at timestamp NOT NULL DEFAULT now(),
        read_at timestamp,
        claimed_at timestamp
      );
      CREATE TABLE marketplace_buy_orders_v2 (
        id serial PRIMARY KEY,
        buyer_id text NOT NULL,
        kind text NOT NULL,
        item_id text NOT NULL,
        item_name text NOT NULL,
        gold_escrow integer NOT NULL,
        status text NOT NULL,
        closed_at timestamp
      )
    `);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });

  it("recalls inventory, listing, and inbox foods exactly once", async () => {
    await client.query(
      `INSERT INTO saves_kv (user_id, key, value) VALUES
       ('u1', 'inventory.v2', $1::jsonb),
       ('u1', 'farm.v2', $2::jsonb),
       ('u1', 'fishing-stock.v1', $3::jsonb),
       ('u1', 'character.v2', $4::jsonb),
       ('u1', 'cooking.v1', $5::jsonb)`,
      [
        JSON.stringify({
          cookingFoods: {
            "food:rustic_bread:normal:base:standard": 1,
            "food2:rustic_bread:normal:o0:s0": 2,
          },
        }),
        JSON.stringify({ version: 1, inventory: { wheat: 3 } }),
        JSON.stringify({ version: 1, items: { catch_common: 1 } }),
        JSON.stringify({
          gold: 100,
          activeFoodBuff: {
            recipeId: "rustic_bread",
            statPct: { vit: 5 },
            expiresAt: Date.now() + 60_000,
          },
        }),
        JSON.stringify({
          xp: 12_345,
          levelCurveVersion: 2,
          discoveredRecipeIds: Array.from({ length: 45 }, (_, index) => `old_${index}`),
        }),
      ],
    );
    await client.query(
      `INSERT INTO marketplace_listings_v2
         (seller_id, kind, item_id, quantity, status, highest_bid, highest_bidder_id)
       VALUES ('u1', 'consumable', 'food:rustic_bread:masterpiece:rare:extended', 2, 'active', 1000, 'u2')`,
    );
    await client.query(
      `INSERT INTO marketplace_inbox (user_id, kind, payload)
       VALUES ('u1', 'purchase_item', $1::jsonb)`,
      [
        JSON.stringify({
          item_kind: "cooking",
          item_id: "food:fish_skewer:normal:base:standard",
          quantity: 3,
        }),
      ],
    );
    await client.query(
      `INSERT INTO marketplace_buy_orders_v2
         (buyer_id, kind, item_id, item_name, gold_escrow, status)
       VALUES ('u1', 'consumable', 'food:herb_tea:normal:base:standard', '허브차', 500, 'active')`,
    );

    const first = await recallLegacyCooking(client);
    expect(first).toEqual({ skipped: false, recalledFoods: 6, users: 1 });

    const saves = await client.query<{
      key: string;
      value: {
        cookingFoods?: Record<string, number>;
        inventory?: Record<string, number>;
        items?: Record<string, number>;
        activeFoodBuff?: unknown;
        xp?: number;
        discoveredRecipeIds?: string[];
        legacy?: {
          recallVersion?: number;
          tokens?: number;
          milestones?: number[];
          recalledFoods?: number;
        };
      };
    }>(
      "SELECT key, value FROM saves_kv WHERE user_id = 'u1' ORDER BY key",
    );
    const byKey = new Map(saves.rows.map((row) => [row.key, row.value]));
    expect(byKey.get("inventory.v2")?.cookingFoods).toEqual({
      "food2:rustic_bread:normal:o0:s0": 2,
    });
    expect(byKey.get("farm.v2")?.inventory).toMatchObject({
      wheat: 25,
      golden_wheat: 1,
      herb: 4,
    });
    expect(byKey.get("fishing-stock.v1")?.items?.catch_common).toBe(8);
    expect(byKey.get("character.v2")).not.toHaveProperty("activeFoodBuff");
    expect(byKey.get("cooking.v2")).toMatchObject({
      xp: 12_345,
      discoveredRecipeIds: expect.arrayContaining(["rustic_bread", "country_egg_bread"]),
      legacy: { recallVersion: 1, tokens: 45, milestones: [10, 25, 45], recalledFoods: 6 },
    });

    expect(
      (await client.query("SELECT status, highest_bid FROM marketplace_listings_v2")).rows,
    ).toEqual([{ status: "cancelled", highest_bid: null }]);
    expect(
      (await client.query("SELECT status, gold_escrow FROM marketplace_buy_orders_v2")).rows,
    ).toEqual([{ status: "cancelled", gold_escrow: 0 }]);
    const inboxKinds = (
      await client.query("SELECT kind, claimed_at FROM marketplace_inbox ORDER BY id")
    ).rows;
    expect(inboxKinds.map((row) => row.kind)).toEqual([
      "purchase_item",
      "bid_refund",
      "buy_order_refund",
    ]);
    expect(inboxKinds[0].claimed_at).not.toBeNull();

    const snapshot = await client.query(
      "SELECT key, value, version FROM saves_kv ORDER BY user_id, key",
    );
    expect(await recallLegacyCooking(client)).toEqual({
      skipped: true,
      recalledFoods: 0,
      users: 0,
    });
    expect(
      await client.query("SELECT key, value, version FROM saves_kv ORDER BY user_id, key"),
    ).toMatchObject({ rows: snapshot.rows });
  });
});
