import legacyRecipeCosts from "../lib/server/cooking/legacy-recipes.json" with { type: "json" };

const MARKER_KEY = "migration.cooking_legacy_recall_v1";
const BASIC_RECIPE_IDS = [
  "rustic_bread",
  "herb_tea",
  "grilled_corn",
  "fish_skewer",
  "herb_flatbread",
  "country_egg_bread",
];

function nonNegativeInt(raw) {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

function parsedLegacyFoodId(raw) {
  if (typeof raw !== "string") return null;
  const [prefix, recipeId, quality, rare, duration, extra] = raw.split(":");
  const recipe = legacyRecipeCosts[recipeId];
  if (
    prefix !== "food" ||
    extra !== undefined ||
    !recipe ||
    !["normal", "careful", "masterpiece"].includes(quality) ||
    !["base", "rare"].includes(rare) ||
    !["standard", "extended"].includes(duration) ||
    (rare === "rare" && !recipe.rare)
  ) {
    return null;
  }
  return { recipeId, usedRare: rare === "rare" };
}

function addNested(target, userId, kind, itemId, count) {
  if (!target.has(userId)) {
    target.set(userId, { farm: new Map(), fishing: new Map(), recalledFoods: 0 });
  }
  const user = target.get(userId);
  const bucket = user[kind];
  bucket.set(itemId, (bucket.get(itemId) ?? 0) + count);
}

function addFood(target, userId, foodId, rawCount) {
  const food = parsedLegacyFoodId(foodId);
  const count = nonNegativeInt(rawCount);
  if (!food || count < 1) return;
  const recipe = legacyRecipeCosts[food.recipeId];
  if (!target.has(userId)) {
    target.set(userId, { farm: new Map(), fishing: new Map(), recalledFoods: 0 });
  }
  target.get(userId).recalledFoods += count;
  for (const [itemId, perDish] of Object.entries(recipe.farm ?? {})) {
    addNested(target, userId, "farm", itemId, nonNegativeInt(perDish) * count);
  }
  for (const [itemId, perDish] of Object.entries(recipe.fishing ?? {})) {
    addNested(target, userId, "fishing", itemId, nonNegativeInt(perDish) * count);
  }
  if (food.usedRare && recipe.rare) {
    addNested(target, userId, "farm", recipe.rare, count);
  }
}

function finalizedRefunds(totals) {
  return new Map(
    [...totals].map(([userId, value]) => [
      userId,
      {
        farm: Object.fromEntries(
          [...value.farm].flatMap(([itemId, count]) => {
            const refund = Math.floor(count * 0.5);
            return refund > 0 ? [[itemId, refund]] : [];
          }),
        ),
        fishing: Object.fromEntries(
          [...value.fishing].flatMap(([itemId, count]) => {
            const refund = Math.floor(count * 0.5);
            return refund > 0 ? [[itemId, refund]] : [];
          }),
        ),
        recalledFoods: value.recalledFoods,
      },
    ]),
  );
}

async function readSaveForUpdate(client, userId, key) {
  const result = await client.query(
    "SELECT value, version FROM saves_kv WHERE user_id = $1 AND key = $2 FOR UPDATE",
    [userId, key],
  );
  return result.rows[0] ?? null;
}

async function writeSave(client, userId, key, value, current) {
  if (current) {
    await client.query(
      "UPDATE saves_kv SET value = $3::jsonb, version = version + 1, updated_at = now() WHERE user_id = $1 AND key = $2",
      [userId, key, JSON.stringify(value)],
    );
    return;
  }
  await client.query(
    "INSERT INTO saves_kv (user_id, key, value, version, updated_at) VALUES ($1, $2, $3::jsonb, 1, now()) ON CONFLICT (user_id, key) DO NOTHING",
    [userId, key, JSON.stringify(value)],
  );
}

function addRefundItems(source, refunds) {
  const next = { ...(source ?? {}) };
  for (const [itemId, count] of Object.entries(refunds)) {
    next[itemId] = nonNegativeInt(next[itemId]) + count;
  }
  return next;
}

function legacyMilestones(discoveryCount) {
  return [10, 25, 45].filter((goal) => discoveryCount >= goal);
}

export async function recallLegacyCooking(client) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [MARKER_KEY]);
    const marker = await client.query(
      "SELECT value FROM ops_settings WHERE key = $1 FOR UPDATE",
      [MARKER_KEY],
    );
    if (marker.rowCount > 0) {
      await client.query("COMMIT");
      return { skipped: true, recalledFoods: 0, users: 0 };
    }

    const inventoryRows = await client.query(
      "SELECT user_id, value, version FROM saves_kv WHERE key = 'inventory.v2' FOR UPDATE",
    );
    const listingRows = await client.query(
      "SELECT id, seller_id, item_id, quantity, highest_bid, highest_bidder_id FROM marketplace_listings_v2 WHERE status = 'active' AND kind = 'consumable' AND item_id LIKE 'food:%' FOR UPDATE",
    );
    const inboxRows = await client.query(
      "SELECT id, user_id, payload FROM marketplace_inbox WHERE claimed_at IS NULL AND payload->>'item_kind' = 'cooking' AND payload->>'item_id' LIKE 'food:%' FOR UPDATE",
    );
    const buyOrderRows = await client.query(
      "SELECT id, buyer_id, item_name, gold_escrow FROM marketplace_buy_orders_v2 WHERE status = 'active' AND kind = 'consumable' AND item_id LIKE 'food:%' FOR UPDATE",
    );
    const legacyStateRows = await client.query(
      "SELECT user_id, value FROM saves_kv WHERE key = 'cooking.v1' FOR UPDATE",
    );

    const totals = new Map();
    for (const row of inventoryRows.rows) {
      for (const [foodId, count] of Object.entries(row.value?.cookingFoods ?? {})) {
        addFood(totals, row.user_id, foodId, count);
      }
    }
    for (const row of listingRows.rows) {
      addFood(totals, row.seller_id, row.item_id, row.quantity);
    }
    for (const row of inboxRows.rows) {
      addFood(totals, row.user_id, row.payload?.item_id, row.payload?.quantity);
    }
    const refunds = finalizedRefunds(totals);

    for (const [userId, refund] of refunds) {
      const farmSave = await readSaveForUpdate(client, userId, "farm.v2");
      const farmValue = farmSave?.value ?? { version: 1, inventory: {} };
      await writeSave(
        client,
        userId,
        "farm.v2",
        { ...farmValue, inventory: addRefundItems(farmValue.inventory, refund.farm) },
        farmSave,
      );
      const fishingSave = await readSaveForUpdate(client, userId, "fishing-stock.v1");
      const fishingValue = fishingSave?.value ?? { version: 1, items: {} };
      await writeSave(
        client,
        userId,
        "fishing-stock.v1",
        { ...fishingValue, items: addRefundItems(fishingValue.items, refund.fishing) },
        fishingSave,
      );
    }

    for (const row of inventoryRows.rows) {
      const cookingFoods = Object.fromEntries(
        Object.entries(row.value?.cookingFoods ?? {}).filter(
          ([foodId]) => !parsedLegacyFoodId(foodId),
        ),
      );
      if (
        Object.keys(cookingFoods).length !==
        Object.keys(row.value?.cookingFoods ?? {}).length
      ) {
        await writeSave(
          client,
          row.user_id,
          "inventory.v2",
          { ...row.value, cookingFoods },
          row,
        );
      }
    }

    const oldStateByUser = new Map(
      legacyStateRows.rows.map((row) => [row.user_id, row.value ?? {}]),
    );
    const migratedUsers = new Set([...oldStateByUser.keys(), ...refunds.keys()]);
    for (const userId of migratedUsers) {
      const old = oldStateByUser.get(userId) ?? {};
      const discoveryCount = Array.isArray(old.discoveredRecipeIds)
        ? new Set(old.discoveredRecipeIds).size
        : 0;
      await client.query(
        `INSERT INTO saves_kv (user_id, key, value, version, updated_at)
         VALUES ($1, 'cooking.v2', $2::jsonb, 1, now())
         ON CONFLICT (user_id, key) DO NOTHING`,
        [
          userId,
          JSON.stringify({
            version: 2,
            levelCurveVersion: nonNegativeInt(old.levelCurveVersion) || 1,
            xp: nonNegativeInt(old.xp),
            discoveredRecipeIds: BASIC_RECIPE_IDS,
            favoriteRecipeIds: [],
            researchScore: 0,
            specialty: null,
            kitchenItems: {},
            legacy: {
              recallVersion: 1,
              tokens: Math.min(100, discoveryCount),
              milestones: legacyMilestones(discoveryCount),
              recalledFoods: refunds.get(userId)?.recalledFoods ?? 0,
            },
          }),
        ],
      );
    }

    await client.query(
      `UPDATE saves_kv
       SET value = value - 'activeFoodBuff', version = version + 1, updated_at = now()
       WHERE key = 'character.v2'
         AND value ? 'activeFoodBuff'
         AND NOT (value->'activeFoodBuff' ? 'effect')`,
    );

    for (const row of listingRows.rows) {
      if (row.highest_bidder_id && nonNegativeInt(row.highest_bid) > 0) {
        await client.query(
          `INSERT INTO marketplace_inbox
             (user_id, kind, payload, message, listing_id, created_at)
           VALUES ($1, 'bid_refund', $2::jsonb, $3, $4, now())`,
          [
            row.highest_bidder_id,
            JSON.stringify({ kind: "bid_refund", gold: nonNegativeInt(row.highest_bid) }),
            "요리 개편으로 취소된 입찰금이 반환되었습니다.",
            row.id,
          ],
        );
      }
    }
    await client.query(
      `UPDATE marketplace_listings_v2
       SET status = 'cancelled', closed_at = now(), highest_bid = NULL,
           highest_bidder_id = NULL, bid_resolved_at = now()
       WHERE status = 'active' AND kind = 'consumable' AND item_id LIKE 'food:%'`,
    );
    await client.query(
      `UPDATE marketplace_inbox
       SET claimed_at = now(), read_at = COALESCE(read_at, now()),
           message = COALESCE(message, '') || ' (요리 개편 재료 환급 완료)'
       WHERE claimed_at IS NULL AND payload->>'item_kind' = 'cooking'
         AND payload->>'item_id' LIKE 'food:%'`,
    );
    for (const row of buyOrderRows.rows) {
      const gold = nonNegativeInt(row.gold_escrow);
      if (gold > 0) {
        await client.query(
          `INSERT INTO marketplace_inbox
             (user_id, kind, payload, message, created_at)
           VALUES ($1, 'buy_order_refund', $2::jsonb, $3, now())`,
          [
            row.buyer_id,
            JSON.stringify({ kind: "buy_order_refund", gold }),
            `${row.item_name} 구매 주문이 요리 개편으로 취소되어 ${gold.toLocaleString("ko-KR")} 골드가 반환되었습니다.`,
          ],
        );
      }
    }
    await client.query(
      `UPDATE marketplace_buy_orders_v2
       SET status = 'cancelled', gold_escrow = 0, closed_at = now()
       WHERE status = 'active' AND kind = 'consumable' AND item_id LIKE 'food:%'`,
    );
    const recalledFoods = [...refunds.values()].reduce(
      (sum, entry) => sum + entry.recalledFoods,
      0,
    );
    await client.query(
      `INSERT INTO ops_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())`,
      [
        MARKER_KEY,
        JSON.stringify({
          completedAt: new Date().toISOString(),
          users: refunds.size,
          recalledFoods,
        }),
      ],
    );
    await client.query("COMMIT");
    return { skipped: false, recalledFoods, users: refunds.size };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
