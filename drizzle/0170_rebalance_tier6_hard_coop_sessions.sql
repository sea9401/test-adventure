WITH target_sessions AS MATERIALIZED (
  SELECT id, hp, max_hp
  FROM coop_boss_sessions
  WHERE region_id IN ('canyon_predator_hard', 'lake_sovereign_hard')
    AND defeated_at IS NULL
    AND max_hp = 14000000
),
scaled_contributors AS (
  UPDATE coop_boss_contributors AS contributor
  SET damage = GREATEST(
    0,
    ROUND(
      contributor.damage::numeric * 8400000 / target.max_hp
    )::integer
  )
  FROM target_sessions AS target
  WHERE contributor.session_id = target.id
  RETURNING contributor.session_id
)
UPDATE coop_boss_sessions AS session
SET
  hp = LEAST(
    8400000,
    GREATEST(
      0,
      ROUND(session.hp::numeric * 8400000 / target.max_hp)::integer
    )
  ),
  max_hp = 8400000
FROM target_sessions AS target
WHERE session.id = target.id;
