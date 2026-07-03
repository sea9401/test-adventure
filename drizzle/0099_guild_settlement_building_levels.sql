-- 길드 영지 건축물 보관 레벨.
-- 슬롯 압박/전쟁 점령으로 건물이 사라져도 같은 길드가 같은 건물을 다시 배치하면 최고 보관 레벨로 복구한다.
-- 길드 해산 시에는 guild FK cascade 로 함께 제거된다.
CREATE TABLE "guild_settlement_building_levels" (
  "guild_id" integer NOT NULL REFERENCES "guilds"("id") ON DELETE cascade,
  "building_id" text NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "guild_settlement_building_levels_guild_id_building_id_pk"
    PRIMARY KEY ("guild_id", "building_id")
);
