import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// 숨은 요리 레시피의 서버 최초 발견. recipe_id 고유 제약이 동시 발견 경쟁의 권위 판정이다.
export const cookingFirstDiscoveries = pgTable(
  "cooking_first_discoveries",
  {
    recipeId: text("recipe_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorName: text("actor_name").notNull(),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  },
  (t) => [index("cooking_first_discoveries_user_idx").on(t.userId, t.discoveredAt)],
);

// 오답 조합은 개인 세이브 JSON이 무한히 커지지 않도록 관계형 고유 키로 보관한다.
export const cookingFailedCombinations = pgTable(
  "cooking_failed_combinations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    comboHash: text("combo_hash").notNull(),
    method: text("method").notNull(),
    ingredientIds: jsonb("ingredient_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.comboHash] }),
    index("cooking_failed_combinations_created_idx").on(t.userId, t.createdAt),
    check("cooking_failed_combinations_hash_length", sql`length(${t.comboHash}) = 64`),
  ],
);
