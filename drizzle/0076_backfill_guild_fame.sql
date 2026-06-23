-- Custom SQL migration file, put your code below! --

-- 길드 명성(fame_total/fame_available) 근사 백필 — #1047 이전 누적 미적립분 보정.
--   #1047 이전엔 길드원이 명성(honor)을 벌어도 길드 누적 명성에 적립되지 않았다(소급 없음).
--   현재 길드원들의 개인 누적 명성(honorEarned·미설정이면 보유 honor 로 폴백 = guild/info 표기값)
--   합으로 fame_total 을 끌어올린다. GREATEST 라 절대 감소 없음. fame_available 도 같은 차액 가산.
--   ⚠️ 근사치: 탈퇴한 옛 길드원 기여분·각자 #1047 이전 소비분은 복구 불가.
--   🔒 멱등: 2회 실행 시 earned_sum == fame_total 이라 WHERE 가 걸러 차액 0.
UPDATE "guilds" g
SET
  "fame_available" =
    g."fame_available" + GREATEST(mf.earned_sum - g."fame_total", 0),
  "fame_total" = GREATEST(g."fame_total", mf.earned_sum)
FROM (
  SELECT
    gm."guild_id" AS guild_id,
    SUM(
      GREATEST(
        COALESCE(NULLIF(s."value" ->> 'honorEarned', '')::numeric, 0),
        COALESCE(NULLIF(s."value" ->> 'honor', '')::numeric, 0),
        0
      )
    )::int AS earned_sum
  FROM "guild_members" gm
  JOIN "saves_kv" s
    ON s."user_id" = gm."user_id" AND s."key" = 'character.v2'
  GROUP BY gm."guild_id"
) mf
WHERE mf.guild_id = g."id" AND mf.earned_sum > g."fame_total";
