-- v2 자동 솔로 길드 정리. 멤버 1명 + 점령 거점 0 인 길드를 모두 삭제.
-- guild_members 와 v2_guild_lineups/resources 등 종속 row 는 ON DELETE CASCADE 로 자동 정리.
-- 점령 거점이 있는 길드(다인이든 솔로든)는 보존.
DELETE FROM guilds
WHERE id IN (
  SELECT g.id
  FROM guilds g
  WHERE (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) <= 1
    AND NOT EXISTS (
      SELECT 1 FROM outpost_occupations WHERE occupied_by_guild_id = g.id
    )
);
